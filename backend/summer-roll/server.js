import { createServer } from 'node:http';
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { guide, validateBrief, buildPrompt, renderFrame } from './core.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const defaultDirectory = fileURLToPath(new URL('../content/summer-roll', import.meta.url));

export async function createSummerRollServer({ directory = defaultDirectory, client, model = process.env.SUMMER_ROLL_MODEL || 'gpt-image-1.5' } = {}) {
  await mkdir(directory, { recursive: true });
  const frames = new Map();
  let busy = false;
  const save = async frame => {
    const path = join(directory, `${frame.id}.json`);
    await writeFile(`${path}.tmp`, JSON.stringify(frame, null, 2));
    await rename(`${path}.tmp`, path);
  };
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const frame = JSON.parse(await readFile(join(directory, name), 'utf8'));
    if (frame.status === 'generating') {
      frame.status = 'failed';
      frame.error = 'Generation was interrupted when the service stopped. You can retry this brief.';
      await save(frame);
    }
    frames.set(frame.id, frame);
  }
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(403, { error: 'Local dashboard access only.' });
    // Local development service: reject untrusted browser origins, including mutations.
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(403, { error: 'Local dashboard access only.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/state') {
        return send(200, { ready: Boolean(client), model, busy, version: guide.version, frames: [...frames.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
      }
      const imageMatch = url.pathname.match(/^\/images\/([a-f0-9-]{36})\.png$/);
      if (req.method === 'GET' && imageMatch) {
        if (frames.get(imageMatch[1])?.status !== 'ready') return send(404, { error: 'Image not found.' });
        const bytes = await readFile(join(directory, `${imageMatch[1]}.png`));
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable', ...(url.searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="summer-roll-${imageMatch[1]}.png"` } : {}) });
        return res.end(bytes);
      }
      if (req.method === 'POST' && url.pathname === '/frames') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Send a JSON scene brief.' });
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 20000) return send(413, { error: 'Scene brief is too large.' });
        }
        let brief;
        try { brief = validateBrief(JSON.parse(raw)); } catch (error) { return send(400, { error: error.message }); }
        const existing = [...frames.values()].find(frame => frame.requestId === brief.requestId);
        if (existing) return send(200, existing);
        if (!client) return send(503, { error: 'Set OPENAI_API_KEY in backend/.env, then restart npm run summer-roll.' });
        if (busy) return send(409, { error: 'A frame is developing. Wait for it to finish before starting another.' });
        busy = true;
        const frame = { ...brief, id: randomUUID(), status: 'generating', createdAt: new Date().toISOString(), model, version: guide.version, prompt: buildPrompt(brief.scene) };
        try { await save(frame); } catch (error) { busy = false; throw error; }
        frames.set(frame.id, frame);
        send(202, frame);
        void (async () => {
          try {
            const { bytes } = await renderFrame(client, brief, model);
            await writeFile(join(directory, `${frame.id}.png`), bytes);
            frame.status = 'ready';
            frame.imageUrl = `/images/${frame.id}.png`;
          } catch (error) {
            frame.status = 'failed';
            frame.error = error.status === 401 ? 'The image service rejected the API key. Check backend/.env and restart the service.' : `Generation failed${error.status ? ` (${error.status})` : ''}. ${error.message || 'Try again.'}`;
          } finally {
            try { await save(frame); } catch (error) { console.error('Unable to save Summer roll metadata:', error.message); }
            busy = false;
          }
        })();
        return;
      }
      send(404, { error: 'Not found.' });
    } catch (error) {
      console.error('Summer roll request failed:', error.message);
      if (!res.headersSent) send(500, { error: 'The local service could not complete this request.' });
      else res.end();
    }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 300000, maxRetries: 0 }) : undefined;
  const server = await createSummerRollServer({ client });
  server.listen(Number(process.env.SUMMER_ROLL_PORT || 3848), '127.0.0.1', () => console.log(`Summer roll service: http://127.0.0.1:${server.address().port} (${client ? 'ready' : 'API key missing'})`));
}
