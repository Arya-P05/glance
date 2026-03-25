/**
 * Shared Instagram post fetching (Playwright) + image download/resize for sync/admin.
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

export const BUCKET = "instagram-posts";
export const POST_PREFIX = "posts";

/** Public post or reel URL (reels must use /reel/ or you often get the wrong/stale view). */
export function instagramPostUrl(shortcode, kind = "p") {
  const seg = kind === "reel" ? "reel" : "p";
  return `https://www.instagram.com/${seg}/${shortcode}/`;
}

/** Extract shortcode from a line or URL (supports /p/ and /reel/). */
export function extractShortcodeFromLine(line) {
  const s = String(line).trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** One entry per pasted line with correct /p/ vs /reel/ for navigation. */
export function parsePostTargetsFromInput(text) {
  const lines = String(text).split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(/instagram\.com\/(p|reel)\/([^/?#]+)/i);
    if (!m) continue;
    const kind = m[1].toLowerCase() === "reel" ? "reel" : "p";
    const shortcode = m[2];
    const key = `${kind}:${shortcode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ shortcode, kind });
  }
  return out;
}

/** @deprecated use parsePostTargetsFromInput — list of shortcodes only, all use /p/ */
export function parseShortcodesFromInput(text) {
  return parsePostTargetsFromInput(text).map((t) => t.shortcode);
}

export async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function resizeForWidget(buffer, maxSize = 800) {
  return sharp(buffer)
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Smaller JPEG for admin UI preview payloads. */
export async function resizeForPreview(buffer, maxSize = 480) {
  return sharp(buffer)
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * @param kind - "p" or "reel" (must match the link type or Instagram may reuse the wrong document).
 */
export async function getPostImageAndCaption(page, shortcode, kind = "p") {
  const url = instagramPostUrl(shortcode, kind);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") || null;

    const isJunkUrl = (src) => {
      if (!src || src.length < 12) return true;
      const u = src.toLowerCase();
      if (u.includes("rsrc.php")) return true;
      if (u.includes("static.cdninstagram.com")) return true;
      return false;
    };

    const looksLikeCdnImg = (src) => {
      if (isJunkUrl(src)) return false;
      const u = src.toLowerCase();
      return u.includes("cdninstagram") || u.includes("fbcdn.net") || u.includes("instagram.com");
    };

    // Prefer og:image first — it is usually unique per post; largest <img> is often shared UI chrome.
    let imageUrl = null;
    if (ogImage && !isJunkUrl(ogImage)) {
      imageUrl = ogImage;
    }

    if (!imageUrl) {
      const imgs = Array.from(document.querySelectorAll("img"));
      const scored = imgs
        .map((img) => {
          const src = img.getAttribute("src");
          const w = img.naturalWidth || 0;
          const h = img.naturalHeight || 0;
          const score = w * h;
          return src && looksLikeCdnImg(src) ? { src, w, h, score } : null;
        })
        .filter(Boolean)
        .filter((x) => x.w >= 200 && x.h >= 200)
        .sort((a, b) => b.score - a.score);

      imageUrl = scored[0]?.src || null;
    }

    if (!imageUrl && ogImage) {
      imageUrl = ogImage;
    }

    return { imageUrl, caption: ogDesc };
  });

  return { imageUrl: result.imageUrl || null, caption: result.caption || null };
}

function normalizeSameSite(v) {
  const s = String(v ?? "").toLowerCase();
  if (s === "strict") return "Strict";
  if (s === "lax") return "Lax";
  if (s === "none" || s === "no_restriction") return "None";
  return "Lax";
}

function maybeDecode(value) {
  if (typeof value !== "string") return value;
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

/**
 * Launch browser + context with optional INSTAGRAM_SESSIONID / INSTAGRAM_COOKIES_PATH (same as sync).
 * Caller must browser.close() when done.
 */
export async function createInstagramBrowser() {
  const headless = (process.env.HEADLESS || "true").toLowerCase() !== "false";
  const instagramSessionId = process.env.INSTAGRAM_SESSIONID || "";
  const instagramCookiesPath = process.env.INSTAGRAM_COOKIES_PATH || "";

  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  if (instagramSessionId) {
    await context.addCookies([
      {
        name: "sessionid",
        value: instagramSessionId,
        domain: ".instagram.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  }

  if (instagramCookiesPath) {
    const raw = await readFile(instagramCookiesPath, "utf8");
    const cookies = JSON.parse(raw);
    if (!Array.isArray(cookies)) throw new Error("INSTAGRAM_COOKIES_PATH must be a JSON array");
    const normalized = cookies
      .filter((c) => c && typeof c.name === "string" && typeof c.value === "string")
      .map((c) => ({
        name: c.name,
        value: maybeDecode(c.value),
        domain: c.domain || ".instagram.com",
        path: c.path || "/",
        httpOnly: !!c.httpOnly,
        secure: c.secure !== false,
        sameSite: normalizeSameSite(c.sameSite),
        ...(typeof c.expirationDate === "number" ? { expires: c.expirationDate } : {}),
      }));
    await context.addCookies(normalized);
  }

  return { browser, context };
}
