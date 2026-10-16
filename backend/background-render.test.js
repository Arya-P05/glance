import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundRenderer } from './background-render.js';

function fixture() {
  const files = new Set();
  const counts = { downloads: 0, small: 0, medium: 0, saves: 0 };
  let fail = false;
  const db = { storage: { from: () => ({ download: async () => {
    counts.downloads++;
    if (fail) return { error: new Error('offline') };
    return { data: new Blob(['original']) };
  } }) } };
  const prepare = createBackgroundRenderer({
    renderSmall: async (_bytes, caption, layout) => { counts.small++; return Buffer.from(JSON.stringify(['small',caption,layout])); },
    renderMedium: async (_bytes, caption, layout) => { counts.medium++; return Buffer.from(JSON.stringify(['medium',caption,layout])); },
    save: async (_db, path) => { counts.saves++; files.add(path); },
    reserve: async () => {}, exists: async (_db, path) => files.has(path),
  });
  const input = { source: 'original.png', caption: {smallText:'hello',bigText:'world'}, layout:{x:1}, mediumLayout:{x:2} };
  return { files, counts, db, prepare, input, setFail: value => { fail=value; } };
}

test('preparation and acceptance share renders and verified uploads', async () => {
 const f=fixture();
 const [a,b]=await Promise.all([f.prepare(f.db,'test',f.input),f.prepare(f.db,'test',f.input)]);
 assert.deepEqual(a,b);
 assert.deepEqual(await f.prepare(f.db,'test',f.input),a);
 assert.deepEqual(f.counts,{downloads:1,small:1,medium:1,saves:2});
});

test('caption, placement, source and medium rejection invalidate cached output', async () => {
 const f=fixture();
 await f.prepare(f.db,'test',f.input);
 for(const change of [{caption:{smallText:'changed',bigText:'text'}},{layout:{x:3}},{mediumLayout:{x:4}},{source:'new.png'}]) {
  await f.prepare(f.db,'test',{...f.input,...change});
 }
 const result=await f.prepare(f.db,'test',{...f.input,mediumRejected:true});
 assert.equal(result.finalMediumStoragePath,null);
 assert.equal(f.counts.downloads,6); assert.equal(f.counts.small,6); assert.equal(f.counts.medium,5);
});

test('deleted prepared files are recreated and failures are retryable', async () => {
 const f=fixture();
 await f.prepare(f.db,'test',f.input);
 f.files.clear();
 f.setFail(true);
 await assert.rejects(f.prepare(f.db,'test',f.input),/offline/);
 f.setFail(false);
 await f.prepare(f.db,'test',f.input);
 assert.equal(f.files.size,2); assert.equal(f.counts.downloads,3);
});
