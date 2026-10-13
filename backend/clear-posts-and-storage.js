/** Clear Library membership, deleting only files with no remaining owners. */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleKey, supabaseUrl } from './supabase-env.js';
import { deleteLibraryPost, requireImageAssets } from './image-assets.js';

async function main() {
  const db = createClient(supabaseUrl(), supabaseServiceRoleKey());
  await requireImageAssets(db);
  // Snapshot the IDs before deleting; offset pagination during deletion skips rows.
  const posts = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('posts').select('id, storage_path').order('id').range(offset, offset + 499);
    if (error) throw error;
    posts.push(...data);
    if (data.length < 500) break;
  }
  let removedStorage = 0;
  let pending = 0;
  for (const post of posts) {
    const result = await deleteLibraryPost(db, { id: post.id, storagePath: post.storage_path });
    removedStorage += result.removedStorage;
    pending += result.cleanupPending.length;
  }
  console.log(`Cleared ${posts.length} Library posts and ${removedStorage} unused files. Shared assets retained. ${pending} storage removals need a cleanup retry.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
