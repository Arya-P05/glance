import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { guide, buildPrompt, validateBrief } from './core.js';
import { createSummerRollServer } from './server.js';

const brief = { title: 'A morning by the lake', scene: guide.scenes[0].scene, quality: 'medium', requestId: 'test-request-0001' };
async function fixture(t, client, setup, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'summer-roll-'));
  if (setup) await setup(directory);
  const server = await createSummerRollServer({ directory, client, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, directory, post: (body, headers = {}) => fetch(`${base}/frames`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}
async function terminal(base) {
  for (let i = 0; i < 100; i++) {
    const state = await (await fetch(`${base}/state`)).json();
    if (!state.busy) return state;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Generation did not finish');
}

test('all 30 briefs carry a fixed treatment while varying mood, daylight and camera context', () => {
  assert.equal(guide.scenes.length, 30);
  assert.equal(new Set(guide.scenes.map(scene => scene.id)).size, 30);
  assert.equal(new Set(guide.scenes.map(scene => scene.energy)).size, 3);
  assert.ok(new Set(guide.scenes.map(scene => scene.light)).size > 8);
  for (const scene of guide.scenes) {
    const valid = validateBrief({ ...brief, title: scene.title, scene: scene.scene });
    assert.ok(buildPrompt(valid.scene).startsWith(guide.treatment));
    assert.ok(buildPrompt(valid.scene).includes(scene.scene));
    assert.ok(buildPrompt(valid.scene).endsWith('No text or graphic elements.'));
  }
});

test('rejects invalid and oversized briefs before calling a provider', async t => {
  let called = false;
  const { post } = await fixture(t, { images: { generate: async () => { called = true; } } });
  for (const invalid of [null, {}, { ...brief, scene: 'short' }, { ...brief, quality: 'ultra' }, { ...brief, requestId: '../outside' }]) {
    assert.equal((await post(invalid)).status, 400);
  }
  assert.equal((await post({ ...brief, scene: 'x'.repeat(21000) })).status, 413);
  assert.equal(called, false);
});

test('one frame persists its exact prompt and image, deduplicates requests and downloads PNG', async t => {
  let calls = 0;
  let options;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6sQAAAABJRU5ErkJggg==', 'base64');
  const { base, directory, post } = await fixture(t, { images: { generate: async args => { calls++; options = args; return { data: [{ b64_json: png.toString('base64') }] }; } } });
  const response = await post(brief);
  assert.equal(response.status, 202);
  const frame = await response.json();
  const state = await terminal(base);
  assert.equal(state.frames[0].status, 'ready');
  assert.equal(options.prompt, buildPrompt(brief.scene));
  assert.equal(options.n, 1);
  assert.equal(options.size, '1024x1024');
  assert.equal((await (await post(brief)).json()).id, frame.id);
  assert.equal(calls, 1);
  const saved = JSON.parse(await readFile(join(directory, `${frame.id}.json`), 'utf8'));
  assert.equal(saved.prompt, options.prompt);
  const download = await fetch(`${base}${saved.imageUrl}?download=1`);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
});

test('concurrency and origin controls prevent extra generation', async t => {
  let finish;
  const { base, post } = await fixture(t, { images: { generate: () => new Promise(resolve => { finish = resolve; }) } });
  assert.equal((await post(brief, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post(brief)).status, 202);
  assert.equal((await post({ ...brief, requestId: 'test-request-0002' })).status, 409);
  assert.equal((await post(brief)).status, 200);
  finish({ data: [{ b64_json: Buffer.from('test image').toString('base64') }] });
  await terminal(base);
});

test('provider failure releases the queue and remains visible', async t => {
  const { base, post } = await fixture(t, { images: { generate: async () => { throw new Error('Provider unavailable'); } } });
  await post(brief);
  const state = await terminal(base);
  assert.equal(state.frames[0].status, 'failed');
  assert.match(state.frames[0].error, /Provider unavailable/);
  assert.equal(state.busy, false);
});

test('missing credentials are explicit; interrupted frames recover on restart', async t => {
  const id = '00000000-0000-4000-8000-000000000000';
  const { base, post } = await fixture(t, undefined, directory => writeFile(join(directory, `${id}.json`), JSON.stringify({ ...brief, id, status: 'generating', createdAt: new Date().toISOString() })));
  const state = await (await fetch(`${base}/state`)).json();
  assert.equal(state.ready, false);
  assert.equal(state.frames[0].status, 'failed');
  assert.match(state.frames[0].error, /interrupted/);
  assert.equal((await post({ ...brief, requestId: 'another-request-0001' })).status, 503);
});


test('background export preserves bytes, coalesces clicks, persists receipts and rejects unfinished frames', async t => {
  const id = '00000000-0000-4000-8000-000000000001';
  const bytes = Buffer.from('original image');
  let calls = 0;
  const { base, directory } = await fixture(t, undefined, async directory => {
    await writeFile(join(directory, `${id}.json`), JSON.stringify({ ...brief, id, status: 'ready', createdAt: new Date().toISOString() }));
    await writeFile(join(directory, `${id}.png`), bytes);
  }, { importBackground: async (frame, image) => {
    calls++;
    assert.equal(frame.id, id);
    assert.deepEqual(image, bytes);
    await new Promise(resolve => setTimeout(resolve, 25));
    return { id: 'background-id', name: `summer-roll-${id}` };
  } });
  const send = headers => fetch(`${base}/frames/${id}/background`, { method: 'POST', headers });
  assert.equal((await send({ Origin: 'https://untrusted.example' })).status, 403);
  const responses = await Promise.all([send(), send()]);
  for (const response of responses) assert.equal(response.status, 200);
  assert.equal((await send()).status, 200);
  assert.equal(calls, 1);
  assert.equal((await (await fetch(`${base}/state`)).json()).frames.length, 0);
  assert.equal(JSON.parse(await readFile(join(directory, `${id}.json`))).background.id, 'background-id');
  const restarted = await createSummerRollServer({ directory, importBackground: () => { throw new Error('Should not reimport'); } });
  restarted.listen(0, '127.0.0.1');
  await once(restarted, 'listening');
  t.after(() => { restarted.closeAllConnections(); restarted.close(); });
  assert.equal((await fetch(`http://127.0.0.1:${restarted.address().port}/frames/${id}/background`, { method: 'POST' })).status, 200);
});

test('failed imports can retry, and only completed frames can be sent', async t => {
  let calls = 0;
  const { base, post } = await fixture(t, { images: { generate: async () => ({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }) } }, undefined, {
    importBackground: async () => { if (++calls === 1) throw new Error('Network unavailable'); return { id: 'saved', name: 'saved' }; },
  });
  const frame = await (await post(brief)).json();
  await terminal(base);
  const send = id => fetch(`${base}/frames/${id}/background`, { method: 'POST' });
  assert.equal((await send('00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await send(frame.id)).status, 500);
  assert.equal((await send(frame.id)).status, 200);
  assert.equal(calls, 2);
  const unfinished = await fixture(t, undefined, directory => writeFile(join(directory, `${frame.id}.json`), JSON.stringify({ ...frame, status: 'failed' })));
  assert.equal((await fetch(`${unfinished.base}/frames/${frame.id}/background`, { method: 'POST' })).status, 409);
});

test('removing ready and failed frames persists, preserves originals, and is idempotent', async t => {
  const ids = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012'];
  const { base, directory } = await fixture(t, undefined, async directory => {
    for (const [index, id] of ids.entries()) {
      await writeFile(join(directory, `${id}.json`), JSON.stringify({ ...brief, id, status: index ? 'failed' : 'ready', createdAt: new Date().toISOString() }));
      await writeFile(join(directory, `${id}.png`), 'original');
    }
  });
  const remove = (id, headers) => fetch(`${base}/frames/${id}/remove`, { method: 'POST', headers });
  assert.equal((await remove(ids[0], { Origin: 'https://untrusted.example' })).status, 403);
  for (const id of ids) {
    assert.equal((await remove(id)).status, 200);
    assert.equal((await remove(id)).status, 200);
    const saved = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
    assert.ok(saved.removedAt);
    assert.equal(await readFile(join(directory, `${id}.png`), 'utf8'), 'original');
    assert.equal((await fetch(`${base}/frames/${id}/background`, { method: 'POST' })).status, 404);
  }
  assert.equal((await (await fetch(`${base}/state`)).json()).frames.length, 0);
  const restarted = await createSummerRollServer({ directory });
  restarted.listen(0, '127.0.0.1');
  await once(restarted, 'listening');
  t.after(() => { restarted.closeAllConnections(); restarted.close(); });
  assert.equal((await (await fetch(`http://127.0.0.1:${restarted.address().port}/state`)).json()).frames.length, 0);
});

test('removal cannot interrupt generation or an import', async t => {
  let finishGeneration, finishImport;
  const { base, post } = await fixture(t, { images: { generate: () => new Promise(resolve => { finishGeneration = resolve; }) } }, undefined, {
    importBackground: () => new Promise(resolve => { finishImport = resolve; }),
  });
  const frame = await (await post(brief)).json();
  const remove = () => fetch(`${base}/frames/${frame.id}/remove`, { method: 'POST' });
  assert.equal((await remove()).status, 409);
  finishGeneration({ data: [{ b64_json: Buffer.from('image').toString('base64') }] });
  await terminal(base);
  const importing = fetch(`${base}/frames/${frame.id}/background`, { method: 'POST' });
  for (let i = 0; i < 100 && !finishImport; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await remove()).status, 409);
  finishImport({ id: 'background' });
  assert.equal((await importing).status, 200);
  assert.equal((await remove()).status, 200);
});


test('previously sent frames are hidden on startup without reimporting', async t => {
  const id = '00000000-0000-4000-8000-000000000099';
  const { base, directory } = await fixture(t, undefined, directory => writeFile(join(directory, `${id}.json`), JSON.stringify({ ...brief, id, status: 'ready', background: { id: 'existing' }, createdAt: new Date().toISOString() })));
  assert.equal((await (await fetch(`${base}/state`)).json()).frames.length, 0);
  assert.ok(JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')).removedAt);
});
