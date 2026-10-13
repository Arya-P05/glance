import test from 'node:test';
import assert from 'node:assert/strict';
import { publishDraftFromDb } from './publish-draft.js';

test('publishing uses one atomic RPC and performs no storage copies', async () => {
  const db = { rpc: async (name, args) => {
    assert.equal(name, 'publish_image_draft');
    assert.deepEqual(args, { target_id: 'one', desired_status: 'inactive' });
    return { data: 'drafts/captioned/shared.png' };
  } };
  assert.equal(await publishDraftFromDb(db, { id: 'one' }, { status: 'inactive' }), 'drafts/captioned/shared.png');
});
test('publication errors propagate without reporting success', async () => {
  await assert.rejects(publishDraftFromDb({ rpc: async () => ({ error: new Error('transaction rejected') }) }, { id: 'one' }), /transaction rejected/);
});
