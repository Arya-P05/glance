import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundImporter } from './backgrounds.js';

const frame = { id: 'frame-123', title: 'Lake', scene: 'Friends at the lake', prompt: 'Exact original prompt', model: 'image-model', quality: 'high', createdAt: '2026-10-16' };
function database() {
  let row;
  let inserted;
  let failure;
  return {
    get row() { return row; }, get inserted() { return inserted; },
    fail() { failure = { code: 'network', message: 'Lost response' }; },
    from(table) {
      assert.equal(table, 'backgrounds');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
        insert: value => {
          inserted = value;
          row = { id: 'db-id', name: value.name, status: 'approved' };
          return { select: () => ({ single: async () => ({ data: failure ? null : row, error: failure }) }) };
        },
      };
    },
  };
}
test('imports original image and provenance as pending, without resetting a previously reviewed row', async () => {
  const db = database();
  const bytes = Buffer.from('original');
  let uploads = 0;
  const send = createBackgroundImporter({ getDb: () => db, saveAsset: async (_db, path, image) => {
    uploads++;
    assert.match(path, /^drafts\/backgrounds\/[a-f0-9]{64}\.png$/);
    assert.deepEqual(image, bytes);
  } });
  await send(frame, bytes);
  assert.equal(db.inserted.status, 'pending');
  assert.equal(db.inserted.image_prompt, frame.prompt);
  assert.equal(db.inserted.metadata.summerRollFrameId, frame.id);
  assert.equal(db.inserted.scene.description, frame.scene);
  assert.equal((await send(frame, bytes)).status, 'approved');
  assert.equal(uploads, 1);
});
test('retry reconciles a committed insert whose response was lost', async () => {
  const db = database();
  db.fail();
  let uploads = 0;
  const send = createBackgroundImporter({ getDb: () => db, saveAsset: async () => { uploads++; } });
  await assert.rejects(send(frame, Buffer.from('original')));
  assert.equal((await send(frame, Buffer.from('original'))).id, 'db-id');
  assert.equal(uploads, 1);
});
