/**
 * Publish drafts to the Supabase active pool.
 *
 * Reads content/drafts/*.json files, finds unpublished ones,
 * uploads images to Supabase Storage, and inserts into posts table.
 *
 * Examples:
 *   npm run publish                    list unpublished drafts
 *   npm run publish -- --all           publish all unpublished
 *   npm run publish -- --count 5       publish 5 oldest
 *   npm run publish -- --id poster_xxx publish one by name
 *   npm run publish -- --dry-run       show what would be published
 */
import "dotenv/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BUCKET, POST_PREFIX, resizeForWidget } from "./instagram-helper.js";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-env.js";

const DRAFTS_DIR = "content/drafts";
const META_DIR = "content/meta";

function parseArgs(argv) {
  const out = {
    all: false,
    count: null,
    id: null,
    draftsDir: DRAFTS_DIR,
    metaDir: META_DIR,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--all") out.all = true;
    else if (arg === "--count" || arg === "-n") out.count = Number(next());
    else if (arg === "--id") out.id = next();
    else if (arg === "--drafts-dir") out.draftsDir = next();
    else if (arg === "--meta-dir") out.metaDir = next();
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (out.count !== null && (!Number.isInteger(out.count) || out.count < 1)) {
    throw new Error("--count must be a positive integer");
  }

  return out;
}

function usage() {
  return `Usage:
  npm run publish                    list unpublished drafts
  npm run publish -- --all           publish all unpublished drafts
  npm run publish -- --count 5       publish 5 oldest unpublished
  npm run publish -- --id <name>     publish one draft by name
  npm run publish -- --dry-run       preview without uploading
`;
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

async function withProgress(label, task) {
  const frames = ["-", "\\", "|", "/"];
  const startedAt = Date.now();
  const isInteractive = process.stdout.isTTY;
  let frame = 0;
  let timer = null;

  if (isInteractive) {
    timer = setInterval(() => {
      const elapsed = formatElapsed(Date.now() - startedAt);
      process.stdout.write(`\r${frames[frame]} ${label} (${elapsed})`);
      frame = (frame + 1) % frames.length;
    }, 120);
  } else {
    console.log(`${label}...`);
  }

  try {
    const result = await task();
    const elapsed = formatElapsed(Date.now() - startedAt);
    if (timer) clearInterval(timer);
    if (isInteractive) process.stdout.write(`\r\x1b[Kok ${label} (${elapsed})\n`);
    else console.log(`ok ${label} (${elapsed})`);
    return result;
  } catch (e) {
    const elapsed = formatElapsed(Date.now() - startedAt);
    if (timer) clearInterval(timer);
    if (isInteractive) process.stdout.write(`\r\x1b[Kfailed ${label} (${elapsed})\n`);
    else console.log(`failed ${label} (${elapsed})`);
    throw e;
  }
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function getUnpublishedDrafts(draftsDir, metaDir) {
  let files;
  try {
    files = await readdir(metaDir);
  } catch {
    return [];
  }

  const jsonFiles = files
    .filter((f) => f.endsWith(".json") && /^poster_/.test(f))
    .sort();

  const drafts = [];
  for (const file of jsonFiles) {
    const jsonPath = join(metaDir, file);
    let data;
    try {
      data = JSON.parse(await readFile(jsonPath, "utf8"));
    } catch {
      continue;
    }

    if (data.publishedAt) continue;

    const name = file.replace(/\.json$/, "");
    const imagePath = join(draftsDir, `${name}.png`);

    drafts.push({ name, jsonPath, imagePath, data });
  }

  return drafts;
}

async function publishDraft({ supabase, draft, dryRun }) {
  const { name, imagePath, jsonPath, data } = draft;
  const storagePath = `${POST_PREFIX}/${name}.jpg`;

  if (!dryRun) {
    const imageBytes = await readFile(imagePath);
    const resized = await resizeForWidget(imageBytes);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, resized, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) throw uploadErr;

    const caption = data.caption
      ? `${data.caption.smallText} ${data.caption.bigText}`
      : null;

    const { error: insertErr } = await supabase.from("posts").upsert(
      {
        instagram_id: `generated_${name}`,
        storage_path: storagePath,
        caption,
        posted_at: null,
        status: "active",
      },
      { onConflict: "instagram_id" }
    );
    if (insertErr) throw insertErr;

    // Mark as published in the local JSON
    await writeFile(jsonPath, JSON.stringify({ ...data, publishedAt: new Date().toISOString(), storagePath }, null, 2));
  }

  return storagePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const allDrafts = await getUnpublishedDrafts(args.draftsDir, args.metaDir);

  // List mode: no publish flags given
  if (!args.all && args.count === null && !args.id) {
    if (allDrafts.length === 0) {
      console.log(`No unpublished drafts in ${args.draftsDir}/`);
      console.log(`\nGenerate some first: npm run gen -- --count 10`);
    } else {
      console.log(`${allDrafts.length} unpublished draft${allDrafts.length === 1 ? "" : "s"} in ${args.draftsDir}/:\n`);
      for (const d of allDrafts) {
        const caption = d.data.caption
          ? `  "${d.data.caption.smallText} ${d.data.caption.bigText}"`
          : "  (no caption)";
        const scene = d.data.scene ? `  ${d.data.scene.subject} / ${d.data.scene.setting}` : "";
        console.log(`  ${d.name}${scene}${caption}`);
      }
      console.log(`\nPublish all:    npm run publish -- --all`);
      console.log(`Publish some:   npm run publish -- --count 5`);
      console.log(`Publish one:    npm run publish -- --id <name>`);
    }
    return;
  }

  // Select which drafts to publish
  let toPublish;
  if (args.id) {
    toPublish = allDrafts.filter((d) => d.name === args.id);
    if (toPublish.length === 0) {
      const known = allDrafts.map((d) => d.name).join(", ") || "none";
      throw new Error(`Draft not found: ${args.id}\nUnpublished drafts: ${known}`);
    }
  } else if (args.count !== null) {
    toPublish = allDrafts.slice(0, args.count);
  } else {
    toPublish = allDrafts;
  }

  if (toPublish.length === 0) {
    console.log("Nothing to publish.");
    return;
  }

  const supabase = args.dryRun
    ? null
    : createClient(supabaseUrl(), supabaseServiceRoleKey());

  console.log(
    args.dryRun
      ? `Dry run — would publish ${toPublish.length} draft${toPublish.length === 1 ? "" : "s"}:\n`
      : `Publishing ${toPublish.length} draft${toPublish.length === 1 ? "" : "s"} to Supabase...\n`
  );

  const startedAt = Date.now();
  let published = 0;
  let failed = 0;

  for (const draft of toPublish) {
    const prefix = `[${published + failed + 1}/${toPublish.length}]`;
    const captionStr = draft.data.caption
      ? `"${draft.data.caption.smallText} ${draft.data.caption.bigText}"`
      : "(no caption)";

    if (args.dryRun) {
      console.log(`  ${draft.name}`);
      console.log(`    scene:   ${draft.data.scene?.subject} / ${draft.data.scene?.setting}`);
      console.log(`    caption: ${captionStr}`);
      console.log(`    image:   ${draft.imagePath}`);
      console.log("");
      published++;
      continue;
    }

    try {
      const storagePath = await withProgress(
        `${prefix} ${draft.name} ${captionStr}`,
        () => publishDraft({ supabase, draft, dryRun: false })
      );
      console.log(`${prefix} → ${storagePath}\n`);
      published++;
    } catch (e) {
      failed++;
      console.error(`${prefix} failed: ${e.message || e}\n`);
    }
  }

  const elapsed = formatElapsed(Date.now() - startedAt);
  console.log(
    args.dryRun
      ? `Dry run: ${published} would be published.`
      : `Done: ${published} published, ${failed} failed in ${elapsed}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
