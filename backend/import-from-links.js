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
import { BUCKET, downloadImage, getPostImageAndCaption, resizeForWidget } from "./instagram-helper.js";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
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
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const shortcode of shortcodes) {
    const { data: existing } = await supabase.from("posts").select("id").eq("instagram_id", shortcode).maybeSingle();
    if (existing && !refreshExisting) {
      skipped++;
      continue;
    }

    const page = await context.newPage();
    try {
      const { imageUrl, caption } = await getPostImageAndCaption(page, shortcode, "p");
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
    } finally {
      await page.close().catch(() => {});
    }
  }

  await browser.close();
  console.log(`Done. Added=${added} Skipped=${skipped} Failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

