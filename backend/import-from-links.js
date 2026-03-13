/**
 * Phase 2: read a saved list of post shortcodes and import them into Supabase.
 *
 * - Downloads og:image for each post.
 * - Uploads to Storage bucket "instagram-posts" under posts/<shortcode>.jpg
 * - Upserts into public.posts by instagram_id (shortcode)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const BUCKET = "instagram-posts";
const POST_URL = (shortcode) => `https://www.instagram.com/p/${shortcode}/`;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function resizeForWidget(buffer, maxSize = 800) {
  return sharp(buffer)
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    if (path.includes(".png")) return "png";
    if (path.includes(".webp")) return "webp";
  } catch (_) {}
  return "jpg";
}

async function getPostImageAndCaption(page, shortcode) {
  const url = POST_URL(shortcode);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
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
      .filter((x) => x.w >= 400 && x.h >= 400)
      .sort((a, b) => b.score - a.score);

    const ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") || null;

    return { imageUrl: scored[0]?.src || ogImage, caption: ogDesc };
  });

  return { imageUrl: result.imageUrl || null, caption: result.caption || null };
}

async function main() {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const filePath = process.env.LINKS_IN || "./post-links.json";
  const refreshExisting = (process.env.REFRESH_EXISTING || "").toLowerCase() === "true" || process.env.REFRESH_EXISTING === "1";

  const supabase = createClient(supabaseUrl, supabaseKey);
  const raw = await readFile(filePath, "utf8");
  const shortcodes = JSON.parse(raw);
  if (!Array.isArray(shortcodes)) throw new Error("LINKS_IN must be a JSON array of shortcodes.");

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const shortcode of shortcodes) {
    const { data: existing } = await supabase.from("posts").select("id").eq("instagram_id", shortcode).maybeSingle();
    if (existing && !refreshExisting) {
      skipped++;
      continue;
    }

    try {
      const { imageUrl, caption } = await getPostImageAndCaption(page, shortcode);
      if (!imageUrl) {
        failed++;
        continue;
      }

      const imageBytes = await downloadImage(imageUrl);
      const toUpload = await resizeForWidget(imageBytes);
      const storagePath = `posts/${shortcode}.jpg`;

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, toUpload, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("posts").upsert(
        { instagram_id: shortcode, storage_path: storagePath, caption: caption || null, posted_at: null },
        { onConflict: "instagram_id" }
      );
      if (insertErr) throw insertErr;

      added++;
      if (added % 25 === 0) console.log(`Imported ${added}...`);
    } catch (e) {
      failed++;
      console.warn(`Failed ${shortcode}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`Done. Added=${added} Skipped=${skipped} Failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

