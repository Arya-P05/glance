import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseServiceRoleKey } from './supabase-env.js';
import { requireImageAssets } from './image-assets.js';
import { persistGeneratedBackground } from './generated-backgrounds.js';

// Restore completed local images after an interrupted cloud save, without a paid
// model call or resetting a background that has already entered review.
export async function recoverBackgrounds(db, directory, { apply = false } = {}) {
  await requireImageAssets(db);
  const results = [];
  for (const filename of await readdir(resolve(directory, 'meta'))) {
    if (!filename.endsWith('.json')) continue;
    const metadata = JSON.parse(await readFile(resolve(directory, 'meta', filename), 'utf8'));
    if (!metadata.scene || !metadata.imageModel || !metadata.filename?.endsWith('.png')) continue;
    const name = basename(metadata.filename, '.png');
    const existing = await db.from('backgrounds').select('name').eq('name', name).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) continue;
    const imageBytes = await readFile(resolve(directory, 'backgrounds', basename(metadata.filename)));
    if (apply) await persistGeneratedBackground(db, { name, imageBytes, metadata });
    results.push(name);
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = createClient(supabaseUrl(), supabaseServiceRoleKey());
  const apply = process.argv.includes('--apply');
  recoverBackgrounds(db, fileURLToPath(new URL('./content', import.meta.url)), { apply })
    .then(names => console.log(JSON.stringify({ mode: apply ? 'recovered' : 'preview', names }, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
