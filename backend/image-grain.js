import sharp from 'sharp';
import { setImmediate as yieldToRequests } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { imageExists, reserveImageAsset, saveImageAsset } from './image-assets.js';

export const GRAIN_VERSION = 'grain-v1';
export async function applyGrain(bytes) {
  const { data, info } = await sharp(bytes).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let state = createHash('sha256').update(data).digest().readUInt32LE(0) || 1;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = 0; i < data.length; i += 4) {
    if (i > 0 && i % 262144 === 0) await yieldToRequests();
    // Same luminance noise in RGB: no colored speckles, no alpha changes.
    const noise = (random() + random() + random() - 1.5) * 18;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.max(0, Math.min(255, Math.round(data[i + channel] + noise)));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

// Per-client queue: one image at a time, shared by warming, preview and approval.
const preparers = new WeakMap();
export function prepareGrain(db, bucket, row) {
  if (!preparers.has(db)) preparers.set(db, createGrainPreparer(db));
  return preparers.get(db)(bucket, row);
}

export function createGrainPreparer(db) {
  const pending = new Map();
  const cachedPaths = new Map();
  let tail = Promise.resolve();
  return (bucket, row) => {
    const source = row.metadata?.grain?.originalStoragePath || row.storage_path;
    const key = JSON.stringify([bucket, source, GRAIN_VERSION]);
    if (pending.has(key)) return pending.get(key);
    const job = Promise.resolve().then(async () => {
      const cachedPath = cachedPaths.get(key);
      // Ready previews bypass rendering jobs, but renew the cleanup lease and
      // check storage so a deleted derivative is never returned as ready.
      if (cachedPath) {
        await reserveImageAsset(db, cachedPath, { kind: 'grain', source });
        if (await imageExists(db, cachedPath, bucket)) {
          return { storagePath: cachedPath, originalStoragePath: source, version: GRAIN_VERSION };
        }
      }
      const render = tail.then(() => prepareGrainAsset(db, bucket, row));
      tail = render.catch(() => {});
      const result = await render;
      cachedPaths.delete(key);
      cachedPaths.set(key, result.storagePath);
      if (cachedPaths.size > 1024) cachedPaths.delete(cachedPaths.keys().next().value);
      return result;
    }).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  };
}

async function prepareGrainAsset(db, bucket, row) {
  const sourcePath = row.metadata?.grain?.originalStoragePath || row.storage_path;
  const { data, error } = await db.storage.from(bucket).download(sourcePath);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  const storagePath = `drafts/backgrounds/grain/${digest}-${GRAIN_VERSION}.png`;
  await reserveImageAsset(db, storagePath, { kind: 'grain', source: sourcePath });
  if (!await imageExists(db, storagePath, bucket)) {
    const output = await applyGrain(bytes);
    await saveImageAsset(db, storagePath, output, { kind: 'grain', source: sourcePath, bucket });
  }
  return { storagePath, originalStoragePath: sourcePath, version: GRAIN_VERSION };
}
