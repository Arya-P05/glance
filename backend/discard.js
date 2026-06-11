/**
 * Discard drafts from the Supabase drafts table (sets status to 'discarded').
 *
 * Examples:
 *   npm run discard                    list current drafts
 *   npm run discard -- --id <name>     discard one
 *   npm run discard -- --count 5       discard first 5
 *   npm run discard -- --all           discard everything
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-env.js";

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

async function getDrafts(supabase, { id = null, count = null } = {}) {
  let query = supabase
    .from("drafts")
    .select("id, name, caption, scene")
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (id) query = query.eq("name", id);
  else if (count !== null) query = query.limit(count);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function discardDraft(supabase, draft) {
  const { error } = await supabase
    .from("drafts")
    .update({ status: "discarded" })
    .eq("id", draft.id);
  if (error) throw error;
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

  const supabase = createClient(supabaseUrl(), supabaseServiceRoleKey());
  const drafts = await getDrafts(supabase, { id: args.id, count: args.count });

  if (!args.all && args.count === null && !args.id) {
    if (drafts.length === 0) {
      console.log("No drafts.");
      return;
    }
    console.log(`${drafts.length} draft${drafts.length === 1 ? "" : "s"}:\n`);
    for (const d of drafts) {
      const caption = d.caption
        ? `  "${d.caption.smallText} ${d.caption.bigText}"`
        : "  (no caption)";
      console.log(`  ${d.name}  ${d.scene?.subject} / ${d.scene?.setting}${caption}`);
    }
    console.log(`\nDiscard one:  npm run discard -- --id <name>`);
    console.log(`Discard some: npm run discard -- --count 5`);
    console.log(`Publish all:  npm run publish -- --all`);
    return;
  }

  if (args.id && drafts.length === 0) throw new Error(`Draft not found: ${args.id}`);

  if (drafts.length === 0) {
    console.log("Nothing to discard.");
    return;
  }

  for (const d of drafts) {
    await discardDraft(supabase, d);
    console.log(`discarded  ${d.name}`);
  }

  console.log(`\n${drafts.length} draft${drafts.length === 1 ? "" : "s"} discarded.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
