/**
 * Publish drafts from the Supabase drafts table to the active posts pool.
 *
 * Examples:
 *   npm run publish                    list unpublished drafts
 *   npm run publish -- --all           publish all
 *   npm run publish -- --count 5       publish 5 oldest
 *   npm run publish -- --id poster_xxx publish one by name
 *   npm run publish -- --dry-run       preview without uploading
 *   npm run publish -- --status inactive  save to pool as inactive
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { publishDraftFromDb } from "./publish-draft.js";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-env.js";

function parseArgs(argv) {
  const out = {
    all: false,
    count: null,
    id: null,
    dryRun: false,
    status: "active",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--all") out.all = true;
    else if (arg === "--count" || arg === "-n") out.count = Number(next());
    else if (arg === "--id") out.id = next();
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--status") out.status = next();
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (out.count !== null && (!Number.isInteger(out.count) || out.count < 1)) {
    throw new Error("--count must be a positive integer");
  }

  return out;
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

async function getUnpublishedDrafts(supabase, { id, count }) {
  let query = supabase
    .from("drafts")
    .select("id, name, storage_path, caption, scene, metadata")
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (id) {
    query = query.eq("name", id);
  } else if (count !== null) {
    query = query.limit(count);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (id && (!data || data.length === 0)) {
    throw new Error(`Draft not found: ${id}`);
  }

  return data ?? [];
}

async function publishDraft({ supabase, draft, dryRun, status = "active" }) {
  if (dryRun) return `posts/${draft.name}.jpg`;
  return publishDraftFromDb(supabase, draft, { status });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  npm run publish                    list unpublished drafts
  npm run publish -- --all           publish all unpublished drafts
  npm run publish -- --count 5       publish 5 oldest unpublished
  npm run publish -- --id <name>     publish one draft by name
  npm run publish -- --dry-run       preview without uploading
`);
    return;
  }

  const supabase = createClient(supabaseUrl(), supabaseServiceRoleKey());

  const allDrafts = await getUnpublishedDrafts(supabase, {
    id: args.id,
    count: args.count,
  });

  if (!args.all && args.count === null && !args.id) {
    if (allDrafts.length === 0) {
      console.log("No unpublished drafts.");
      console.log("\nGenerate some first: npm run gen -- --count 10");
    } else {
      console.log(`${allDrafts.length} unpublished draft${allDrafts.length === 1 ? "" : "s"}:\n`);
      for (const d of allDrafts) {
        const caption = d.caption
          ? `  "${d.caption.smallText} ${d.caption.bigText}"`
          : "  (no caption)";
        const scene = d.scene ? `  ${d.scene.subject} / ${d.scene.setting}` : "";
        console.log(`  ${d.name}${scene}${caption}`);
      }
      console.log(`\nPublish all:    npm run publish -- --all`);
      console.log(`Publish some:   npm run publish -- --count 5`);
      console.log(`Publish one:    npm run publish -- --id <name>`);
    }
    return;
  }

  let toPublish = allDrafts;

  if (toPublish.length === 0) {
    console.log("Nothing to publish.");
    return;
  }

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
    const captionStr = draft.caption
      ? `"${draft.caption.smallText} ${draft.caption.bigText}"`
      : "(no caption)";

    if (args.dryRun) {
      console.log(`  ${draft.name}`);
      console.log(`    scene:   ${draft.scene?.subject} / ${draft.scene?.setting}`);
      console.log(`    caption: ${captionStr}`);
      console.log("");
      published++;
      continue;
    }

    try {
      const storagePath = await withProgress(
        `${prefix} ${draft.name} ${captionStr}`,
        () => publishDraft({ supabase, draft, dryRun: false, status: args.status })
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
