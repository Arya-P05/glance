import test from 'node:test';
import assert from 'node:assert/strict';
import { readEditorRecovery, writeEditorRecovery, clearEditorRecovery } from '../dashboard/lib/editorRecovery.ts';

test('editor recovery retains uncommitted text and placement but rejects a stale server revision', () => {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  } });
  const state = { caption: { smallText: 'edited', bigText: 'text' }, layout: { xRatio: .3 },
    mediumLayout: { cropXRatio: .2 }, mediumRejected: true, mediumReason: 'crop',
    context: { options: [{ smallText: 'a', bigText: 'b' }], selectedCaptionIndex: 0, captionReason: 'wording', placementReason: 'face' } };
  assert.equal(writeEditorRecovery('one', 'revision1', state), true);
  assert.deepEqual(readEditorRecovery('one', 'revision1'), state);
  assert.equal(readEditorRecovery('one', 'revision2'), null);
  assert.equal(readEditorRecovery('another-image', 'revision1'), null);
  clearEditorRecovery('one');
  assert.equal(readEditorRecovery('one', 'revision1'), null);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
  assert.equal(writeEditorRecovery('one', 'revision1', state), false);
  assert.equal(readEditorRecovery('one', 'revision1'), null);
  delete globalThis.localStorage;
});
