import { createHash } from 'node:crypto';
import { BUCKET } from './instagram-helper.js';

export const imageDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const imageAssetPath = (kind, bytes) => `drafts/${kind}/${imageDigest(bytes)}.png`;

export async function requireImageAssets(db) {
  const { error } = await db.from('image_assets').select('storage_path').limit(0);
  if (error) throw new Error(`Image asset migration is required: ${error.message}`);
}

export async function reserveImageAsset(db, path, { kind = 'legacy', source = null, bytes = null } = {}) {
  const { error } = await db.rpc('reserve_image_asset', {
    path, asset_kind: kind, source, digest: bytes ? imageDigest(bytes) : null, bytes: bytes?.length ?? null,
  });
  if (error) throw error;
}

export async function imageExists(db, path, bucket = BUCKET) {
  const { data, error } = await db.storage.from(bucket).exists(path);
  // A missing object is expected; authentication/network failures are not.
  if (error && !['400', '404', 'not_found'].includes(String(error.status ?? error.statusCode ?? error.originalError?.status ?? error.code))) throw error;
  return data === true;
}

export async function saveImageAsset(db, path, bytes, { kind = 'render', source = null, bucket = BUCKET } = {}) {
  await reserveImageAsset(db, path, { kind, source, bytes });
  if (await imageExists(db, path, bucket)) return path;
  const storage = db.storage.from(bucket);
  const { error } = await storage.upload(path, bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
  if (error && String(error.statusCode ?? error.status) !== '409' && error.code !== 'Duplicate') throw error;
  // Verify new uploads (including a competing writer), never delete a shared
  // asset on an uncertain failure. Leases + delayed reference-aware GC handle it.
  const result = await storage.download(path);
  if (result.error) throw result.error;
  if (!Buffer.from(await result.data.arrayBuffer()).equals(bytes)) throw new Error(`Image verification failed: ${path}`);
  return path;
}

export async function listImageObjects(db, prefix = '', bucket = BUCKET) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) result.push(...await listImageObjects(db, path, bucket));
      else result.push({ ...item, path });
    }
    if (!data || data.length < 1000) return result;
  }
}

export async function cleanupImages(db, { apply = false, days = 30 } = {}) {
  if (!Number.isInteger(days) || days < 1) throw new Error('Retention must be at least one day');
  const { data, error } = await db.rpc('image_cleanup_candidates', { retention_days: days });
  if (error) throw error;
  const candidates = data ?? [];
  const removed = [];
  if (apply) for (const asset of candidates) {
    const claim = await db.rpc('claim_image_cleanup', { path: asset.storage_path, retention_days: days });
    if (claim.error) throw claim.error;
    if (!claim.data) continue;
    const result = await db.storage.from(BUCKET).remove([asset.storage_path]);
    if (result.error) throw result.error;
    const finished = await db.rpc('finish_image_cleanup', { path: asset.storage_path, token: claim.data });
    if (finished.error) throw finished.error;
    removed.push(asset.storage_path);
  }
  return { candidates, removed };
}

export async function removeUnusedImage(db, path) {
  if (!path) return false;
  const claim = await db.rpc('claim_image_cleanup', { path, retention_days: 0 });
  if (claim.error) throw claim.error;
  if (!claim.data) return false;
  const result = await db.storage.from(BUCKET).remove([path]);
  if (result.error) throw result.error;
  const finish = await db.rpc('finish_image_cleanup', { path, token: claim.data });
  if (finish.error) throw finish.error;
  return true;
}

export async function deleteLibraryPost(db, { id, storagePath }) {
  const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
  if (!id && !storagePath) throw fail('Provide a post id or storage path', 400);
  let query = db.from('posts').select('id, storage_path, medium_storage_path').limit(2);
  query = id ? query.eq('id', id) : query.eq('storage_path', storagePath);
  const found = await query;
  if (found.error) throw found.error;
  if (!found.data?.length) throw fail('Post image not found', 404);
  if (found.data.length !== 1) throw fail('Delete target is ambiguous. Refresh and try again.', 409);
  const row = found.data[0];
  if (storagePath && row.storage_path !== storagePath) throw fail('Delete target changed. Refresh and try again.', 409);
  const deleted = await db.from('posts').delete().eq('id', row.id).eq('storage_path', row.storage_path).select('id, storage_path');
  if (deleted.error) throw deleted.error;
  if (!deleted.data?.length) throw fail('Delete target changed. Refresh and try again.', 409);
  let removedStorage = 0;
  const cleanupPending = [];
  for (const path of new Set([row.storage_path, row.medium_storage_path].filter(Boolean))) {
    try { if (await removeUnusedImage(db, path)) removedStorage++; }
    catch { cleanupPending.push(path); } // Membership deletion succeeded; GC retries storage failures.
  }
  return { removedStorage, removedRows: 1, removed: [{ id: row.id, storagePath: row.storage_path }], cleanupPending };
}
