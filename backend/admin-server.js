/**
 * Local admin UI + dashboard API.
 * Security: uses SUPABASE_SERVICE_ROLE_KEY — localhost only.
 *
 *   cd backend && npm run admin
 *   open http://127.0.0.1:3847/
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  BUCKET as IG_BUCKET,
  downloadImage,
  parsePostTargetsFromInput,
  resizeForPreview,
  resizeForWidget,
} from "./instagram-helper.js";
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

function spawnJob(type, scriptName, args = [], extraEnv = {}) {
  const jobId = createJob(type);
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

function publicObjectUrl(supaUrl, storagePath) {
  const base = supaUrl.replace(/\/+$/, "");
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${BUCKET}/${encoded}`;
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

async function safeDirCount(dir) {
  try { return (await readdir(dir)).length; } catch { return 0; }
}

// ─── Content Filesystem Helpers ───────────────────────────────────────────────

async function listDrafts() {
  let files;
  try { files = await readdir(join(CONTENT_DIR, "drafts")); } catch { return []; }
  const pngs = files.filter(f => f.endsWith(".png") && !f.endsWith(".background.png")).sort();
  const drafts = [];
  for (const filename of pngs) {
    const name = basename(filename, ".png");
    let meta = null;
    try {
      const raw = await readFile(join(CONTENT_DIR, "meta", `${name}.json`), "utf8");
      meta = JSON.parse(raw);
    } catch {}
    drafts.push({ id: name, filename, meta });
  }
  return drafts;
}

async function listPrompts() {
  let files;
  try { files = await readdir(join(CONTENT_DIR, "prompts")); } catch { return []; }
  const jsons = files.filter(f => f.endsWith(".json") && !f.includes(".image-prompt")).sort();
  const prompts = [];
  for (const filename of jsons) {
    const name = basename(filename, ".json");
    try {
      const raw = await readFile(join(CONTENT_DIR, "prompts", filename), "utf8");
      const data = JSON.parse(raw);
      let imagePrompt = null;
      try { imagePrompt = await readFile(join(CONTENT_DIR, "prompts", `${name}.image-prompt.txt`), "utf8"); } catch {}
      prompts.push({ id: name, filename, data, imagePrompt });
    } catch {}
  }
  return prompts;
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

    // Static legacy admin UI
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
          { count: activePosts },
          storagePaths,
          draftsCount,
          promptsCount,
          discardedCount,
        ] = await Promise.all([
          supabase.from("posts").select("*", { count: "exact", head: true }),
          supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "active"),
          listAllStoragePaths(supabase),
          safeDirCount(join(CONTENT_DIR, "drafts")),
          safeDirCount(join(CONTENT_DIR, "prompts")),
          safeDirCount(join(CONTENT_DIR, "discarded")),
        ]);
        json(res, 200, {
          totalPosts: totalPosts ?? 0,
          activePosts: activePosts ?? 0,
          storageFiles: storagePaths.length,
          drafts: Math.floor(draftsCount / 3), // each draft = .png + .json + .txt
          prompts: Math.floor(promptsCount / 2),
          discarded: Math.floor(discardedCount / 2),
        });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    // ── Library (Storage images) ────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/images") {
      try {
        const { data, error } = await supabase
          .from("posts")
          .select("id, instagram_id, storage_path, caption, created_at, status")
          .order("created_at", { ascending: false });
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
        json(res, 200, { drafts: await listDrafts() });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/drafts/publish") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      let args = [];
      if (payload.all) args = ["--all"];
      else if (payload.count) args = ["--count", String(payload.count)];
      else if (payload.id) args = ["--id", payload.id];
      else { json(res, 400, { error: "Provide all, count, or id" }); return; }

      const jobId = spawnJob("publish", "publish.js", args);
      json(res, 200, { jobId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/drafts/discard") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }

      let args = [];
      if (payload.all) args = ["--all"];
      else if (payload.count) args = ["--count", String(payload.count)];
      else if (payload.id) args = ["--id", payload.id];
      else { json(res, 400, { error: "Provide all, count, or id" }); return; }

      const jobId = spawnJob("discard", "discard.js", args);
      json(res, 200, { jobId });
      return;
    }

    // ── Prompts ────────────────────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/prompts") {
      try {
        json(res, 200, { prompts: await listPrompts() });
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
      if (payload.captionModel) args.push("--caption-model", payload.captionModel);
      if (payload.size) args.push("--size", payload.size);
      if (payload.dryRun) args.push("--dry-run");

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

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...CORS,
      });

      // Replay buffered lines
      for (const line of job.lines) {
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

    // ── Instagram Import (legacy + dashboard) ──────────────────────────────

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
