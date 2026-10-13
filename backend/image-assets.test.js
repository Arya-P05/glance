import test from 'node:test';
import assert from 'node:assert/strict';
import { imageAssetPath, saveImageAsset, cleanupImages, listImageObjects, deleteLibraryPost } from './image-assets.js';
import { persistGeneratedBackground } from './generated-backgrounds.js';

function storageDb() {
  const files = new Map();
  const writes = [];
  const calls = [];
  const db = {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: true }; },
    storage: { from: () => ({
      exists: async path => ({ data: files.has(path) }),
      upload: async (path, bytes) => { writes.push(path); files.set(path, bytes); return {}; },
      download: async path => ({ data: new Blob([files.get(path)]) }),
    }) },
  };
  return { db, files, writes, calls };
}

test('identical renders reuse immutable bytes; changed renders have distinct URLs', async () => {
  const { db, writes } = storageDb();
  const bytes = Buffer.from('render');
  const path = imageAssetPath('captioned', bytes);
  await saveImageAsset(db, path, bytes);
  await saveImageAsset(db, path, bytes);
  assert.equal(writes.length, 1);
  assert.notEqual(path, imageAssetPath('captioned', Buffer.from('edited render')));
});

test('upload reservation failure prevents storage writes', async () => {
  const { db, writes } = storageDb();
  db.rpc = async () => ({ error: new Error('cleanup in progress') });
  await assert.rejects(saveImageAsset(db, 'drafts/a.png', Buffer.from('a')), /cleanup in progress/);
  assert.equal(writes.length, 0);
});

test('uncertain verification failure never removes a possibly shared image', async () => {
  const { db } = storageDb();
  db.storage.from = () => ({
    exists: async () => ({ data: false }), upload: async () => ({}),
    download: async () => ({ error: new Error('connection lost') }),
    remove: () => assert.fail('must not delete after an uncertain outcome'),
  });
  await assert.rejects(saveImageAsset(db, 'drafts/a.png', Buffer.from('a')), /connection lost/);
});

test('storage authorization failures are not treated as a missing image', async () => {
  const { db, writes } = storageDb();
  db.storage.from = () => ({ exists: async () => ({ data: false, error: { status: 403 } }) });
  await assert.rejects(saveImageAsset(db, 'drafts/a.png', Buffer.from('a')));
  assert.equal(writes.length, 0);
});

test('background recovery inserts without resetting an existing review', async () => {
  const { db, files } = storageDb();
  let inserted;
  db.from = table => ({ upsert: async (row, options) => {
    assert.equal(table, 'backgrounds');
    assert.equal(options.ignoreDuplicates, true);
    inserted = row;
    return {};
  } });
  await persistGeneratedBackground(db, { name: 'one', imageBytes: Buffer.from('original'), metadata: { scene: { subject: 'test' } } });
  assert.ok(files.has(inserted.storage_path));
  assert.equal(inserted.status, 'pending');
});

test('cleanup previews are read-only and apply rechecks every candidate', async () => {
  const removed = [];
  const candidates = [{ storage_path: 'drafts/unused.png' }, { storage_path: 'drafts/newly-referenced.png' }];
  const db = {
    rpc: async (name, args) => name === 'image_cleanup_candidates' ? { data: candidates }
      : name === 'claim_image_cleanup' ? { data: args.path.endsWith('/unused.png') } : {},
    storage: { from: () => ({ remove: async paths => { removed.push(...paths); return {}; } }) },
  };
  assert.equal((await cleanupImages(db)).candidates.length, 2);
  assert.deepEqual(removed, []);
  await cleanupImages(db, { apply: true });
  assert.deepEqual(removed, ['drafts/unused.png']);
});

test('failed storage deletion never marks an asset deleted', async () => {
  const db = {
    rpc: async name => {
      if (name === 'image_cleanup_candidates') return { data: [{ storage_path: 'drafts/a.png' }] };
      if (name === 'claim_image_cleanup') return { data: true };
      assert.fail('must remain retryable');
    },
    storage: { from: () => ({ remove: async () => ({ error: new Error('offline') }) }) },
  };
  await assert.rejects(cleanupImages(db, { apply: true }), /offline/);
});

test('recursive inventory includes medium images and shared draft renders', async () => {
  const tree = { '': [{ name: 'posts', id: null }, { name: 'drafts', id: null }],
    posts: [{ name: 'medium', id: null }, { name: 'a.png', id: '1' }],
    'posts/medium': [{ name: 'a.png', id: '2' }], drafts: [{ name: 'a.png', id: '3' }] };
  const db = { storage: { from: () => ({ list: async path => ({ data: tree[path] }) }) } };
  assert.deepEqual((await listImageObjects(db)).map(item => item.path).sort(), ['drafts/a.png', 'posts/a.png', 'posts/medium/a.png']);
});

test('Library delete detaches the row before checking both image formats', async () => {
  const events = [];
  const row = { id: 'one', storage_path: 'drafts/square.png', medium_storage_path: 'drafts/wide.png' };
  const query = { select: () => query, limit: () => query, eq: () => query,
    then: resolve => resolve({ data: [row] }), delete: () => {
      events.push('delete'); return query;
    } };
  const db = { from: () => query, rpc: async (name, args) => { events.push(args.path); return { data: false }; } };
  const result = await deleteLibraryPost(db, { id: 'one' });
  assert.equal(result.removedRows, 1);
  assert.equal(result.removedStorage, 0);
  assert.deepEqual(events, ['delete', 'drafts/square.png', 'drafts/wide.png']);
});
