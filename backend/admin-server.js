/**
 * Local admin UI + dashboard API.
 * Security: uses SUPABASE_SERVICE_ROLE_KEY — localhost only.
 *
 *   cd backend && npm run admin
 *   open http://127.0.0.1:3847/
 */
import "dotenv/config";
import OpenAI, { toFile } from "openai";
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
import { getInstagramConnectionStatus, publishInstagramCarousel } from "./instagram-publisher.js";
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
const DEFAULT_IMAGE_EDIT_MODEL = "gpt-image-1-mini";
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

function runInProcessJob(type, handler) {
  const jobId = createJob(type);
  queueMicrotask(async () => {
    try {
      await handler({
        log: (line) => addJobLine(jobId, line),
      });
      finishJob(jobId, 0);
    } catch (e) {
      addJobLine(jobId, `[err] ${e.message || e}`);
      finishJob(jobId, 1);
    }
  });
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

function revisedBackgroundName(sourceName) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${sourceName}_tweak_${stamp}_${randomUUID().slice(0, 8)}`;
}

function hasCompleteCaption(caption) {
  return Boolean(caption?.smallText && caption?.bigText);
}

const BACKGROUND_STATUSES = new Set(["pending", "staged", "approved", "discarded"]);

function normalizeBackgroundStatus(status, fallback = "pending") {
  const normalized = String(status || fallback).trim().toLowerCase();
  return BACKGROUND_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeBackgroundQueueStatus(status, fallback = "pending") {
  const normalized = String(status || fallback).trim().toLowerCase();
  return ["pending", "staged"].includes(normalized) ? normalized : null;
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
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

async function deletePostImage(supabase, { id, storagePath }) {
  let query = supabase
    .from("posts")
    .select("id, storage_path")
    .limit(2);
  if (id) query = query.eq("id", id);
  else query = query.eq("storage_path", storagePath);

  const { data: rows, error: selectErr } = await query;
  if (selectErr) throw selectErr;
  if (!rows?.length) throw httpError("Post image not found", 404);
  if (rows.length > 1) throw httpError("Delete target is ambiguous. Refresh and try again.", 409);

  const row = rows[0];
  if (storagePath && row.storage_path !== storagePath) {
    throw httpError("Delete target changed. Refresh and try again.", 409);
  }
  if (!row.storage_path.startsWith(`${PREFIX}/`)) {
    throw httpError("Invalid storage path", 400);
  }

  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (rmErr) throw rmErr;

  const { data: deleted, error: dbErr } = await supabase
    .from("posts")
    .delete()
    .eq("id", row.id)
    .select("id, storage_path");
  if (dbErr) throw dbErr;
  if (!deleted?.length) throw httpError("Post image row was already deleted", 404);

  return {
    removedStorage: 1,
    removedRows: deleted.length,
    removed: deleted.map(item => ({ id: item.id, storagePath: item.storage_path })),
  };
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

const CAROUSEL_ITEM_COUNT = 5;
const EDITABLE_CAROUSEL_STATUSES = new Set(["draft", "ready", "failed"]);

function httpError(message, statusCode = 500) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function postToStorageImage(row, projectUrl) {
  return {
    id: row.id,
    instagramId: row.instagram_id,
    storagePath: row.storage_path,
    caption: row.caption,
    createdAt: row.created_at,
    status: row.status ?? "active",
    publicUrl: publicObjectUrl(projectUrl, row.storage_path),
  };
}

function normalizeCarouselPostIds(value) {
  const postIds = Array.isArray(value) ? value.filter(id => typeof id === "string" && id.trim()) : [];
  if (postIds.length !== CAROUSEL_ITEM_COUNT) {
    throw httpError(`Choose exactly ${CAROUSEL_ITEM_COUNT} Library posts for a carousel`, 400);
  }
  if (new Set(postIds).size !== postIds.length) {
    throw httpError("A carousel cannot use the same Library post twice", 400);
  }
  return postIds;
}

async function getActivePostsInOrder(supabase, postIds) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, instagram_id, storage_path, caption, created_at, status")
    .in("id", postIds);
  if (error) throw error;
  const byId = new Map((data ?? []).map(row => [row.id, row]));
  const missing = postIds.filter(id => !byId.has(id));
  if (missing.length) throw httpError(`Library post not found: ${missing[0]}`, 400);
  const posts = postIds.map(id => byId.get(id));
  const inactive = posts.find(row => (row.status ?? "active") !== "active");
  if (inactive) throw httpError("Carousels can only use active Library posts", 400);
  return posts;
}

function serializeCarousel(row, items, postsById, projectUrl) {
  return {
    id: row.id,
    title: row.title || "",
    caption: row.caption || "",
    status: row.status,
    instagramMediaId: row.instagram_media_id || null,
    permalink: row.permalink || null,
    lastError: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    postedAt: row.posted_at || null,
    items: items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(item => {
        const post = postsById.get(item.post_id) || null;
        return {
          id: item.id,
          carouselId: item.carousel_id,
          postId: item.post_id,
          position: item.position,
          storagePathSnapshot: item.storage_path_snapshot,
          captionSnapshot: item.caption_snapshot || null,
          createdAt: item.created_at,
          post: post ? postToStorageImage(post, projectUrl) : null,
        };
      }),
  };
}

async function readCarousel(supabase, projectUrl, id) {
  const { data: row, error } = await supabase
    .from("instagram_carousels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: items, error: itemsError } = await supabase
    .from("instagram_carousel_items")
    .select("*")
    .eq("carousel_id", id)
    .order("position", { ascending: true });
  if (itemsError) throw itemsError;

  const postIds = [...new Set((items ?? []).map(item => item.post_id))];
  const postsById = new Map();
  if (postIds.length) {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, instagram_id, storage_path, caption, created_at, status")
      .in("id", postIds);
    if (postsError) throw postsError;
    for (const post of posts ?? []) postsById.set(post.id, post);
  }

  return serializeCarousel(row, items ?? [], postsById, projectUrl);
}

async function listCarousels(supabase, projectUrl, { includeArchived = false } = {}) {
  let query = supabase
    .from("instagram_carousels")
    .select("*")
    .order("created_at", { ascending: false });
  if (!includeArchived) query = query.neq("status", "archived");

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows?.length) return [];

  const carouselIds = rows.map(row => row.id);
  const { data: items, error: itemsError } = await supabase
    .from("instagram_carousel_items")
    .select("*")
    .in("carousel_id", carouselIds)
    .order("position", { ascending: true });
  if (itemsError) throw itemsError;

  const postIds = [...new Set((items ?? []).map(item => item.post_id))];
  const postsById = new Map();
  if (postIds.length) {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, instagram_id, storage_path, caption, created_at, status")
      .in("id", postIds);
    if (postsError) throw postsError;
    for (const post of posts ?? []) postsById.set(post.id, post);
  }

  const itemsByCarousel = new Map();
  for (const item of items ?? []) {
    if (!itemsByCarousel.has(item.carousel_id)) itemsByCarousel.set(item.carousel_id, []);
    itemsByCarousel.get(item.carousel_id).push(item);
  }

  return rows.map(row => serializeCarousel(row, itemsByCarousel.get(row.id) ?? [], postsById, projectUrl));
}

async function createCarousel(supabase, projectUrl, payload) {
  const postIds = normalizeCarouselPostIds(payload?.postIds);
  const posts = await getActivePostsInOrder(supabase, postIds);
  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.trim().slice(0, 120)
    : `Carousel ${new Date().toLocaleDateString()}`;
  const caption = typeof payload.caption === "string" ? payload.caption : "";
  const status = payload.status === "ready" ? "ready" : "draft";

  const { data: row, error } = await supabase
    .from("instagram_carousels")
    .insert({ title, caption, status, last_error: null })
    .select("id")
    .single();
  if (error) throw error;

  const itemRows = posts.map((post, index) => ({
    carousel_id: row.id,
    post_id: post.id,
    position: index + 1,
    storage_path_snapshot: post.storage_path,
    caption_snapshot: post.caption || null,
  }));
  const { error: itemError } = await supabase.from("instagram_carousel_items").insert(itemRows);
  if (itemError) {
    await supabase.from("instagram_carousels").delete().eq("id", row.id);
    throw itemError;
  }

  return await readCarousel(supabase, projectUrl, row.id);
}

async function updateCarousel(supabase, projectUrl, id, payload) {
  const existing = await readCarousel(supabase, projectUrl, id);
  if (!existing) throw httpError("Carousel not found", 404);
  if (!EDITABLE_CAROUSEL_STATUSES.has(existing.status)) {
    throw httpError(`Cannot edit a ${existing.status} carousel`, 400);
  }

  let posts = null;
  if (Object.prototype.hasOwnProperty.call(payload, "postIds")) {
    const postIds = normalizeCarouselPostIds(payload.postIds);
    posts = await getActivePostsInOrder(supabase, postIds);
  }

  const patch = {};
  if (typeof payload.title === "string") patch.title = payload.title.trim().slice(0, 120);
  if (typeof payload.caption === "string") patch.caption = payload.caption;
  if (typeof payload.status === "string") {
    if (!["draft", "ready"].includes(payload.status)) throw httpError("status must be draft or ready", 400);
    patch.status = payload.status;
  }
  if (Object.keys(patch).length) {
    patch.last_error = null;
    const { error } = await supabase.from("instagram_carousels").update(patch).eq("id", id);
    if (error) throw error;
  }

  if (posts) {
    const { error: deleteError } = await supabase.from("instagram_carousel_items").delete().eq("carousel_id", id);
    if (deleteError) throw deleteError;
    const itemRows = posts.map((post, index) => ({
      carousel_id: id,
      post_id: post.id,
      position: index + 1,
      storage_path_snapshot: post.storage_path,
      caption_snapshot: post.caption || null,
    }));
    const { error: insertError } = await supabase.from("instagram_carousel_items").insert(itemRows);
    if (insertError) throw insertError;
  }

  return await readCarousel(supabase, projectUrl, id);
}

async function duplicateCarousel(supabase, projectUrl, id) {
  const existing = await readCarousel(supabase, projectUrl, id);
  if (!existing) throw httpError("Carousel not found", 404);
  return await createCarousel(supabase, projectUrl, {
    postIds: existing.items.map(item => item.postId),
    caption: existing.caption,
    title: `${existing.title || "Carousel"} copy`,
  });
}

async function archiveCarousel(supabase, projectUrl, id) {
  const existing = await readCarousel(supabase, projectUrl, id);
  if (!existing) throw httpError("Carousel not found", 404);
  if (existing.status === "posting") throw httpError("Cannot archive a carousel while it is posting", 400);
  const { error } = await supabase
    .from("instagram_carousels")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw error;
  return await readCarousel(supabase, projectUrl, id);
}

async function exportCarouselPackage(supabase, projectUrl, id) {
  const existing = await readCarousel(supabase, projectUrl, id);
  if (!existing) throw httpError("Carousel not found", 404);
  if (existing.items.length !== CAROUSEL_ITEM_COUNT || existing.items.some(item => !item.post)) {
    throw httpError(`Carousel must have exactly ${CAROUSEL_ITEM_COUNT} Library posts before export`, 400);
  }

  const safeTitle = (existing.title || "carousel")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "carousel";

  return {
    id: existing.id,
    title: existing.title,
    caption: existing.caption,
    status: existing.status,
    items: existing.items.map((item, index) => ({
      position: index + 1,
      postId: item.postId,
      storagePath: item.post.storagePath,
      url: item.post.publicUrl,
      filename: `${String(index + 1).padStart(2, "0")}-${safeTitle}.${item.post.storagePath.split(".").pop() || "jpg"}`,
    })),
  };
}

async function markCarouselPosted(supabase, projectUrl, id, payload = {}) {
  const existing = await readCarousel(supabase, projectUrl, id);
  if (!existing) throw httpError("Carousel not found", 404);
  if (existing.status === "posting") throw httpError("Cannot manually mark a carousel posted while it is posting", 400);
  if (existing.status === "archived") throw httpError("Cannot manually mark an archived carousel posted", 400);

  const patch = {
    status: "posted",
    posted_at: new Date().toISOString(),
    last_error: null,
  };
  if (typeof payload.permalink === "string" && payload.permalink.trim()) {
    patch.permalink = payload.permalink.trim();
  }

  const { error } = await supabase.from("instagram_carousels").update(patch).eq("id", id);
  if (error) throw error;
  return await readCarousel(supabase, projectUrl, id);
}

async function publishCarouselNow(supabase, projectUrl, id, log) {
  const existing = await readCarousel(supabase, projectUrl, id);
  if (!existing) throw httpError("Carousel not found", 404);
  if (["posting", "posted", "archived"].includes(existing.status)) {
    throw httpError(`Cannot post a ${existing.status} carousel`, 400);
  }
  if (existing.items.length !== CAROUSEL_ITEM_COUNT || existing.items.some(item => !item.post)) {
    throw httpError(`Carousel must have exactly ${CAROUSEL_ITEM_COUNT} Library posts`, 400);
  }
  const inactive = existing.items.find(item => item.post.status !== "active");
  if (inactive) throw httpError("Carousels can only publish active Library posts", 400);

  const { error: postingError } = await supabase
    .from("instagram_carousels")
    .update({ status: "posting", last_error: null })
    .eq("id", id);
  if (postingError) throw postingError;

  try {
    log(`Publishing carousel ${id}`);
    const imageUrls = existing.items.map(item => item.post.publicUrl);
    const result = await publishInstagramCarousel({
      imageUrls,
      caption: existing.caption,
      log,
    });
    const { error: postedError } = await supabase
      .from("instagram_carousels")
      .update({
        status: "posted",
        instagram_media_id: result.instagramMediaId,
        permalink: result.permalink,
        posted_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id);
    if (postedError) throw postedError;
    log(`Published Instagram media ${result.instagramMediaId}`);
    if (result.permalink) log(result.permalink);
  } catch (e) {
    await supabase
      .from("instagram_carousels")
      .update({ status: "failed", last_error: e.message || String(e) })
      .eq("id", id);
    throw e;
  }
}

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

async function listBackgrounds(supabase, projectUrl, status = "pending") {
  const normalizedStatus = normalizeBackgroundStatus(status);
  const backgroundsResult = await supabase
    .from("backgrounds")
    .select("id, name, storage_path, scene, image_prompt, image_model, prompt_model, status, approved_at, created_at, metadata")
    .eq("status", normalizedStatus)
    .order("created_at", { ascending: true });
  if (backgroundsResult.error) throw backgroundsResult.error;

  return (backgroundsResult.data ?? []).map(row => backgroundDraftFromRow(row, projectUrl));
}

function backgroundDraftFromRow(row, projectUrl) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.name,
    dbId: row.id,
    filename: `${row.name}.png`,
    imageUrl: publicObjectUrl(projectUrl, row.storage_path),
    rawImageUrl: publicObjectUrl(projectUrl, row.storage_path),
    meta: {
      caption: null,
      captionOptions: metadata.captionOptions ?? null,
      selectedCaptionIndex: metadata.selectedCaptionIndex ?? null,
      captionPrompt: metadata.captionPrompt ?? null,
      captionLayout: metadata.captionLayout ?? null,
      mediumCaptionLayout: metadata.mediumCaptionLayout ?? null,
      mediumStoragePath: metadata.mediumStoragePath ?? null,
      mediumImageUrl: metadata.mediumStoragePath
        ? publicObjectUrl(projectUrl, metadata.mediumStoragePath)
        : null,
      backgroundStatus: row.status ?? null,
      imageApprovedAt: metadata.imageApprovedAt ?? null,
      approvedAt: row.approved_at ?? null,
      scene: row.scene ?? metadata.scene ?? null,
      imageModel: row.image_model,
      captionModel: metadata.captionModel ?? null,
      promptModel: row.prompt_model,
      generatedAt: row.created_at,
    },
  };
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function loadBackgroundWithStatuses(supabase, id, statuses) {
  const allowedStatuses = statuses
    .map(status => normalizeBackgroundStatus(status, null))
    .filter(Boolean);
  if (!allowedStatuses.length) throw new Error("No valid background statuses provided");

  const { data: row, error } = await supabase
    .from("backgrounds")
    .select("id, name, storage_path, scene, image_prompt, image_model, prompt_model, status, approved_at, metadata")
    .eq("name", id)
    .in("status", allowedStatuses)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Background not found: ${id}`);
  return row;
}

async function loadPendingBackground(supabase, id) {
  return loadBackgroundWithStatuses(supabase, id, ["pending"]);
}

async function findBackgroundMatch(supabase, { id, dbId, statuses }) {
  const target = dbId || id;
  if (!target) throw Object.assign(new Error("Provide id"), { statusCode: 400 });
  const allowedStatuses = statuses
    .map(status => normalizeBackgroundStatus(status, null))
    .filter(Boolean);
  if (!allowedStatuses.length) {
    throw Object.assign(new Error("No valid background statuses provided"), { statusCode: 400 });
  }

  let matchQuery = supabase
    .from("backgrounds")
    .select("id, name, metadata, status")
    .in("status", allowedStatuses)
    .limit(2);
  matchQuery = isUuid(target) ? matchQuery.eq("id", target) : matchQuery.eq("name", target);

  const { data: matches, error: matchErr } = await matchQuery;
  if (matchErr) throw matchErr;
  if (!matches?.length) {
    throw Object.assign(new Error(`Background not found: ${target}`), { statusCode: 404 });
  }
  if (matches.length > 1) {
    throw Object.assign(new Error(`Background id is ambiguous: ${target}. Refresh and try again.`), { statusCode: 409 });
  }

  return matches[0];
}

async function stagePendingBackground(supabase, { id, dbId }) {
  const row = await findBackgroundMatch(supabase, { id, dbId, statuses: ["pending"] });
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("backgrounds")
    .update({
      status: "staged",
      metadata: {
        ...metadata,
        imageApprovedAt: metadata.imageApprovedAt ?? now,
      },
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id, name, storage_path, scene, image_prompt, image_model, prompt_model, status, approved_at, created_at, metadata")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error(`Background not found: ${id || dbId}`), { statusCode: 404 });
  }
  return data;
}

async function discardBackgroundWithStatuses(supabase, { id, dbId, statuses }) {
  const row = await findBackgroundMatch(supabase, { id, dbId, statuses });
  const { data, error } = await supabase
    .from("backgrounds")
    .update({ status: "discarded" })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("name");
  if (error) throw error;
  if (!data?.length) {
    throw Object.assign(new Error(`Background not found: ${id || dbId}`), { statusCode: 404 });
  }
  return data;
}

function sceneForBackground(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const scene = row.scene || metadata.scene;
  if (!scene || typeof scene !== "object") {
    throw new Error("Background has no saved scene metadata for caption generation");
  }
  return { scene, metadata };
}

function buildBackgroundRevisionPrompt(row, instruction) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const scene = row.scene || metadata.scene || {};
  const sceneBits = ["subject", "setting", "mood", "style"]
    .map(key => scene?.[key])
    .filter(Boolean)
    .join("; ");

  return [
    "Edit the provided image with the smallest possible visual change.",
    `Requested edit: ${instruction}`,
    "Preserve the exact composition, camera angle, crop, subject count, clothing, pose, background, lighting, colors, grain, texture, widget-safe negative space, and overall 2000s digital-camera/photo-real aesthetic.",
    "Do not add typography, logos, watermarks, borders, stickers, extra people, or new objects unless the requested edit explicitly requires it.",
    "If the request is about a face or expression, change only that expression detail and keep identity, gear, framing, and scene intact.",
    sceneBits ? `Original scene context to preserve: ${sceneBits}` : "",
  ].filter(Boolean).join("\n");
}

function supportsImageInputFidelity(model) {
  const normalized = String(model || "").toLowerCase();
  if (!normalized || normalized.includes("mini")) return false;
  return normalized.startsWith("gpt-image-1") || normalized === "chatgpt-image-latest";
}

async function revisePendingBackground(supabase, { id, instruction, imageModel, size }) {
  const cleanInstruction = String(instruction || "").trim().slice(0, 700);
  if (!cleanInstruction) {
    throw Object.assign(new Error("instruction required"), { statusCode: 400 });
  }

  const row = await loadPendingBackground(supabase, id);
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const model = imageModel || process.env.OPENAI_IMAGE_EDIT_MODEL || DEFAULT_IMAGE_EDIT_MODEL;
  const quality = process.env.OPENAI_IMAGE_EDIT_QUALITY || "medium";
  const editSize = size || metadata.size || "1024x1024";

  const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(row.storage_path);
  if (downloadErr) throw downloadErr;

  const imageBytes = Buffer.from(await blob.arrayBuffer());
  const openai = new OpenAI({ apiKey: env("OPENAI_API_KEY") });
  const revisionPrompt = buildBackgroundRevisionPrompt(row, cleanInstruction);
  const imageFile = await toFile(imageBytes, `${row.name}.png`, { type: "image/png" });
  const editParams = {
    model,
    image: imageFile,
    prompt: revisionPrompt,
    size: editSize,
    quality,
    output_format: "png",
  };
  if (supportsImageInputFidelity(model)) {
    editParams.input_fidelity = "high";
  }
  const result = await openai.images.edit(editParams);

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image edit response did not include b64_json");

  const revisedBytes = Buffer.from(b64, "base64");
  const name = revisedBackgroundName(row.name);
  const storagePath = `${DRAFT_PREFIX}/backgrounds/${name}.png`;
  await uploadVerifiedObject(supabase, storagePath, revisedBytes);

  const now = new Date().toISOString();
  const {
    captionOptions,
    selectedCaptionIndex,
    captionPrompt,
    captionGeneratedAt,
    captionModel,
    captionLayout,
    mediumCaptionLayout,
    mediumStoragePath,
    mediumImageUrl,
    ...baseMetadata
  } = metadata;
  const nextMetadata = {
    ...baseMetadata,
    scene: row.scene ?? metadata.scene ?? null,
    scenePrompt: row.image_prompt ?? metadata.scenePrompt ?? null,
    imageModel: model,
    promptModel: row.prompt_model ?? metadata.promptModel ?? null,
    size: editSize,
    generatedAt: now,
    revision: {
      sourceName: row.name,
      sourceStoragePath: row.storage_path,
      sourceImageModel: row.image_model ?? metadata.imageModel ?? null,
      instruction: cleanInstruction,
      prompt: revisionPrompt,
      imageModel: model,
      quality,
      generatedAt: now,
    },
  };

  const { data: newRow, error: insertErr } = await supabase
    .from("backgrounds")
    .insert({
      name,
      storage_path: storagePath,
      scene: row.scene ?? metadata.scene ?? null,
      image_prompt: row.image_prompt ?? metadata.scenePrompt ?? null,
      image_model: model,
      prompt_model: row.prompt_model ?? metadata.promptModel ?? null,
      metadata: nextMetadata,
      status: "pending",
    })
    .select("id, name, storage_path, scene, image_prompt, image_model, prompt_model, created_at, metadata")
    .single();

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insertErr;
  }

  return {
    background: backgroundDraftFromRow(newRow, supabaseUrl()),
    imageModel: model,
    revisionPrompt,
  };
}

async function generateCaptionOptionsForBackground(supabase, { id, captionModel }) {
  const row = await loadBackgroundWithStatuses(supabase, id, ["staged"]);
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
    .eq("status", row.status);
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
  const row = await loadBackgroundWithStatuses(supabase, id, ["staged"]);
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
    .eq("status", row.status);
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
  let parsed;
  try { parsed = JSON.parse(out || "{}"); } catch {
    const detail = [err.trim(), out.trim()].filter(Boolean).join("\n");
    throw new Error(detail || "Instaloader resolver returned invalid JSON");
  }
  if (code !== 0) throw new Error(parsed.error || err.trim() || "Instaloader resolver failed");
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
          stagedBackgroundsResult,
          promptsResult,
          discardedDraftsResult,
          discardedBackgroundsResult,
        ] = await Promise.all([
          supabase.from("posts").select("*", { count: "exact", head: true }),
          supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "active"),
          listAllStoragePaths(supabase),
          supabase.from("drafts").select("id, caption").eq("status", "draft"),
          supabase.from("backgrounds").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("backgrounds").select("*", { count: "exact", head: true }).eq("status", "staged"),
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
          approvedBackgrounds: stagedBackgroundsResult.error ? 0 : (stagedBackgroundsResult.count ?? 0),
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

    // ── Instagram Carousels ───────────────────────────────────────────────

    if (req.method === "GET" && url.pathname === "/api/instagram/status") {
      try {
        json(res, 200, await getInstagramConnectionStatus());
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/carousels") {
      try {
        const includeArchived = ["1", "true", "yes"].includes(String(url.searchParams.get("includeArchived") || "").toLowerCase());
        json(res, 200, { carousels: await listCarousels(supabase, projectUrl, { includeArchived }) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/carousels") {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      try {
        json(res, 200, { carousel: await createCarousel(supabase, projectUrl, payload) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    const carouselPostNowMatch = url.pathname.match(/^\/api\/carousels\/([^/]+)\/post-now$/);
    if (req.method === "POST" && carouselPostNowMatch) {
      try {
        const status = await getInstagramConnectionStatus();
        if (!status.publishEnabled) {
          json(res, 400, { error: status.error || `Instagram publishing is not connected${status.missing?.length ? `: missing ${status.missing.join(", ")}` : ""}` });
          return;
        }
        const carouselId = carouselPostNowMatch[1];
        const jobId = runInProcessJob("instagram-publish", ({ log }) => publishCarouselNow(supabase, projectUrl, carouselId, log));
        json(res, 200, { jobId });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    const carouselDuplicateMatch = url.pathname.match(/^\/api\/carousels\/([^/]+)\/duplicate$/);
    if (req.method === "POST" && carouselDuplicateMatch) {
      try {
        json(res, 200, { carousel: await duplicateCarousel(supabase, projectUrl, carouselDuplicateMatch[1]) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    const carouselArchiveMatch = url.pathname.match(/^\/api\/carousels\/([^/]+)\/archive$/);
    if (req.method === "POST" && carouselArchiveMatch) {
      try {
        json(res, 200, { carousel: await archiveCarousel(supabase, projectUrl, carouselArchiveMatch[1]) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    const carouselExportMatch = url.pathname.match(/^\/api\/carousels\/([^/]+)\/export$/);
    if (req.method === "GET" && carouselExportMatch) {
      try {
        json(res, 200, { package: await exportCarouselPackage(supabase, projectUrl, carouselExportMatch[1]) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    const carouselMarkPostedMatch = url.pathname.match(/^\/api\/carousels\/([^/]+)\/mark-posted$/);
    if (req.method === "POST" && carouselMarkPostedMatch) {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      try {
        json(res, 200, { carousel: await markCarouselPosted(supabase, projectUrl, carouselMarkPostedMatch[1], payload) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    const carouselMatch = url.pathname.match(/^\/api\/carousels\/([^/]+)$/);
    if (req.method === "GET" && carouselMatch) {
      try {
        const carousel = await readCarousel(supabase, projectUrl, carouselMatch[1]);
        if (!carousel) { json(res, 404, { error: "Carousel not found" }); return; }
        json(res, 200, { carousel });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
      return;
    }

    if (req.method === "PATCH" && carouselMatch) {
      const payload = await readBody(req);
      if (!payload) { json(res, 400, { error: "Invalid JSON" }); return; }
      try {
        json(res, 200, { carousel: await updateCarousel(supabase, projectUrl, carouselMatch[1], payload) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
      }
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
        const status = normalizeBackgroundQueueStatus(url.searchParams.get("status") || "pending");
        if (!status) {
          json(res, 400, { error: "status must be pending or staged" });
          return;
        }
        json(res, 200, { backgrounds: await listBackgrounds(supabase, projectUrl, status) });
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backgrounds/stage") {
      const payload = await readBody(req);
      if (!payload?.id && !payload?.dbId) { json(res, 400, { error: "id required" }); return; }
      try {
        const row = await stagePendingBackground(supabase, { id: payload.id, dbId: payload.dbId });
        json(res, 200, {
          success: true,
          background: backgroundDraftFromRow(row, projectUrl),
        });
      } catch (e) {
        json(res, e.statusCode || (e.message?.startsWith("Background not found") ? 404 : 500), { error: e.message });
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

    if (req.method === "POST" && url.pathname === "/api/backgrounds/revise") {
      const payload = await readBody(req);
      if (!payload?.id) { json(res, 400, { error: "id required" }); return; }
      if (!String(payload.instruction || "").trim()) {
        json(res, 400, { error: "instruction required" });
        return;
      }
      try {
        const result = await revisePendingBackground(supabase, {
          id: payload.id,
          instruction: payload.instruction,
          imageModel: payload.imageModel,
          size: payload.size,
        });
        json(res, 200, { success: true, ...result });
      } catch (e) {
        json(res, e.statusCode || (e.message?.startsWith("Background not found") ? 404 : 500), { error: e.message });
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
        let data;
        if (payload.all) {
          const status = normalizeBackgroundQueueStatus(payload.status || "pending");
          if (!status) {
            json(res, 400, { error: "status must be pending or staged" });
            return;
          }
          const result = await supabase
            .from("backgrounds")
            .update({ status: "discarded" })
            .eq("status", status)
            .select("name");
          if (result.error) throw result.error;
          data = result.data;
        } else if (payload.id || payload.dbId) {
          const status = normalizeBackgroundQueueStatus(payload.status || "pending");
          if (!status) {
            json(res, 400, { error: "status must be pending or staged" });
            return;
          }
          data = await discardBackgroundWithStatuses(supabase, {
            id: payload.id,
            dbId: payload.dbId,
            statuses: [status],
          });
        } else {
          json(res, 400, { error: "Provide all or id" }); return;
        }

        if (!data?.length) {
          json(res, 404, { error: payload.id ? `Background not found: ${payload.id}` : "No backgrounds matched" });
          return;
        }
        json(res, 200, { success: true, updated: data.length, ids: data.map(row => row.name) });
      } catch (e) {
        json(res, e.statusCode || 500, { error: e.message });
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
      if (payload.styleRecipe) args.push("--style-recipe", String(payload.styleRecipe));
      if (payload.subject && String(payload.subject).trim()) args.push("--subject", String(payload.subject));
      if (payload.location && String(payload.location).trim()) args.push("--location", String(payload.location));
      if (payload.gender && String(payload.gender).trim()) args.push("--gender", String(payload.gender));
      if (payload.gear && String(payload.gear).trim()) args.push("--gear", String(payload.gear));
      if (payload.action && String(payload.action).trim()) args.push("--action", String(payload.action));
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
      if (typeof payload.id === "string" && payload.id.trim()) {
        try {
          const result = await deletePostImage(supabase, {
            id: payload.id.trim(),
            storagePath: typeof payload.storagePath === "string" ? payload.storagePath : undefined,
          });
          json(res, 200, { ...result, message: `Removed ${result.removedStorage} file; deleted ${result.removedRows} post row.` });
        } catch (e) {
          json(res, e.statusCode || 500, { error: e.message });
        }
        return;
      }
      const paths = Array.isArray(payload.paths) ? payload.paths.filter(p => typeof p === "string") : [];
      if (!paths.length) { json(res, 400, { error: "paths[] required" }); return; }
      if (paths.length > 1 && payload.allowBatch !== true) {
        json(res, 400, { error: "Batch image delete is disabled in the dashboard. Delete one image at a time." });
        return;
      }
      let removedStorage = 0, removedRows = 0;
      const errors = [];
      for (const storagePath of paths) {
        try {
          const result = await deletePostImage(supabase, { storagePath });
          removedStorage += result.removedStorage;
          removedRows += result.removedRows;
        } catch (e) {
          errors.push({ path: storagePath, step: "delete", message: e.message });
        }
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
