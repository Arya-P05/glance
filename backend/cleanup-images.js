import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseServiceRoleKey } from './supabase-env.js';
import { cleanupImages, listImageObjects, requireImageAssets } from './image-assets.js';

async function main() {
  const args = process.argv.slice(2);
  const db = createClient(supabaseUrl(), supabaseServiceRoleKey());
  await requireImageAssets(db);
  if (args.includes('--index')) {
    // Discovery starts a new retention window. Never infer safe deletion solely
    // from an object's age; references were backfilled by the migration.
    const objects = (await listImageObjects(db)).filter(item => /^(posts|drafts)\/.+\.(png|jpg|jpeg|webp)$/.test(item.path));
    for (let i = 0; i < objects.length; i += 200) {
      const { error } = await db.from('image_assets').upsert(objects.slice(i, i + 200).map(item => ({
        storage_path: item.path, kind: 'legacy', byte_size: Number(item.metadata?.size) || null,
      })), { onConflict: 'storage_path', ignoreDuplicates: true });
      if (error) throw error;
    }
    console.log(`Indexed ${objects.length} files. Existing references and retention dates preserved.`);
  }
  const daysArg = args.find(value => value.startsWith('--days='));
  const result = await cleanupImages(db, { apply: args.includes('--apply'), days: daysArg ? Number(daysArg.slice(7)) : 30 });
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'preview', ...result }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
