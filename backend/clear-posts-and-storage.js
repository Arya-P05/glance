/**
 * Empties the instagram-posts bucket (posts/*) and truncates the posts table.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run once, then re-import with small images: npm run bulk or collect-links + import-links.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "instagram-posts";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // List and delete all objects under posts/
  let totalDeleted = 0;
  let offset = 0;
  const pageSize = 200;

  while (true) {
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("posts", { limit: pageSize, offset });

    if (listErr) {
      console.error("List error:", listErr.message);
      process.exit(1);
    }
    if (!files?.length) break;

    const paths = files.map((f) => `posts/${f.name}`);
    const { error: removeErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeErr) {
      console.error("Remove error:", removeErr.message);
      process.exit(1);
    }
    totalDeleted += paths.length;
    console.log(`Deleted ${paths.length} objects (total ${totalDeleted})`);
    if (files.length < pageSize) break;
    offset += pageSize;
  }

  // Delete all rows from posts (id is UUID; fetch ids then delete in batches)
  const batchSize = 200;
  let deletedRows = 0;
  while (true) {
    const { data: rows, error: selectErr } = await supabase
      .from("posts")
      .select("id")
      .limit(batchSize);
    if (selectErr) {
      console.error("Select posts error:", selectErr.message);
      process.exit(1);
    }
    if (!rows?.length) break;
    const ids = rows.map((r) => r.id);
    const { error: deleteErr } = await supabase.from("posts").delete().in("id", ids);
    if (deleteErr) {
      console.error("Delete posts error:", deleteErr.message);
      process.exit(1);
    }
    deletedRows += ids.length;
    if (rows.length < batchSize) break;
  }
  console.log(`Cleared posts table (${deletedRows} rows).`);
  console.log("Done. Re-import with: npm run bulk  (or collect-links then import-links)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
