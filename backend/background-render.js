import { imageAssetPath, imageExists, reserveImageAsset, saveImageAsset } from './image-assets.js';
import { overlayCaption, overlayMediumCaption } from './motivational-generator.js';

export function createBackgroundRenderer({
  renderSmall = overlayCaption, renderMedium = overlayMediumCaption,
  save = saveImageAsset, exists = imageExists, reserve = reserveImageAsset,
} = {}) {
  const clients = new WeakMap();
  return async (db, bucket, { source, caption, layout, mediumLayout, mediumRejected = false }) => {
    if (!clients.has(db)) clients.set(db, new Map());
    const cache = clients.get(db);
    const key = JSON.stringify([bucket, source, caption, layout, mediumLayout, mediumRejected]);
    const previous = cache.get(key);
    if (previous && previous.expires > Date.now()) {
      const result = await previous.promise;
      const paths = [result.finalStoragePath, result.finalMediumStoragePath].filter(Boolean);
      const valid = await Promise.all(paths.map(async path => {
        await reserve(db, path, { source, kind: 'render' });
        return exists(db, path, bucket);
      }));
      if (valid.every(Boolean)) return result;
      if (cache.get(key) === previous) cache.delete(key);
    }
    // Another request may have replaced an expired/missing entry while we checked.
    const current = cache.get(key);
    if (current && current !== previous) return current.promise;
    const entry = { expires: Infinity, promise: null };
    entry.promise = (async () => {
      const { data, error } = await db.storage.from(bucket).download(source);
      if (error) throw error;
      const bytes = Buffer.from(await data.arrayBuffer());
      const [small, medium] = await Promise.all([
        renderSmall(bytes, caption, layout),
        mediumRejected ? null : renderMedium(bytes, caption, mediumLayout),
      ]);
      const finalStoragePath = imageAssetPath('captioned', small);
      const finalMediumStoragePath = medium ? imageAssetPath('medium', medium) : null;
      await Promise.all([
        save(db, finalStoragePath, small, { kind: 'render', source, bucket }),
        medium ? save(db, finalMediumStoragePath, medium, { kind: 'render', source, bucket }) : null,
      ]);
      entry.expires = Date.now() + 10 * 60_000;
      // Bound completed entries without evicting work that is still in flight.
      for (const [oldKey, value] of cache) {
        if (cache.size <= 32) break;
        if (oldKey !== key && value.expires !== Infinity) cache.delete(oldKey);
      }
      return { finalStoragePath, finalMediumStoragePath };
    })().catch(error => {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    });
    cache.set(key, entry);
    return entry.promise;
  };
}

export const prepareBackgroundRender = createBackgroundRenderer();
