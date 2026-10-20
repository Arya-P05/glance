import { test } from "node:test";
import assert from "node:assert/strict";
import { createImageQueue } from "./image-queue.ts";

test("caps concurrent loads and releases slots exactly once", () => {
  const enqueue = createImageQueue(3);
  const releases = [];
  for (let i = 0; i < 10; i++) enqueue(release => releases.push(release));
  assert.equal(releases.length, 3);
  releases[0]();
  releases[0]();
  assert.equal(releases.length, 4);
  for (let i = 1; i < 10; i++) releases[i]();
  assert.equal(releases.length, 10);
});

test("unmounted waiting images do not load or block the queue", () => {
  const enqueue = createImageQueue(1);
  let releaseFirst;
  enqueue(release => { releaseFirst = release; });
  const cancel = enqueue(() => assert.fail("cancelled image started"));
  let started = false;
  enqueue(release => { started = true; release(); });
  cancel();
  assert.equal(started, false);
  releaseFirst();
  assert.equal(started, true);
});
