import { createClient } from '@supabase/supabase-js';
import { imageAssetPath, saveImageAsset } from '../image-assets.js';
import { supabaseUrl, supabaseServiceRoleKey } from '../supabase-env.js';

export function createBackgroundImporter({ getDb = () => createClient(supabaseUrl(), supabaseServiceRoleKey()), saveAsset = saveImageAsset } = {}) {
  return async (frame, bytes) => {
    const db = getDb();
    const name = `summer-roll-${frame.id}`;
    const find = async () => {
      const { data, error } = await db.from('backgrounds').select('id, name').eq('name', name).maybeSingle();
      if (error) throw error;
      return data;
    };
    const existing = await find();
    if (existing) return existing;
    const storagePath = imageAssetPath('backgrounds', bytes);
    await saveAsset(db, storagePath, bytes, { kind: 'background' });
    const scene = { name: frame.title, description: frame.scene };
    const { data, error } = await db.from('backgrounds').insert({
      name, storage_path: storagePath, scene, image_prompt: frame.prompt,
      image_model: frame.model, status: 'pending',
      metadata: { source: 'summer-roll', summerRollFrameId: frame.id, scene,
        scenePrompt: frame.prompt, imageModel: frame.model, quality: frame.quality,
        generatedAt: frame.createdAt, size: '1024x1024' },
    }).select('id, name').single();
    // A concurrent request may have imported this frame already. Never reset its review status.
    if (error?.code === '23505') {
      const winner = await find();
      if (winner) return winner;
    }
    if (error) throw error;
    return data;
  };
}
