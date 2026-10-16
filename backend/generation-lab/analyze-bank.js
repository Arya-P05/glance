import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { atomicJSON } from './store.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
if (!process.env.OPENAI_GENERAL_API_KEY) throw new Error('OPENAI_GENERAL_API_KEY is missing.');

const directory = fileURLToPath(new URL('../content/generation-lab', import.meta.url));
const references = JSON.parse(await readFile(join(directory, 'references.json'), 'utf8'));
if (!references.length) throw new Error('Prepare the reference bank first.');

const content = [{
  type: 'input_text',
  text: `Study this complete bank of images the user explicitly likes. Ignore every overlaid word, logo and caption. Analyze the underlying photographs as visual evidence, not the scene descriptions alone. The hard problem is the shared feeling: many technically possible pictures of the same subject would still be wrong.

Extract a concise, operational visual fingerprint that can guide NEW photographs without copying a source image. Separate global invariants from family-specific camera behavior. Be concrete about framing, subject scale, social distance, camera height, focus, exposure, color relationships, texture, lighting, ordinary environmental detail, emotional tone, and the difference between charming awkwardness and staged whimsy. Identify seductive failure modes such as polished lifestyle imagery, generic vintage filters, cinematic grading, centered portraiture, and literal reconstruction of a reference.

Return prompt fragments as camera-direction language rather than a pile of adjectives. The generated background must contain no text, logo, watermark, border, or caption zone.`,
}];

for (const reference of references) {
  content.push({ type: 'input_text', text: `Reference ${reference.number}; family=${reference.family}; title=${reference.title}.` });
  content.push({
    type: 'input_image',
    image_url: `data:image/jpeg;base64,${(await readFile(join(directory, 'references', reference.file))).toString('base64')}`,
    detail: 'low',
  });
}

const familySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    family: { type: 'string' },
    visualFingerprint: { type: 'string' },
    cameraDirection: { type: 'string' },
    avoid: { type: 'array', items: { type: 'string' } },
  },
  required: ['family', 'visualFingerprint', 'cameraDirection', 'avoid'],
};
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thesis: { type: 'string' },
    globalFingerprint: { type: 'string' },
    globalCameraDirection: { type: 'string' },
    globalAvoid: { type: 'array', items: { type: 'string' } },
    families: { type: 'array', minItems: 5, maxItems: 5, items: familySchema },
    referenceUseRules: { type: 'array', items: { type: 'string' } },
    evaluationQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['thesis', 'globalFingerprint', 'globalCameraDirection', 'globalAvoid', 'families', 'referenceUseRules', 'evaluationQuestions'],
};

const client = new OpenAI({ apiKey: process.env.OPENAI_GENERAL_API_KEY, maxRetries: 0, timeout: 300000 });
const response = await client.responses.create({
  model: process.env.GENERATION_LAB_ANALYSIS_MODEL || 'gpt-6-astra',
  reasoning: { effort: 'high' },
  input: [{ role: 'user', content }],
  text: { format: { type: 'json_schema', name: 'taste_profile', strict: true, schema } },
  max_output_tokens: 10000,
});
const profile = JSON.parse(response.output_text);
await atomicJSON(join(directory, 'taste-profile.json'), {
  ...profile,
  referenceHashes: references.map(({ number, id, sha256 }) => ({ number, id, sha256 })),
  model: response.model,
  responseId: response.id,
  usage: response.usage,
  createdAt: new Date().toISOString(),
});
console.log(`Saved taste profile from ${references.length} references.`);
