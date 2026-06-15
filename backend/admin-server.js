/**
 * Local admin UI + dashboard API.
 * Security: uses SUPABASE_SERVICE_ROLE_KEY — localhost only.
 *
 *   cd backend && npm run admin
 *   open http://127.0.0.1:3847/
 */
import "dotenv/config";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  BUCKET as IG_BUCKET,
  DRAFT_PREFIX,
  downloadImage,
  parsePostTargetsFromInput,
  resizeForPreview,
  resizeForWidget,
} from "./instagram-helper.js";
import { getDraftForPublish, publishDraftFromDb } from "./publish-draft.js";
import {
  DEFAULT_CAPTION_MODEL,
  buildCaptionPrompt,
  captionSignature,
  completeCaptionOptions,
  normalizeCaptionLayout,
  normalizeMediumCaptionLayout,
  overlayCaption,
  overlayMediumCaption,
  parseCaptionOptions,
  variedFallbackCaption,
} from "./motivational-generator.js";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-env.js";

const BUCKET = IG_BUCKET;
const PREFIX = "posts";
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "content");

// ─── Job Manager ──────────────────────────────────────────────────────────────

const jobs = new Map();
const sseClients = new Map(); // jobId -> Set<res>

function createJob(type) {
  const id = randomUUID();
  jobs.set(id, { id, type, status: "running", exitCode: null, lines: [], startedAt: Date.now() });
  return id;
}

function addJobLine(jobId, line) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.lines.push(line);
  const clients = sseClients.get(jobId);
  if (clients) {
    for (const res of clients) {
      try { res.write(`data: ${JSON.stringify({ line })}\n\n`); } catch {}
    }
  }
}

function finishJob(jobId, exitCode) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = exitCode === 0 ? "done" : "failed";
  job.exitCode = exitCode;
  const clients = sseClients.get(jobId);
  if (clients) {
    for (const res of clients) {
      try {
        res.write(`data: ${JSON.stringify({ done: true, exitCode })}\n\n`);
        res.end();
      } catch {}
    }
    sseClients.delete(jobId);
  }
}

function formatSpawnArg(arg) {
  const value = String(arg);
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function spawnJob(type, scriptName, args = [], extraEnv = {}) {
  const jobId = createJob(type);
  addJobLine(jobId, `$ node ${[scriptName, ...args].map(formatSpawnArg).join(" ")}`);
  const proc = spawn("node", [join(__dirname, scriptName), ...args], {
    cwd: __dirname,
    env: { ...process.env, ...extraEnv },
  });
  const pushLines = (data, prefix = "") => {
    data.toString().split("\n").filter(l => l.trim()).forEach(line => addJobLine(jobId, prefix + line));
  };
  proc.stdout.on("data", d => pushLines(d));
  proc.stderr.on("data", d => pushLines(d, "[err] "));
  proc.on("close", code => finishJob(jobId, code ?? 1));
  return jobId;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function publicObjectUrl(supaUrl, storagePath) {
  const base = supaUrl.replace(/\/+$/, "");
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

function captionedDraftStoragePath(name) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  return `${DRAFT_PREFIX}/captioned/${name}-${suffix}.png`;
}

function mediumDraftStoragePath(name) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  return `${DRAFT_PREFIX}/medium/${name}-${suffix}.png`;
}

function hasCompleteCaption(caption) {
  return Boolean(caption?.smallText && caption?.bigText);
}

async function uploadVerifiedObject(supabase, storagePath, bytes) {
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: "image/png",
      cacheControl: "0",
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const { data: verifyBlob, error: verifyErr } = await supabase.storage.from(BUCKET).download(storagePath);
  if (verifyErr) throw verifyErr;
  const verified = Buffer.from(await verifyBlob.arrayBuffer());
  if (!verified.equals(bytes)) {
    throw new Error(`Uploaded object failed verification: ${storagePath}`);
  }
}

function checkToken(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true;
  return req.headers["x-admin-token"] === expected;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || "{}"); } catch { return null; }
}

async function listAllStoragePaths(supabase) {
  const paths = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data: files, error } = await supabase.storage.from(BUCKET).list(PREFIX, { limit: pageSize, offset });
    if (error) throw error;
    if (!files?.length) break;
    for (const f of files) paths.push(`${PREFIX}/${f.name}`);
    offset += files.length;
    if (files.length < pageSize) break;
  }
  return paths;
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

async function listDrafts(supabase, projectUrl) {
  const draftsResult = await supabase
    .from("drafts")
    .select("id, name, storage_path, raw_storage_path, caption, scene, image_model, caption_model, created_at, metadata")
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  if (draftsResult.error) throw draftsResult.error;

  return (draftsResult.data ?? [])
    .filter(row => hasCompleteCaption(row.caption))
    .map(row => ({
      id: row.name,
      filename: `${row.name}.png`,
      imageUrl: publicObjectUrl(projectUrl, row.storage_path),
      rawImageUrl: row.raw_storage_path ? publicObjectUrl(projectUrl, row.raw_storage_path) : null,
      meta: {
        caption: row.caption,
        captionOptions: row.metadata?.captionOptions ?? null,
        selectedCaptionIndex: row.metadata?.selectedCaptionIndex ?? null,
        captionPrompt: row.metadata?.captionPrompt ?? null,
        captionLayout: row.metadata?.captionLayout ?? null,
        mediumCaptionLayout: row.metadata?.mediumCaptionLayout ?? null,
        mediumStoragePath: row.metadata?.mediumStoragePath ?? null,
        mediumImageUrl: row.metadata?.mediumStoragePath
          ? publicObjectUrl(projectUrl, row.metadata.mediumStoragePath)
          : null,
        scene: row.scene,
        imageModel: row.image_model,
        captionModel: row.caption_model,
        generatedAt: row.created_at,
      },
    }));
}

async function listBackgrounds(supabase, projectUrl) {
  const backgroundsResult = await supabase
    .from("backgrounds")
    .select("id, name, storage_path, scene, image_prompt, image_model, prompt_model, created_at, metadata")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (backgroundsResult.error) throw backgroundsResult.error;

  return (backgroundsResult.data ?? []).map(row => ({
    id: row.name,
    filename: `${row.name}.png`,
    imageUrl: publicObjectUrl(projectUrl, row.storage_path),
    rawImageUrl: publicObjectUrl(projectUrl, row.storage_path),
    meta: {
      caption: null,
      captionOptions: row.metadata?.captionOptions ?? null,
      selectedCaptionIndex: row.metadata?.selectedCaptionIndex ?? null,
      captionPrompt: row.metadata?.captionPrompt ?? null,
      captionLayout: row.metadata?.captionLayout ?? null,
      mediumCaptionLayout: row.metadata?.mediumCaptionLayout ?? null,
      mediumStoragePath: row.metadata?.mediumStoragePath ?? null,
      mediumImageUrl: row.metadata?.mediumStoragePath
        ? publicObjectUrl(projectUrl, row.metadata.mediumStoragePath)
        : null,
      scene: row.scene,
      imageModel: row.image_model,
      captionModel: row.metadata?.captionModel ?? null,
      promptModel: row.prompt_model,
      generatedAt: row.created_at,
    },
  }));
}

async function renderDraftCaption(supabase, { id, caption, layout, mediumLayout }) {
  const { data: row, error } = await supabase
    .from("drafts")
    .select("name, storage_path, raw_storage_path, caption, metadata")
    .eq("name", id)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Draft not found: ${id}`);

  const sourcePath = row.raw_storage_path || row.storage_path;
  if (!row.raw_storage_path) {
    console.warn(`Draft ${id} has no raw background — re-rendering from final image`);
  }

  const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(sourcePath);
  if (downloadErr) throw downloadErr;

  const finalCaption = caption?.smallText && caption?.bigText ? caption : row.caption;
  if (!finalCaption?.smallText || !finalCaption?.bigText) {
    throw new Error("Draft has no caption to render");
  }

  const normalizedLayout = normalizeCaptionLayout(layout ?? row.metadata?.captionLayout ?? {});
  const normalizedMediumLayout = normalizeMediumCaptionLayout(
    mediumLayout ?? row.metadata?.mediumCaptionLayout ?? {},
    row.metadata?.mediumCaptionLayout ?? normalizedLayout
  );
  const imageBytes = Buffer.from(await blob.arrayBuffer());
  const rendered = await overlayCaption(imageBytes, finalCaption, normalizedLayout);
  const renderedMedium = await overlayMediumCaption(imageBytes, finalCaption, normalizedMediumLayout);
  const finalStoragePath = captionedDraftStoragePath(row.name);
  const finalMediumStoragePath = mediumDraftStoragePath(row.name);
  await uploadVerifiedObject(supabase, finalStoragePath, rendered);
  await uploadVerifiedObject(supabase, finalMediumStoragePath, renderedMedium);

  const metadata = {
    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
    captionLayout: normalizedLayout,
    mediumCaptionLayout: normalizedMediumLayout,
    mediumStoragePath: finalMediumStoragePath,
  };

  const { error: updateErr } = await supabase
    .from("drafts")
    .update({ caption: finalCaption, metadata, storage_path: finalStoragePath })
    .eq("name", id)
    .eq("status", "draft");
  if (updateErr) {
    await supabase.storage.from(BUCKET).remove([finalStoragePath, finalMediumStoragePath]);
    throw updateErr;
  }

  return {
    id,
    imageUrl: publicObjectUrl(supabaseUrl(), finalStoragePath),
    mediumImageUrl: publicObjectUrl(supabaseUrl(), finalMediumStoragePath),
    caption: finalCaption,
    captionLayout: normalizedLayout,
    mediumCaptionLayout: normalizedMediumLayout,
  };
}

function responseText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function captionRequestContent(prompt, imageBytes) {
  const content = [{ type: "input_text", text: prompt }];
  if (imageBytes?.length) {
    content.push({
      type: "input_image",
      image_url: `data:image/png;base64,${imageBytes.toString("base64")}`,
    });
  }
  return content;
}

async function loadRecentCaptions(supabase, limit = 30) {
  const recent = [];

  const { data: drafts } = await supabase
    .from("drafts")
    .select("caption")
    .not("caption", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const row of drafts ?? []) {
    if (row.caption?.smallText && row.caption?.bigText) {
      recent.push({ smallText: row.caption.smallText, bigText: row.caption.bigText });
    }
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("caption")
    .not("caption", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const row of posts ?? []) {
    const text = String(row.caption || "");
    const comma = text.indexOf(",");
    if (comma === -1) continue;
    recent.push({
      smallText: text.slice(0, comma + 1).trim(),
      bigText: text.slice(comma + 1).trim(),
    });
  }

  const seen = new Set();
  return recent.filter((caption) => {
    const key = `${caption.smallText}|${caption.bigText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateCaptionForScene({ client, model, scene, imageBytes = null, recentCaptions }) {
  let lastPrompt = buildCaptionPrompt(scene, { recentCaptions, hasImage: Boolean(imageBytes?.length) });

  for (let attempt = 0; attempt < 5; attempt++) {
    lastPrompt = buildCaptionPrompt(scene, { recentCaptions, attempt, hasImage: Boolean(imageBytes?.length) });
    const response = await client.responses.create({
      model,
      temperature: 0.7,
      input: [{ role: "user", content: captionRequestContent(lastPrompt, imageBytes) }],
    });
    const options = completeCaptionOptions(parseCaptionOptions(responseText(response)), scene, recentCaptions, 5, {
      requireSeed: true,
    });
    if (options.length) {
      return {
        caption: options[Math.floor(Math.random() * options.length)],
        options,
        prompt: lastPrompt,
      };
    }
  }

  const fallbackOptions = completeCaptionOptions([], scene, recentCaptions);
  return {
    caption: fallbackOptions[0] || variedFallbackCaption(scene, recentCaptions),
    options: fallbackOptions,
    prompt: lastPrompt,
  };
}

function normalizeSelectedCaption(caption) {
  const smallText = String(caption?.smallText || "")
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 36);
  const bigText = String(caption?.bigText || "")
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 44);
  if (!smallText || !bigText) throw new Error("Caption must include both lines");
  return { smallText, bigText };
}

async function loadPendingBackground(supabase, id) {
  const { data: row, error } = await supabase
    .from("backgrounds")
    .select("id, name, storage_path, scene, image_prompt, image_model, prompt_model, metadata")
    .eq("name", id)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Background not found: ${id}`);
  return row;
}

function sceneForBackground(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const scene = row.scene || metadata.scene;
  if (!scene || typeof scene !== "object") {
    throw new Error("Background has no saved scene metadata for caption generation");
  }
  return { scene, metadata };
}

async function generateCaptionOptionsForBackground(supabase, { id, captionModel }) {
  const row = await loadPendingBackground(supabase, id);
  const { scene, metadata } = sceneForBackground(row);

  const model = captionModel || process.env.OPENAI_CAPTION_MODEL || DEFAULT_CAPTION_MODEL;
  const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(row.storage_path);
  if (downloadErr) throw downloadErr;

  const imageBytes = Buffer.from(await blob.arrayBuffer());
  const openai = new OpenAI({ apiKey: env("OPENAI_API_KEY") });
  const recentCaptions = await loadRecentCaptions(supabase);
  const captionResult = await generateCaptionForScene({
    client: openai,
    model,
    scene,
    imageBytes,
    recentCaptions,
  });
  let captionOptions = captionResult.options?.length ? captionResult.options : [captionResult.caption];
  const selectedCaptionSig = captionSignature(captionResult.caption);
  if (!captionOptions.some((caption) => captionSignature(caption) === selectedCaptionSig)) {
    captionOptions = [captionResult.caption, ...captionOptions].slice(0, 5);
  }
  const selectedCaptionIndex = captionOptions.findIndex((caption) => captionSignature(caption) === selectedCaptionSig);

  const nextMetadata = {
    ...metadata,
    captionOptions,
    selectedCaptionIndex,
    captionPrompt: captionResult.prompt,
    captionModel: model,
    captionGeneratedAt: new Date().toISOString(),
    scene,
  };

  const { error: updateErr } = await supabase
    .from("backgrounds")
    .update({ metadata: nextMetadata })
    .eq("id", row.id)
    .eq("status", "pending");
  if (updateErr) throw updateErr;

  const { error: optionErr } = await supabase
    .from("caption_options")
    .insert(captionOptions.map((caption, optionIndex) => ({
      background_id: row.id,
      caption,
      caption_model: model,
      prompt: captionResult.prompt,
      metadata: {
        optionIndex,
        selectedCaptionIndex,
        scene,
      },
      status: "candidate",
    })));
  if (optionErr) throw optionErr;

  return {
    id,
    rawImageUrl: publicObjectUrl(supabaseUrl(), row.storage_path),
    captionOptions,
    selectedCaptionIndex,
    captionPrompt: captionResult.prompt,
    captionModel: model,
  };
}

async function approveBackgroundWithCaption(supabase, {
  id,
  caption,
  captionOptions,
  selectedCaptionIndex,
  captionModel,
  captionPrompt,
  layout,
  mediumLayout,
}) {
  const row = await loadPendingBackground(supabase, id);
  const { scene, metadata } = sceneForBackground(row);
  const finalCaption = normalizeSelectedCaption(caption);
  let finalCaptionOptions = Array.isArray(captionOptions) && captionOptions.length
    ? captionOptions.map((option) =>
        captionSignature(option) === captionSignature(caption) ? finalCaption : normalizeSelectedCaption(option)
      )
    : (metadata.captionOptions ?? [finalCaption]).map((option) =>
        captionSignature(option) === captionSignature(caption) ? finalCaption : normalizeSelectedCaption(option)
      );
  const selectedCaptionSig = captionSignature(finalCaption);
  if (!finalCaptionOptions.some((option) => captionSignature(option) === selectedCaptionSig)) {
    finalCaptionOptions = [finalCaption, ...finalCaptionOptions].slice(0, 5);
  }
  const finalSelectedCaptionIndex = Number.isInteger(selectedCaptionIndex)
    ? Math.max(0, Math.min(finalCaptionOptions.length - 1, selectedCaptionIndex))
    : finalCaptionOptions.findIndex((option) => captionSignature(option) === selectedCaptionSig);
  const selectedIndex = finalSelectedCaptionIndex < 0 ? 0 : finalSelectedCaptionIndex;
  finalCaptionOptions[selectedIndex] = finalCaption;

  const model = captionModel || metadata.captionModel || process.env.OPENAI_CAPTION_MODEL || DEFAULT_CAPTION_MODEL;
  const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(row.storage_path);
  if (downloadErr) throw downloadErr;

  const imageBytes = Buffer.from(await blob.arrayBuffer());
  const rawStoragePath = row.storage_path;
  const normalizedLayout = normalizeCaptionLayout(layout || metadata.captionLayout || {});
  const normalizedMediumLayout = normalizeMediumCaptionLayout(
    mediumLayout || metadata.mediumCaptionLayout || {},
    metadata.mediumCaptionLayout || normalizedLayout
  );
  const rendered = await overlayCaption(imageBytes, finalCaption, normalizedLayout);
  const renderedMedium = await overlayMediumCaption(imageBytes, finalCaption, normalizedMediumLayout);
  const finalStoragePath = captionedDraftStoragePath(row.name);
  const finalMediumStoragePath = mediumDraftStoragePath(row.name);
  await uploadVerifiedObject(supabase, finalStoragePath, rendered);
  await uploadVerifiedObject(supabase, finalMediumStoragePath, renderedMedium);

  const nextMetadata = {
    ...metadata,
    caption: finalCaption,
    captionOptions: finalCaptionOptions,
    selectedCaptionIndex: selectedIndex,
    captionPrompt: captionPrompt ?? metadata.captionPrompt ?? null,
    captionLayout: normalizedLayout,
    mediumCaptionLayout: normalizedMediumLayout,
    mediumStoragePath: finalMediumStoragePath,
    captionApprovedAt: new Date().toISOString(),
    captionModel: model,
    scene,
    scenePrompt: metadata.scenePrompt ?? row.image_prompt ?? null,
  };

  const { data: draftRow, error: updateErr } = await supabase
    .from("drafts")
    .upsert({
      name: row.name,
      storage_path: finalStoragePath,
      caption: finalCaption,
      scene,
      image_prompt: row.image_prompt ?? metadata.scenePrompt ?? null,
      raw_storage_path: rawStoragePath,
      image_model: row.image_model ?? metadata.imageModel ?? null,
      prompt_model: row.prompt_model ?? metadata.promptModel ?? null,
      caption_model: model,
      metadata: nextMetadata,
      status: "draft",
    }, { onConflict: "name" })
    .select("id")
    .maybeSingle();
  if (updateErr) {
    await supabase.storage.from(BUCKET).remove([finalStoragePath, finalMediumStoragePath]);
    throw updateErr;
  }

  const { error: optionErr } = await supabase
    .from("caption_options")
    .insert({
      background_id: row.id,
      draft_id: draftRow?.id ?? null,
      caption: finalCaption,
      caption_model: model,
      prompt: nextMetadata.captionPrompt,
      metadata: {
        captionLayout: normalizedLayout,
        mediumCaptionLayout: normalizedMediumLayout,
        mediumStoragePath: finalMediumStoragePath,
        optionIndex: selectedIndex,
        selectedCaptionIndex: selectedIndex,
        scene,
      },
      status: "selected",
    });
  if (optionErr) throw optionErr;

  const { error: backgroundErr } = await supabase
    .from("backgrounds")
    .update({
      status: "approved",
      approved_draft_name: row.name,
      approved_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending");
  if (backgroundErr) throw backgroundErr;

  return {
    id,
    imageUrl: publicObjectUrl(supabaseUrl(), finalStoragePath),
    mediumImageUrl: publicObjectUrl(supabaseUrl(), finalMediumStoragePath),
    rawImageUrl: publicObjectUrl(supabaseUrl(), rawStoragePath),
    caption: finalCaption,
    captionOptions: finalCaptionOptions,
    selectedCaptionIndex: selectedIndex,
    captionLayout: normalizedLayout,
    mediumCaptionLayout: normalizedMediumLayout,
    captionModel: model,
  };
}

async function listPrompts(supabase) {
  const { data, error } = await supabase
    .from("prompts")
    .select("id, name, scene, image_prompt, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.name,
    filename: `${row.name}.json`,
    data: {
      scene: row.scene,
      generatedAt: row.created_at,
    },
    imagePrompt: row.image_prompt,
  }));
}

async function resolveTargetsWithInstaloader(targets) {
  const scriptPath = join(__dirname, "instaloader_resolve.py");
  const py = spawn("python3", [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
  py.stdin.write(JSON.stringify({ targets }));
  py.stdin.end();
  let out = "", err = "";
  py.stdout.on("data", d => { out += d.toString(); });
  py.stderr.on("data", d => { err += d.toString(); });
  const code = await new Promise(resolve => py.on("close", resolve));
  if (code !== 0) throw new Error(err.trim() || "Instaloader resolver failed");
  let parsed;
  try { parsed = JSON.parse(out || "{}"); } catch { throw new Error("Instaloader resolver returned invalid JSON"); }
  if (parsed.error) throw new Error(parsed.error);
  if (!Array.isArray(parsed.items)) throw new Error("Instaloader resolver returned invalid items");
  return parsed.items;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const projectUrl = supabaseUrl();
  const supabaseKey = supabaseServiceRoleKey();
  const supabase = createClient(projectUrl, supabaseKey);

  const htmlPath = join(__dirname, "admin", "index.html");
  const indexHtml = readFileSync(htmlPath, "utf8");

  const port = Number(process.env.ADMIN_PORT || "3847");
  const host = process.env.ADMIN_HOST || "127.0.0.1";

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    // Static admin UI
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...CORS });
      res.end(indexHtml);
      return;
    }

    // Serve local draft/prompt images for the dashboard
    // GET /content/drafts/:name.png  or  /content/meta/:name.json  etc.
    if (req.method === "GET" && url.pathname.startsWith("/content/")) {
      const rel = url.pathname.replace(/^\/content\//, "");
      const safePath = join(CONTENT_DIR, rel);
      if (!safePath.startsWith(CONTENT_DIR)) {
        json(res, 403, { error: "Forbidden" });
        return;
      }
      try {
        const ext = extname(safePath).toLowerCase();
        const mime = ext === ".json" ? "application/json"
          : ext === ".txt" ? "text/plain"
          : ext === ".png" ? "image/png"
          : "application/octet-stream";
        const s = await stat(safePath);
        res.writeHead(200, { "Content-Type": mime, "Content-Length": s.size, ...CORS });
        createReadStream(safePath).pipe(res);
      } catch {
        json(res, 404, { error: "Not found" });
      }
      return;
    }

    if (!checkToken(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/stats") {
      try {
        const [
          { count: totalPosts },
          activeResult,
          storagePaths,
          draftsResult,
          backgroundsResult,
          promptsResult,
          discardedDraftsResult,
          discardedBackgroundsResult,
        ] = await Promise.all([
          supabase.from("posts").select("*", { count: "exact", head: true }),
          supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "active"),
          listAllStoragePaths(supabase),
          supabase.from("drafts").select("id, caption").eq("status", "draft"),
          supabase.from("backgrounds").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("prompts").select("*", { count: "exact", head: true }),
          supabase.from("drafts").select("*", { count: "exact", head: true }).eq("status", "discarded"),
          supabase.from("backgrounds").select("*", { count: "exact", head: true }).eq("status", "discarded"),
        ]);
        const activePosts = activeResult.error ? (totalPosts ?? 0) : (activeResult.count ?? 0);
        const captionedDrafts = draftsResult.error
          ? 0
          : (draftsResult.data ?? []).filter(row => hasCompleteCaption(row.caption)).length;
        const pendingBackgrounds = backgroundsResult.error ? 0 : (backgroundsResult.count ?? 0);
        json(res, 200, {
          totalPosts: totalPosts ?? 0,
          activePosts,
          storageFiles: storagePaths.length,
          drafts: captionedDrafts,
          backgrounds: pendingBackgrounds,
          prompts: promptsResult.error ? 0 : (promptsResult.count ?? 0),
          discarded:
            (discardedDraftsResult.error ? 0 : (discardedDraftsResult.count ?? 0)) +
            (discardedBackgroundsResult.error ? 0 : (discardedBackgroundsResult.count ?? 0)),
        });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    // ── Library (Storage images) ────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/images") {
      try {
        let { data, error } = await supabase
          .from("posts")
          .select("id, instagram_id, storage_path, caption, created_at, status")
          .order("created_at", { ascending: false });
        // If status column doesn't exist yet, retry without it and treat all as active
        if (error) {
          ({ data, error } = await supabase
            .from("posts")
            .select("id, instagram_id, storage_path, caption, created_at")
            .order("created_at", { ascending: false }));
        }
        if (error) throw error;
        const items = (data ?? []).map(row => ({
          id: row.id,
          instagramId: row.instagram_id,
          storagePath: row.storage_path,
          caption: row.caption,
          createdAt: row.created_at,
          status: row.status ?? "active",
          publicUrl: publicObjectUrl(projectUrl, row.storage_path),
        }));
        json(res, 200, { items });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/images/set-status") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      const paths = Array.isArray(payload.paths) ? payload.paths.filter(p => typeof p === "string") : [];
      const status = typeof payload.status === "string" && ["active", "inactive"].includes(payload.status) ? payload.status : null;
      if (!paths.length || !status) { json(res, 400, { error: "paths[] and status ('active'|'inactive') required" }); return; }
      const { error } = await supabase.from("posts").update({ status }).in("storage_path", paths);
      if (error) { json(res, 500, { error: error.message }); return; }
      json(res, 200, { updated: paths.length, status });
      return;
    }

    // ── Drafts ─────────────────────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/drafts") {
      try {
        json(res, 200, { drafts: await listDrafts(supabase, projectUrl) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    // ── Backgrounds ────────────────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/backgrounds") {
      try {
        json(res, 200, { backgrounds: await listBackgrounds(supabase, projectUrl) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backgrounds/message-options") {
      const payload = await readBody(req);
      if (!payload?.id) { json(res, 400, { error: "id required" }); return; }
      try {
        const result = await generateCaptionOptionsForBackground(supabase, {
          id: payload.id,
          captionModel: payload.captionModel,
        });
        json(res, 200, { success: true, ...result });
      } catch (e) {
        json(res, e.message?.startsWith("Background not found") ? 404 : 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backgrounds/approve") {
      const payload = await readBody(req);
      if (!payload?.id) { json(res, 400, { error: "id required" }); return; }
      if (!payload?.caption?.smallText || !payload?.caption?.bigText) {
        json(res, 400, { error: "caption with smallText and bigText required" });
        return;
      }
      try {
        const result = await approveBackgroundWithCaption(supabase, {
          id: payload.id,
          caption: payload.caption,
          captionOptions: payload.captionOptions,
          selectedCaptionIndex: payload.selectedCaptionIndex,
          captionModel: payload.captionModel,
          captionPrompt: payload.captionPrompt,
          layout: payload.layout,
          mediumLayout: payload.mediumLayout,
        });
        json(res, 200, { success: true, ...result });
      } catch (e) {
        json(res, e.message?.startsWith("Background not found") ? 404 : 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backgrounds/discard") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      try {
        let query = supabase.from("backgrounds").update({ status: "discarded" });
        if (payload.all) {
          query = query.eq("status", "pending");
        } else if (payload.id) {
          query = query.eq("name", payload.id).eq("status", "pending");
        } else {
          json(res, 400, { error: "Provide all or id" }); return;
        }

        const { data, error } = await query.select("name");
        if (error) throw error;
        if (!data?.length) {
          json(res, 404, { error: payload.id ? `Background not found: ${payload.id}` : "No backgrounds matched" });
          return;
        }
        json(res, 200, { success: true, updated: data.length, ids: data.map(row => row.name) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/drafts/publish") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      const status = payload.status === "inactive" ? "inactive" : "active";

      // Single draft from review UI — inline, no background job.
      if (payload.id && !payload.all && !payload.count) {
        try {
          const draft = await getDraftForPublish(supabase, payload.id);
          const storagePath = await publishDraftFromDb(supabase, draft, { status });
          json(res, 200, { success: true, id: payload.id, storagePath, status });
        } catch (e) {
          json(res, e.message?.startsWith("Draft not found") ? 404 : 500, { error: e.message });
        }
        return;
      }

      let args = [];
      if (payload.all) args = ["--all"];
      else if (payload.count) args = ["--count", String(payload.count)];
      else { json(res, 400, { error: "Provide all, count, or id" }); return; }
      if (status === "inactive") args = [...args, "--status", "inactive"];

      const jobId = spawnJob("publish", "publish.js", args);
      json(res, 200, { jobId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/drafts/render-caption") {
      const payload = await readBody(req);
      if (!payload?.id) { json(res, 400, { error: "id required" }); return; }
      try {
        const result = await renderDraftCaption(supabase, {
          id: payload.id,
          caption: payload.caption,
          layout: payload.layout,
          mediumLayout: payload.mediumLayout,
        });
        json(res, 200, { success: true, ...result });
      } catch (e) {
        json(res, e.message?.startsWith("Draft not found") ? 404 : 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/drafts/discard") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      try {
        let query = supabase.from("drafts").update({ status: "discarded" });
        if (payload.all) {
          query = query.eq("status", "draft");
        } else if (payload.id) {
          query = query.eq("name", payload.id).eq("status", "draft");
        } else {
          json(res, 400, { error: "Provide all or id" }); return;
        }

        const { data, error } = await query.select("name");
        if (error) throw error;
        if (!data?.length) {
          json(res, 404, { error: payload.id ? `Draft not found: ${payload.id}` : "No drafts matched" });
          return;
        }
        json(res, 200, { success: true, updated: data.length, ids: data.map(row => row.name) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    // ── Prompts ────────────────────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/prompts") {
      try {
        json(res, 200, { prompts: await listPrompts(supabase) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/prompts/delete") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      const ids = Array.isArray(payload.ids)
        ? payload.ids.filter(id => typeof id === "string" && id.trim())
        : [];
      if (!ids.length) { json(res, 400, { error: "ids[] required" }); return; }

      try {
        const { data, error } = await supabase
          .from("prompts")
          .delete()
          .in("name", ids)
          .select("name");
        if (error) throw error;
        if (!data?.length) {
          json(res, 404, { error: "No prompts matched" });
          return;
        }
        json(res, 200, { success: true, deleted: data.length, ids: data.map(row => row.name) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    // ── Generate ───────────────────────────────────────────────────────────

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      const args = [];
      if (payload.count) args.push("--count", String(payload.count));
      if (payload.mode) args.push("--mode", payload.mode);
      if (payload.model) args.push("--model", payload.model);
      if (payload.promptModel) args.push("--prompt-model", payload.promptModel);
      if (payload.size) args.push("--size", payload.size);
      if (payload.dryRun) args.push("--dry-run");
      if (payload.idea && String(payload.idea).trim()) args.push("--idea", String(payload.idea));
      if (payload.directionMode) args.push("--direction-mode", String(payload.directionMode));
      if (payload.cameraLook) args.push("--camera-look", String(payload.cameraLook));
      if (payload.vibePreset) args.push("--vibe-preset", String(payload.vibePreset));
      if (payload.styleNotes && String(payload.styleNotes).trim()) args.push("--style-notes", String(payload.styleNotes));
      if (Array.isArray(payload.promptIds) && payload.promptIds.length) {
        args.push("--prompt-ids", payload.promptIds.join(","));
      }

      console.log(`[generate] ${args.join(" ") || "(default random generation)"}`);
      const jobId = spawnJob("generate", "generate.js", args);
      json(res, 200, { jobId });
      return;
    }

    // ── Sync ───────────────────────────────────────────────────────────────

    if (req.method === "POST" && url.pathname === "/api/sync") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      const args = [];
      if (payload.bulk) args.push("--bulk");

      const extraEnv = {};
      if (payload.username) extraEnv.INSTAGRAM_USERNAME = payload.username;
      if (payload.sessionId) extraEnv.INSTAGRAM_SESSIONID = payload.sessionId;
      if (payload.maxPosts) extraEnv.MAX_POSTS = String(payload.maxPosts);

      const jobId = spawnJob("sync", "sync.js", args, extraEnv);
      json(res, 200, { jobId });
      return;
    }

    // ── Jobs ───────────────────────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const list = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20).map(j => ({
        id: j.id, type: j.type, status: j.status, exitCode: j.exitCode,
        startedAt: j.startedAt, linesCount: j.lines.length,
      }));
      json(res, 200, { jobs: list });
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) { json(res, 404, { error: "Job not found" }); return; }
      json(res, 200, { id: job.id, type: job.type, status: job.status, exitCode: job.exitCode, startedAt: job.startedAt, lines: job.lines });
      return;
    }

    const streamMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/stream$/);
    if (req.method === "GET" && streamMatch) {
      const job = jobs.get(streamMatch[1]);
      if (!job) { json(res, 404, { error: "Job not found" }); return; }
      const since = Math.max(0, Number(url.searchParams.get("since") || "0") || 0);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...CORS,
      });

      // Replay buffered lines
      for (const line of job.lines.slice(since)) {
        res.write(`data: ${JSON.stringify({ line })}\n\n`);
      }

      if (job.status !== "running") {
        res.write(`data: ${JSON.stringify({ done: true, exitCode: job.exitCode })}\n\n`);
        res.end();
        return;
      }

      if (!sseClients.has(job.id)) sseClients.set(job.id, new Set());
      sseClients.get(job.id).add(res);

      req.on("close", () => {
        const clients = sseClients.get(job.id);
        if (clients) clients.delete(res);
      });
      return;
    }

    // ── Maintenance ────────────────────────────────────────────────────────

    if (req.method === "POST" && url.pathname === "/api/maintenance/prune") {
      const jobId = spawnJob("prune", "prune-orphan-posts.js");
      json(res, 200, { jobId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/maintenance/migrate") {
      const jobId = spawnJob("migrate", "migrate.js");
      json(res, 200, { jobId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/maintenance/clear") {
      const payload = await readBody(req);
      if (payload?.confirm !== "CLEAR") {
        json(res, 400, { error: "Send { confirm: 'CLEAR' } to proceed" });
        return;
      }
      const jobId = spawnJob("clear", "clear-posts-and-storage.js");
      json(res, 200, { jobId });
      return;
    }

    // ── Instagram Import ───────────────────────────────────────────────────

    if (req.method === "POST" && url.pathname === "/api/preview") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      const input = typeof payload.input === "string" ? payload.input : "";
      const targets = parsePostTargetsFromInput(input).slice(0, 20);
      if (!targets.length) {
        json(res, 400, { error: "Paste at least one Instagram /p/ or /reel/ link." });
        return;
      }
      try {
        const resolved = await resolveTargetsWithInstaloader(targets);
        const items = [];
        for (const it of resolved) {
          const shortcode = it.shortcode;
          const kind = it.kind === "reel" ? "reel" : "p";
          try {
            if (it.error) {
              items.push({ shortcode, kind, media_index: Number(it.media_index || 1), media_count: Number(it.media_count || 1), caption: null, error: it.error });
              continue;
            }
            const imageUrl = typeof it.image_url === "string" ? it.image_url : null;
            if (!imageUrl) {
              items.push({ shortcode, kind, media_index: Number(it.media_index || 1), media_count: Number(it.media_count || 1), caption: null, error: "No image URL" });
              continue;
            }
            const raw = await downloadImage(imageUrl);
            const small = await resizeForPreview(raw);
            items.push({
              shortcode, kind,
              media_index: Number(it.media_index || 1),
              media_count: Number(it.media_count || 1),
              caption: it.caption || null,
              image_url: imageUrl,
              previewDataUrl: `data:image/jpeg;base64,${small.toString("base64")}`,
            });
          } catch (e) {
            items.push({ shortcode, kind, media_index: Number(it.media_index || 1), media_count: Number(it.media_count || 1), caption: null, error: e.message });
          }
        }
        json(res, 200, { items });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/import-posts") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      let items = [];
      if (Array.isArray(payload.items) && payload.items.length) {
        for (const it of payload.items) {
          if (!it || typeof it.shortcode !== "string" || !/^[A-Za-z0-9_-]+$/.test(it.shortcode)) continue;
          const image_url = typeof it.image_url === "string" ? it.image_url : null;
          if (!image_url) continue;
          items.push({
            shortcode: it.shortcode,
            kind: it.kind === "reel" ? "reel" : "p",
            media_index: Number(it.media_index || 1),
            media_count: Number(it.media_count || 1),
            image_url,
            caption: typeof it.caption === "string" ? it.caption : null,
          });
        }
        items = items.slice(0, 100);
      } else {
        json(res, 400, { error: "items[] required" });
        return;
      }
      if (!items.length) { json(res, 400, { error: "No valid import items" }); return; }
      const results = [];
      for (const it of items) {
        const shortcode = it.shortcode;
        const mediaIndex = Number(it.media_index || 1);
        const mediaCount = Number(it.media_count || 1);
        try {
          if (it.error) { results.push({ shortcode, media_index: mediaIndex, ok: false, error: it.error }); continue; }
          const imageBytes = await downloadImage(it.image_url);
          const toUpload = await resizeForWidget(imageBytes);
          const storagePath = mediaCount > 1 ? `${PREFIX}/${shortcode}-${mediaIndex}.jpg` : `${PREFIX}/${shortcode}.jpg`;
          const instagramId = mediaCount > 1 ? `${shortcode}_${mediaIndex}` : shortcode;
          const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, toUpload, { contentType: "image/jpeg", upsert: true });
          if (uploadErr) throw uploadErr;
          const { error: insertErr } = await supabase.from("posts").upsert({ instagram_id: instagramId, storage_path: storagePath, caption: it.caption || null, posted_at: null }, { onConflict: "instagram_id" });
          if (insertErr) throw insertErr;
          results.push({ shortcode, media_index: mediaIndex, ok: true, storagePath });
        } catch (e) {
          results.push({ shortcode, media_index: mediaIndex, ok: false, error: e.message });
        }
      }
      const okn = results.filter(r => r.ok).length;
      json(res, 200, { results, message: `Imported ${okn} of ${items.length}.` });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/delete") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      const paths = Array.isArray(payload.paths) ? payload.paths.filter(p => typeof p === "string") : [];
      if (!paths.length) { json(res, 400, { error: "paths[] required" }); return; }
      let removedStorage = 0, removedRows = 0;
      const errors = [];
      for (const storagePath of paths) {
        if (!storagePath.startsWith(`${PREFIX}/`)) { errors.push({ path: storagePath, step: "validate", message: "Invalid path" }); continue; }
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove([storagePath]);
        if (rmErr) { errors.push({ path: storagePath, step: "storage", message: rmErr.message }); continue; }
        removedStorage++;
        const { data: deleted, error: dbErr } = await supabase.from("posts").delete().eq("storage_path", storagePath).select("id");
        if (dbErr) errors.push({ path: storagePath, step: "database", message: dbErr.message });
        else removedRows += deleted?.length ?? 0;
      }
      json(res, 200, { removedStorage, removedRows, errors: errors.length ? errors : undefined, message: `Removed ${removedStorage} file(s); deleted ${removedRows} post row(s).` });
      return;
    }

    json(res, 404, { error: "Not found" });
  });

  server.listen(port, host, () => {
    console.log(`Admin UI: http://${host}:${port}/`);
    console.log(`Dashboard API: http://${host}:${port}/api/`);
    if (process.env.ADMIN_TOKEN) console.log("ADMIN_TOKEN is set.");
    else console.log("No ADMIN_TOKEN — localhost only.");
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
