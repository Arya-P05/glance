import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseServiceRoleKey } from './supabase-env.js';
import { addReferences } from './creative-references.js';
const seed = JSON.parse(await readFile(new URL('./creative-reference-seed.json', import.meta.url), 'utf8'));
if (!process.argv.includes('--apply')) {
  console.log(`${seed.references.length} visually curated suggestions. Run with --apply to insert missing references; existing reviews are preserved.`);
} else {
  const db = createClient(supabaseUrl(), supabaseServiceRoleKey());
  for (const kind of ['post','background']) {
    const rows = seed.references.filter(row => row.source_type === kind);
    const suggestions = new Map(rows.map(({source_type,source_id,...notes}) => [source_id,notes]));
    console.log(kind, await addReferences(db, kind, rows.map(row => row.source_id), suggestions));
  }
}
