/**
 * Move drafts to content/discarded/ so they're out of the publish queue.
 *
 * Examples:
 *   npm run discard                    list current drafts
 *   npm run discard -- --id <name>     discard one
 *   npm run discard -- --count 5       discard first 5
 *   npm run discard -- --all           discard everything
 */
import { readdir, readFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DRAFTS_DIR = "content/drafts";
const META_DIR = "content/meta";
const DISCARDED_DIR = "content/discarded";

function parseArgs(argv) {
  const out = { all: false, count: null, id: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--all") out.all = true;
    else if (arg === "--count" || arg === "-n") out.count = Number(next());
    else if (arg === "--id") out.id = next();
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

async function getDrafts() {
  let files;
  try {
    files = await readdir(META_DIR);
  } catch {
    return [];
  }

  const drafts = [];
  for (const file of files.filter((f) => f.endsWith(".json") && /^poster_/.test(f)).sort()) {
    let data;
    try {
      data = JSON.parse(await readFile(join(META_DIR, file), "utf8"));
    } catch {
      continue;
    }
    if (data.publishedAt || data.discardedAt) continue;
    const name = file.replace(/\.json$/, "");
    drafts.push({ name, data });
  }

  return drafts;
}

async function moveFile(src, dst) {
  try {
    await rename(src, dst);
  } catch {
    // file may not exist (e.g. no background for this draft) — skip silently
  }
}

async function discardDraft(name) {
  await mkdir(DISCARDED_DIR, { recursive: true });

  await moveFile(join(DRAFTS_DIR, `${name}.png`), join(DISCARDED_DIR, `${name}.png`));
  await moveFile(join(META_DIR, `${name}.json`), join(DISCARDED_DIR, `${name}.json`));
  await moveFile(join(META_DIR, `${name}.txt`), join(DISCARDED_DIR, `${name}.txt`));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  npm run discard                    list drafts
  npm run discard -- --id <name>     discard one
  npm run discard -- --count 5       discard first 5
  npm run discard -- --all           discard all
`);
    return;
  }

  const drafts = await getDrafts();

  if (!args.all && args.count === null && !args.id) {
    if (drafts.length === 0) {
      console.log("No drafts.");
      return;
    }
    console.log(`${drafts.length} draft${drafts.length === 1 ? "" : "s"}:\n`);
    for (const d of drafts) {
      const caption = d.data.caption
        ? `  "${d.data.caption.smallText} ${d.data.caption.bigText}"`
        : "  (no caption)";
      console.log(`  ${d.name}  ${d.data.scene?.subject} / ${d.data.scene?.setting}${caption}`);
    }
    console.log(`\nDiscard one:  npm run discard -- --id <name>`);
    console.log(`Discard some: npm run discard -- --count 5`);
    console.log(`Publish all:  npm run publish -- --all`);
    return;
  }

  let toDiscard;
  if (args.id) {
    toDiscard = drafts.filter((d) => d.name === args.id);
    if (toDiscard.length === 0) throw new Error(`Draft not found: ${args.id}`);
  } else if (args.count !== null) {
    toDiscard = drafts.slice(0, args.count);
  } else {
    toDiscard = drafts;
  }

  if (toDiscard.length === 0) {
    console.log("Nothing to discard.");
    return;
  }

  for (const d of toDiscard) {
    await discardDraft(d.name);
    console.log(`discarded  ${d.name}`);
  }

  console.log(`\n${toDiscard.length} moved to content/discarded/`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
