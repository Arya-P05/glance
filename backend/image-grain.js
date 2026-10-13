import sharp from 'sharp';
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
    // Same luminance noise in RGB: no colored speckles, no alpha changes.
    const noise = (random() + random() + random() - 1.5) * 18;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.max(0, Math.min(255, Math.round(data[i + channel] + noise)));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function prepareGrain(db, bucket, row) {
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
