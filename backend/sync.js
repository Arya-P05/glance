/**
 * Instagram → Supabase sync job.
 * Single account (INSTAGRAM_USERNAME). Run once with --bulk for full import, then weekly without for new posts.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const BUCKET = "instagram-posts";
const PROFILE_URL = (username) => `https://www.instagram.com/${username}/`;
const POST_URL = (shortcode) => `https://www.instagram.com/p/${shortcode}/`;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseBool(v, defaultValue) {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}

async function maybeAcceptCookies(page) {
  const candidates = [
    /allow all cookies/i,
    /accept all/i,
    /allow cookies/i,
    /accept/i,
  ];

  for (const re of candidates) {
    const btn = page.getByRole("button", { name: re }).first();
    try {
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click({ timeout: 1000 });
        await page.waitForTimeout(1000);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

function extractShortcodesFromHtml(html) {
  const out = new Set();

  // 1) URLs in HTML/JS
  for (const m of html.matchAll(/\/p\/([A-Za-z0-9_-]+)/g)) out.add(m[1]);

  // 2) Embedded JSON often contains "shortcode":"XYZ"
  for (const m of html.matchAll(/\"shortcode\":\"([A-Za-z0-9_-]+)\"/g)) out.add(m[1]);

  return Array.from(out);
}

function extractShortcodesFromJsonPayload(payload) {
  const out = new Set();
  const seen = new Set();

  function walk(node) {
    if (node == null) return;
    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    // Instagram sometimes uses "shortcode" or "code" depending on endpoint.
    if (typeof node.shortcode === "string" && node.shortcode.length >= 5) out.add(node.shortcode);
    if (typeof node.code === "string" && node.code.length >= 5) out.add(node.code);

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    for (const v of Object.values(node)) walk(v);
  }

  walk(payload);
  return Array.from(out);
}

async function scrapePostShortcodes(page, profileUrl, maxPosts) {
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await maybeAcceptCookies(page);

  const finalUrl = page.url();
  if (finalUrl.includes("/accounts/login") || finalUrl.includes("/challenge")) {
    console.warn(`Hit login/challenge wall (${finalUrl}). Will try HTML fallback anyway.`);
  }

  const shortcodes = new Set();
  let previousCount = 0;
  let stableCount = 0;
  const maxStableRounds = 12;
  let maxScrollRounds = maxPosts ? Math.ceil(maxPosts / 6) + 10 : 250;

  const responseHandler = async (res) => {
    const url = res.url();
    if (!url.includes("instagram.com")) return;
    if (!url.includes("graphql") && !url.includes("/api/v1/")) return;

    try {
      // Instagram frequently serves JSON with content-type "text/javascript".
      // For GraphQL/XHR endpoints, attempt JSON parsing regardless of content-type.
      const json = await res.json();
      const found = extractShortcodesFromJsonPayload(json);
      if (found.length) {
        found.forEach((s) => shortcodes.add(s));
        if (process.env.DEBUG_NETWORK === "true" || process.env.DEBUG_NETWORK === "1") {
          console.log(`[net] +${found.length} shortcodes from ${url}`);
        }
      }
    } catch (_) {
      // ignore parse failures
    }
  };

  page.on("response", responseHandler);

  while (true) {
    const links = await page.$$eval('a[href^="/p/"]', (anchors) =>
      anchors.map((a) => {
        const m = a.getAttribute("href").match(/^\/p\/([^/?#]+)/);
        return m ? m[1] : null;
      })
    );
    links.filter(Boolean).forEach((s) => shortcodes.add(s));

    // Fallback: if DOM anchors are empty, try extracting from HTML.
    if (shortcodes.size === 0) {
      try {
        const html = await page.content();
        extractShortcodesFromHtml(html).forEach((s) => shortcodes.add(s));
      } catch (_) {}
    }

    if (maxPosts && shortcodes.size >= maxPosts) break;
    if (shortcodes.size === previousCount) {
      stableCount++;
      if (stableCount >= maxStableRounds) break;
    } else {
      stableCount = 0;
    }
    previousCount = shortcodes.size;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    try {
      await page.waitForLoadState("networkidle", { timeout: 3000 });
    } catch (_) {}
    await page.waitForTimeout(1200);

    if (--maxScrollRounds <= 0) break;
  }

  page.off("response", responseHandler);
  return Array.from(shortcodes);
}

async function getPostImageAndCaption(page, shortcode) {
  const url = POST_URL(shortcode);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    // Pick the largest rendered image on the page to avoid avatar/thumb URLs.
    const imgs = Array.from(document.querySelectorAll("img"));
    const scored = imgs
      .map((img) => {
        const src = img.getAttribute("src");
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        const score = w * h;
        return src ? { src, w, h, score } : null;
      })
      .filter(Boolean)
      // ignore tiny icons/avatars
      .filter((x) => x.w >= 400 && x.h >= 400)
      .sort((a, b) => b.score - a.score);

    // Fallback to og:image if no img tags were found.
    const ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") || null;

    return {
      imageUrl: scored[0]?.src || ogImage,
      caption: ogDesc,
    };
  });

  return { imageUrl: result.imageUrl || null, caption: result.caption || null };
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Resize image so longest side is at most maxSize; output JPEG for widget-safe size. */
async function resizeForWidget(buffer, maxSize = 800) {
  return sharp(buffer)
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    if (path.includes(".jpg") || path.includes("jpeg")) return "jpg";
    if (path.includes(".png")) return "png";
    if (path.includes(".webp")) return "webp";
  } catch (_) {}
  return "jpg";
}

async function main() {
  const username = env("INSTAGRAM_USERNAME");
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const maxPosts = process.env.MAX_POSTS ? parseInt(process.env.MAX_POSTS, 10) : null;
  const bulk = process.argv.includes("--bulk");
  const headless = parseBool(process.env.HEADLESS, true);
  const instagramSessionIdRaw = process.env.INSTAGRAM_SESSIONID || null;
  const instagramCookiesPath = process.env.INSTAGRAM_COOKIES_PATH || null;
  const instagramSessionId = (() => {
    if (!instagramSessionIdRaw) return null;
    // Some copy/pastes end up URL-encoded (e.g. %3A for ':'). Decode if needed.
    if (instagramSessionIdRaw.includes("%")) {
      try {
        return decodeURIComponent(instagramSessionIdRaw);
      } catch (_) {
        return instagramSessionIdRaw;
      }
    }
    return instagramSessionIdRaw;
  })();

  const supabase = createClient(supabaseUrl, supabaseKey);
  const profileUrl = PROFILE_URL(username);
  const refreshExisting = parseBool(process.env.REFRESH_EXISTING, false);

  const targetCount = bulk ? maxPosts : maxPosts || 20;
  console.log(
    `Scraping @${username} (bulk=${bulk}, headless=${headless}, targetPosts=${targetCount ?? "all"}, hasSession=${!!instagramSessionId}, hasCookiesFile=${!!instagramCookiesPath})...`
  );

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
    // Use an existing logged-in browser session (sessionid cookie) to avoid the logged-out public post limit.
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
    // Load a full cookie jar exported from a browser extension (JSON array) to be maximally "logged in".
    // Expected format: array of cookies with at least { name, value, domain, path }.
    const raw = await readFile(instagramCookiesPath, "utf8");
    const cookies = JSON.parse(raw);
    if (!Array.isArray(cookies)) throw new Error("INSTAGRAM_COOKIES_PATH must point to a JSON array of cookies");

    const normalizeSameSite = (v) => {
      const s = String(v ?? "").toLowerCase();
      if (s === "strict") return "Strict";
      if (s === "lax") return "Lax";
      // Chrome export uses "no_restriction" for SameSite=None
      if (s === "none" || s === "no_restriction") return "None";
      return "Lax";
    };

    const maybeDecode = (value) => {
      if (typeof value !== "string") return value;
      if (!value.includes("%")) return value;
      try {
        return decodeURIComponent(value);
      } catch (_) {
        return value;
      }
    };

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
        // Many exporters use expirationDate (seconds since epoch).
        ...(typeof c.expirationDate === "number" ? { expires: c.expirationDate } : {}),
      }));

    await context.addCookies(normalized);
  }

  const page = await context.newPage();

  try {
    const shortcodes = await scrapePostShortcodes(page, profileUrl, targetCount);
    console.log(`Found ${shortcodes.length} post shortcodes.`);

    let added = 0;
    let skipped = 0;

    for (const shortcode of shortcodes) {
      const { data: existing } = await supabase
        .from("posts")
        .select("id")
        .eq("instagram_id", shortcode)
        .maybeSingle();

      if (existing && !bulk && !refreshExisting) {
        skipped++;
        continue;
      }
      if (existing && bulk && !refreshExisting) {
        skipped++;
        continue;
      }

      let imageUrl;
      let caption;
      try {
        const meta = await getPostImageAndCaption(page, shortcode);
        imageUrl = meta.imageUrl;
        caption = meta.caption;
      } catch (e) {
        console.warn(`Skip post ${shortcode}: ${e.message}`);
        skipped++;
        continue;
      }

      if (!imageUrl) {
        console.warn(`No image for ${shortcode}, skip.`);
        skipped++;
        continue;
      }

      const imageBytes = await downloadImage(imageUrl);
      const toUpload = await resizeForWidget(imageBytes);
      const storagePath = `posts/${shortcode}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, toUpload, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadErr) {
        console.warn(`Upload failed ${shortcode}:`, uploadErr.message);
        skipped++;
        continue;
      }

      const { error: insertErr } = await supabase.from("posts").upsert(
        {
          instagram_id: shortcode,
          storage_path: storagePath,
          caption: caption || null,
          posted_at: null,
        },
        { onConflict: "instagram_id" }
      );

      if (insertErr) {
        console.warn(`Insert failed ${shortcode}:`, insertErr.message);
        skipped++;
        continue;
      }

      added++;
      console.log(`  + ${shortcode}`);
    }

    console.log(`Done. Added: ${added}, Skipped: ${skipped}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
