/**
 * Deletes rows from the posts table whose storage_path no longer exists in the
 * instagram-posts bucket (e.g. after you manually deleted files from Storage).
 * Run: node prune-orphan-posts.js
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

  // 1. List all objects in bucket posts/
  const existingPaths = new Set();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("posts", { limit: pageSize, offset });

    if (listErr) {
      console.error("List error:", listErr.message);
      process.exit(1);
    }
    if (!files?.length) break;

    for (const f of files) {
      existingPaths.add(`posts/${f.name}`);
    }
    offset += files.length;
    if (files.length < pageSize) break;
  }

  console.log(`Found ${existingPaths.size} files in storage.`);

  // 2. Find post rows whose storage_path is not in that set
  const idsToDelete = [];
  offset = 0;

  while (true) {
    const { data: rows, error: selectErr } = await supabase
      .from("posts")
      .select("id, storage_path")
      .range(offset, offset + pageSize - 1);

    if (selectErr) {
      console.error("Select error:", selectErr.message);
      process.exit(1);
    }
    if (!rows?.length) break;

    for (const row of rows) {
      if (!existingPaths.has(row.storage_path)) {
        idsToDelete.push(row.id);
      }
    }
    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  if (idsToDelete.length === 0) {
    console.log("No orphan rows; all posts point to existing files.");
    return;
  }

  console.log(`Deleting ${idsToDelete.length} orphan rows...`);

  // 3. Delete in batches
  const batchSize = 200;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const { error: deleteErr } = await supabase.from("posts").delete().in("id", batch);
    if (deleteErr) {
      console.error("Delete error:", deleteErr.message);
      process.exit(1);
    }
    console.log(`  Deleted batch ${i / batchSize + 1} (${batch.length} rows).`);
  }

  console.log(`Done. Removed ${idsToDelete.length} orphan posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
