import { readFile } from 'node:fs/promises';

export const guide = JSON.parse(await readFile(new URL('../../dashboard/features/summer-roll/guide.json', import.meta.url), 'utf8'));

export function validateBrief(input) {
  if (!input || typeof input !== 'object') throw new Error('A scene brief is required.');
  if (typeof input.scene !== 'string' || input.scene.trim().length < 20 || input.scene.length > 4000) {
    throw new Error('Describe the scene in 20–4,000 characters.');
  }
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100) throw new Error('Give the scene a title of up to 100 characters.');
  if (!['medium', 'high'].includes(input.quality)) throw new Error('Choose medium or high quality.');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(input.requestId)) throw new Error('Invalid request ID.');
  return { title: input.title.trim(), scene: input.scene.trim(), quality: input.quality, requestId: input.requestId };
}

export function buildPrompt(scene) {
  return `${guide.treatment}\n\nSCENE\n${scene}\n\nDeliver one square 1:1 photograph. No text or graphic elements.`;
}

// This module has no dependency on the existing generation or feedback pipeline.
export async function renderFrame(client, brief, model) {
  const prompt = buildPrompt(brief.scene);
  const response = await client.images.generate({ model, prompt, n: 1, size: '1024x1024', quality: brief.quality, output_format: 'png' });
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error('The image service returned no image. Try again.');
  return { bytes: Buffer.from(encoded, 'base64'), prompt };
}
