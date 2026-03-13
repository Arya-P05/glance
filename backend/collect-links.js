/**
 * Phase 1: open a logged-in browser session, scroll the profile, and save post shortcodes to a file.
 *
 * Output: JSON array of shortcodes (e.g. ["ABC123", ...]).
 */
import "dotenv/config";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

const PROFILE_URL = (username) => `https://www.instagram.com/${username}/`;

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
  const candidates = [/allow all cookies/i, /accept all/i, /allow cookies/i, /accept/i];
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

function extractShortcodesFromJsonPayload(payload) {
  const out = new Set();
  const seen = new Set();
  function walk(node) {
    if (node == null) return;
    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

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

async function loadCookiesIntoContext(context, cookiePath) {
  const normalizeSameSite = (v) => {
    const s = String(v ?? "").toLowerCase();
    if (s === "strict") return "Strict";
    if (s === "lax") return "Lax";
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

  const raw = await readFile(cookiePath, "utf8");
  const cookies = JSON.parse(raw);
  if (!Array.isArray(cookies)) throw new Error("Cookie export must be a JSON array.");

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

async function main() {
  const username = env("INSTAGRAM_USERNAME");
  const headless = parseBool(process.env.HEADLESS, false); // default headed so you can see it
  const cookiePath = process.env.INSTAGRAM_COOKIES_PATH || null;
  const outPath = process.env.LINKS_OUT || "./post-links.json";
  const maxPosts = process.env.MAX_POSTS ? parseInt(process.env.MAX_POSTS, 10) : 500;

  const browser = await chromium.launch({ headless, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  if (cookiePath) await loadCookiesIntoContext(context, cookiePath);

  const page = await context.newPage();
  const profileUrl = PROFILE_URL(username);
  const shortcodes = new Set();

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("instagram.com")) return;
    if (!url.includes("graphql") && !url.includes("/api/v1/")) return;
    try {
      const json = await res.json();
      extractShortcodesFromJsonPayload(json).forEach((s) => shortcodes.add(s));
    } catch (_) {}
  });

  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await maybeAcceptCookies(page);

  // Keep scrolling until we hit maxPosts or it stops growing.
  let previous = 0;
  let stable = 0;
  while (shortcodes.size < maxPosts) {
    // grab anchors too (sometimes present)
    const links = await page.$$eval('a[href^="/p/"]', (anchors) =>
      anchors
        .map((a) => {
          const m = a.getAttribute("href")?.match(/^\/p\/([^/?#]+)/);
          return m ? m[1] : null;
        })
        .filter(Boolean)
    );
    links.forEach((s) => shortcodes.add(s));

    if (shortcodes.size === previous) stable++;
    else stable = 0;
    previous = shortcodes.size;
    if (stable >= 12) break;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }

  const arr = Array.from(shortcodes);
  await writeFile(outPath, JSON.stringify(arr, null, 2));
  console.log(`Saved ${arr.length} post shortcodes to ${outPath}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

