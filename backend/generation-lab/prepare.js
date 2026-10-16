import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {config} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {entries,selectionCreatedAt} from './catalog.js';
import {hash} from './core.js';
import {atomicJSON} from './store.js';
import {supabaseUrl,supabaseServiceRoleKey} from '../supabase-env.js';
config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const directory=fileURLToPath(new URL('../content/generation-lab',import.meta.url));
await mkdir(join(directory,'references'),{recursive:true});
let existing=[];try{existing=JSON.parse(await readFile(join(directory,'references.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const db=createClient(supabaseUrl(),supabaseServiceRoleKey());
const {data,error}=await db.from('creative_references').select('id,storage_path,source_id,created_at').in('id',entries.map(e=>e.id));if(error)throw error;
if(data.length!==22)throw new Error('Expected the complete 22-image selection.');
const refs=[];
for(const entry of entries){
 const row=data.find(r=>r.id===entry.id);if(row.created_at!==selectionCreatedAt)throw new Error('Unexpected reference batch.');
 const file=`${entry.id}.jpg`;let bytes;
 try{bytes=await readFile(join(directory,'references',file));}catch(e){if(e.code!=='ENOENT')throw e;const result=await db.storage.from('instagram-posts').download(row.storage_path);if(result.error)throw result.error;bytes=Buffer.from(await result.data.arrayBuffer());await writeFile(join(directory,'references',file),bytes);}
 const old=existing.find(r=>r.id===entry.id);if(old&&old.sha256!==hash(bytes))throw new Error('Frozen reference snapshot has changed.');
 refs.push({...entry,sourceId:row.source_id,storagePath:row.storage_path,file,sha256:hash(bytes),selectedAt:selectionCreatedAt});
}
await atomicJSON(join(directory,'references.json'),refs);console.log(`Frozen ${refs.length} references across ${new Set(refs.map(r=>r.family)).size} style families.`);
