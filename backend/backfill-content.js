/**
 * Backfill pre-migration generated content into Supabase.
 *
 * Loads:
 * - content/drafts/*.png + content/meta/*.json as public.drafts(status='draft')
 * - content/discarded/*.png + *.json as public.drafts(status='discarded')
 * - content/prompts/*.json as public.prompts
 * - content/backgrounds/*.png as drafts.raw_storage_path when names match
 *
 * Examples:
 *   npm run backfill-content -- --dry-run
 *   npm run backfill-content
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { BUCKET, DRAFT_PREFIX } from "./instagram-helper.js";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-env.js";

const CONTENT_DIR = "content";
const DRAFTS_DIR = join(CONTENT_DIR, "drafts");
const META_DIR = join(CONTENT_DIR, "meta");
const PROMPTS_DIR = join(CONTENT_DIR, "prompts");
const BACKGROUNDS_DIR = join(CONTENT_DIR, "backgrounds");
const DISCARDED_DIR = join(CONTENT_DIR, "discarded");

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listFiles(dir, suffix) {
  if (!(await exists(dir))) return [];
  return (await readdir(dir)).filter((file) => file.endsWith(suffix)).sort();
}

function nameFromFile(file, suffix) {
  return file.slice(0, -suffix.length);
}

function compactRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

async function upsertWithSchemaFallback(supabase, table, row, { onConflict, optionalColumns }) {
  let nextRow = row;
  let remainingOptional = new Set(optionalColumns);

  for (;;) {
    const { error } = await supabase.from(table).upsert(nextRow, { onConflict });
    if (!error) return;

    const message = error.message || "";
    const missingColumn = [...remainingOptional].find((column) =>
      message.includes(`'${column}'`) || message.includes(`column ${column}`)
    );
    if (!missingColumn) throw error;

    remainingOptional.delete(missingColumn);
    const { [missingColumn]: _missing, ...stripped } = nextRow;
    nextRow = stripped;
  }
}

async function uploadFile(supabase, { localPath, storagePath, contentType, dryRun }) {
  if (dryRun) return storagePath;
  const bytes = await readFile(localPath);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return storagePath;
}

async function upsertDraft(supabase, { name, imagePath, metaPath, rawPath, status, dryRun }) {
  const metadata = await readJson(metaPath);
  const storagePath = `${DRAFT_PREFIX}/${name}.png`;
  const metaStoragePath = `${DRAFT_PREFIX}/meta/${name}.json`;
  const promptTextPath = metaPath.replace(/\.json$/, ".txt");
  const promptTextStoragePath = `${DRAFT_PREFIX}/meta/${name}.txt`;
  const rawStoragePath = rawPath ? `${DRAFT_PREFIX}/backgrounds/${name}.png` : null;

  if (!dryRun) {
    await uploadFile(supabase, {
      localPath: imagePath,
      storagePath,
      contentType: "image/png",
      dryRun,
    });
    if (rawPath) {
      await uploadFile(supabase, {
        localPath: rawPath,
        storagePath: rawStoragePath,
        contentType: "image/png",
        dryRun,
      });
    }
    await uploadFile(supabase, {
      localPath: metaPath,
      storagePath: metaStoragePath,
      contentType: "application/json",
      dryRun,
    });
    if (await exists(promptTextPath)) {
      await uploadFile(supabase, {
        localPath: promptTextPath,
        storagePath: promptTextStoragePath,
        contentType: "text/plain",
        dryRun,
      });
    }

    await upsertWithSchemaFallback(supabase, "drafts",
      compactRow({
        name,
        storage_path: storagePath,
        caption: metadata.caption ?? null,
        scene: metadata.scene ?? null,
        image_prompt: metadata.scenePrompt ?? metadata.prompt ?? null,
        metadata,
        raw_storage_path: rawStoragePath,
        image_model: metadata.imageModel ?? null,
        caption_model: metadata.captionModel ?? null,
        prompt_model: metadata.promptModel ?? null,
        status,
      }),
      { onConflict: "name", optionalColumns: ["metadata", "raw_storage_path"] }
    );
  }

  return { name, storagePath, metaStoragePath, rawStoragePath, status };
}

async function upsertPrompt(supabase, { name, metaPath, dryRun }) {
  const metadata = await readJson(metaPath);
  const imagePromptPath = join(PROMPTS_DIR, `${name}.image-prompt.txt`);
  const imagePrompt = (await exists(imagePromptPath))
    ? await readFile(imagePromptPath, "utf8")
    : metadata.prompt ?? null;

  if (!dryRun) {
    await uploadFile(supabase, {
      localPath: metaPath,
      storagePath: `${DRAFT_PREFIX}/prompts/${name}.json`,
      contentType: "application/json",
      dryRun,
    });
    if (await exists(imagePromptPath)) {
      await uploadFile(supabase, {
        localPath: imagePromptPath,
        storagePath: `${DRAFT_PREFIX}/prompts/${name}.image-prompt.txt`,
        contentType: "text/plain",
        dryRun,
      });
    }

    await upsertWithSchemaFallback(supabase, "prompts",
      {
        name,
        scene: metadata.scene ?? null,
        image_prompt: imagePrompt,
        prompt_model: metadata.promptModel ?? null,
        metadata,
      },
      { onConflict: "name", optionalColumns: ["metadata"] }
    );
  }

  return { name };
}

async function backfillDraftFolder(supabase, { imageDir, metaDir, status, dryRun }) {
  const imageFiles = await listFiles(imageDir, ".png");
  const rows = [];
  const skipped = [];

  for (const file of imageFiles) {
    const name = nameFromFile(file, ".png");
    if (name === "output") {
      skipped.push({ name, reason: "scratch output image" });
      continue;
    }

    const metaPath = join(metaDir, `${name}.json`);
    if (!(await exists(metaPath))) {
      skipped.push({ name, reason: "missing metadata json" });
      continue;
    }

    const rawPath = await exists(join(BACKGROUNDS_DIR, `${name}.png`))
      ? join(BACKGROUNDS_DIR, `${name}.png`)
      : null;
    rows.push(await upsertDraft(supabase, {
      name,
      imagePath: join(imageDir, file),
      metaPath,
      rawPath,
      status,
      dryRun,
    }));
  }

  return { rows, skipped };
}

async function backfillPrompts(supabase, { dryRun }) {
  const files = await listFiles(PROMPTS_DIR, ".json");
  const rows = [];
  for (const file of files) {
    rows.push(await upsertPrompt(supabase, {
      name: nameFromFile(file, ".json"),
      metaPath: join(PROMPTS_DIR, file),
      dryRun,
    }));
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  npm run backfill-content -- --dry-run
  npm run backfill-content
`);
    return;
  }

  const supabase = createClient(supabaseUrl(), supabaseServiceRoleKey());
  const draftResult = await backfillDraftFolder(supabase, {
    imageDir: DRAFTS_DIR,
    metaDir: META_DIR,
    status: "draft",
    dryRun: args.dryRun,
  });
  const discardedResult = await backfillDraftFolder(supabase, {
    imageDir: DISCARDED_DIR,
    metaDir: DISCARDED_DIR,
    status: "discarded",
    dryRun: args.dryRun,
  });
  const prompts = await backfillPrompts(supabase, { dryRun: args.dryRun });

  const action = args.dryRun ? "Would backfill" : "Backfilled";
  console.log(`${action} ${draftResult.rows.length} draft image(s).`);
  console.log(`${action} ${discardedResult.rows.length} discarded draft image(s).`);
  console.log(`${action} ${prompts.length} prompt(s).`);

  const skipped = [...draftResult.skipped, ...discardedResult.skipped];
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} file(s):`);
    for (const item of skipped) console.log(`  ${item.name}: ${item.reason}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
