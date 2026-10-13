import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { guide, buildPrompt, validateBrief } from './core.js';
import { createSummerRollServer } from './server.js';

const brief = { title: 'A morning by the lake', scene: guide.scenes[0].scene, quality: 'medium', requestId: 'test-request-0001' };
async function fixture(t, client, setup) {
  const directory = await mkdtemp(join(tmpdir(), 'summer-roll-'));
  if (setup) await setup(directory);
  const server = await createSummerRollServer({ directory, client });
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
