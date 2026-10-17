import { imageDigest, saveImageAsset } from './image-assets.js';
import { normalizeBackgroundScene } from './background-scene.js';

export async function persistGeneratedBackground(db, { name, imageBytes, metadata }) {
  const storagePath = `drafts/backgrounds/${name}-${imageDigest(imageBytes)}.png`;
  const scene = normalizeBackgroundScene(metadata.scene);
  const normalizedMetadata = { ...metadata, scene };
  await saveImageAsset(db, storagePath, imageBytes, { kind: 'original' });
  const { error } = await db.from('backgrounds').upsert({
    name, storage_path: storagePath, scene,
    image_prompt: metadata.scenePrompt ?? metadata.prompt ?? null,
    metadata: normalizedMetadata, image_model: metadata.imageModel ?? null,
    prompt_model: metadata.promptModel ?? null, status: 'pending',
  }, { onConflict: 'name', ignoreDuplicates: true });
  if (error) throw error;
  return storagePath;
}
