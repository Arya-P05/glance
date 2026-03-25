/**
 * Local admin UI:
 * - Browse Storage + delete file + DB row
 * - Paste Instagram post URLs → preview → upload to Storage + upsert posts
 *
 * Security: uses SUPABASE_SERVICE_ROLE_KEY — localhost only.
 * Optional ADMIN_TOKEN → X-Admin-Token on /api/*.
 *
 *   cd backend && npm run admin
 *   open http://127.0.0.1:3847/
 *
 * Import tab needs Instaloader (`pip3 install instaloader`).
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUCKET as IG_BUCKET,
  downloadImage,
  parsePostTargetsFromInput,
  resizeForPreview,
  resizeForWidget,
} from "./instagram-helper.js";

const BUCKET = IG_BUCKET;
const PREFIX = "posts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function publicObjectUrl(supabaseUrl, storagePath) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${BUCKET}/${encoded}`;
}

function checkToken(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true;
  const got = req.headers["x-admin-token"];
  return got === expected;
}

async function listAllStoragePaths(supabase) {
  const paths = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data: files, error } = await supabase.storage.from(BUCKET).list(PREFIX, {
      limit: pageSize,
      offset,
    });
    if (error) throw error;
    if (!files?.length) break;
    for (const f of files) {
      paths.push(`${PREFIX}/${f.name}`);
    }
    offset += files.length;
    if (files.length < pageSize) break;
  }
  return paths;
}

async function resolveTargetsWithInstaloader(targets) {
  const scriptPath = join(__dirname, "instaloader_resolve.py");
  const py = spawn("python3", [scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const input = JSON.stringify({ targets });
  py.stdin.write(input);
  py.stdin.end();

  let out = "";
  let err = "";
  py.stdout.on("data", (d) => {
    out += d.toString();
  });
  py.stderr.on("data", (d) => {
    err += d.toString();
  });

  const code = await new Promise((resolve) => py.on("close", resolve));
  if (code !== 0) {
    throw new Error(err.trim() || "Instaloader resolver failed");
  }

  let parsed;
  try {
    parsed = JSON.parse(out || "{}");
  } catch {
    throw new Error("Instaloader resolver returned invalid JSON");
  }
  if (parsed.error) throw new Error(parsed.error);
  if (!Array.isArray(parsed.items)) throw new Error("Instaloader resolver returned invalid items");
  return parsed.items;
}

async function main() {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const htmlPath = join(__dirname, "admin", "index.html");
  const indexHtml = readFileSync(htmlPath, "utf8");

  const port = Number(process.env.ADMIN_PORT || "3847");
  const host = process.env.ADMIN_HOST || "127.0.0.1";

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(indexHtml);
      return;
    }

    if (!checkToken(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/images") {
      try {
        const paths = await listAllStoragePaths(supabase);
        const items = paths.map((storagePath) => ({
          storagePath,
          publicUrl: publicObjectUrl(supabaseUrl, storagePath),
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ items }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/preview") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
      const input = typeof payload.input === "string" ? payload.input : "";
      const targets = parsePostTargetsFromInput(input).slice(0, 20);
      if (!targets.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Paste at least one Instagram /p/ or /reel/ link." }));
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
              items.push({ shortcode, kind, media_index: Number(it.media_index || 1), media_count: Number(it.media_count || 1), caption: null, error: "No image URL from resolver" });
              continue;
            }
            const raw = await downloadImage(imageUrl);
            const small = await resizeForPreview(raw);
            const b64 = small.toString("base64");
            items.push({
              shortcode,
              kind,
              media_index: Number(it.media_index || 1),
              media_count: Number(it.media_count || 1),
              caption: it.caption || null,
              image_url: imageUrl,
              previewDataUrl: `data:image/jpeg;base64,${b64}`,
            });
          } catch (e) {
            items.push({ shortcode, kind, media_index: Number(it.media_index || 1), media_count: Number(it.media_count || 1), caption: null, error: e.message || "Preview failed" });
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ items }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/import-posts") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
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
        // Back-compat: if caller still sends targets/shortcodes, resolve now.
        let targets = [];
        if (Array.isArray(payload.targets) && payload.targets.length) {
          for (const t of payload.targets) {
            if (!t || typeof t.shortcode !== "string" || !/^[A-Za-z0-9_-]+$/.test(t.shortcode)) continue;
            const kind = t.kind === "reel" ? "reel" : "p";
            targets.push({ shortcode: t.shortcode, kind });
          }
          targets = targets.slice(0, 50);
        } else {
          const rawCodes = Array.isArray(payload.shortcodes) ? payload.shortcodes : [];
          const shortcodes = [...new Set(rawCodes.filter((s) => typeof s === "string" && /^[A-Za-z0-9_-]+$/.test(s)))].slice(
            0,
            50
          );
          targets = shortcodes.map((shortcode) => ({ shortcode, kind: "p" }));
        }
        if (!targets.length) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "items[] (or targets[]/shortcodes[]) required" }));
          return;
        }
        items = await resolveTargetsWithInstaloader(targets);
      }

      if (!items.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No valid import items" }));
        return;
      }

      const results = [];
      try {
        for (const it of items) {
          const shortcode = it.shortcode;
          const mediaIndex = Number(it.media_index || 1);
          const mediaCount = Number(it.media_count || 1);
          try {
            if (it.error) {
              results.push({ shortcode, media_index: mediaIndex, ok: false, error: it.error });
              continue;
            }
            const imageUrl = typeof it.image_url === "string" ? it.image_url : null;
            if (!imageUrl) {
              results.push({ shortcode, media_index: mediaIndex, ok: false, error: "No image URL from resolver" });
              continue;
            }

            const imageBytes = await downloadImage(imageUrl);
            const toUpload = await resizeForWidget(imageBytes);
            const storagePath = mediaCount > 1 ? `${PREFIX}/${shortcode}-${mediaIndex}.jpg` : `${PREFIX}/${shortcode}.jpg`;
            const instagramId = mediaCount > 1 ? `${shortcode}_${mediaIndex}` : shortcode;

            const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, toUpload, {
              contentType: "image/jpeg",
              upsert: true,
            });
            if (uploadErr) throw uploadErr;

            const { error: insertErr } = await supabase.from("posts").upsert(
              {
                instagram_id: instagramId,
                storage_path: storagePath,
                caption: it.caption || null,
                posted_at: null,
              },
              { onConflict: "instagram_id" }
            );
            if (insertErr) throw insertErr;
            results.push({ shortcode, media_index: mediaIndex, ok: true, storagePath });
          } catch (e) {
            results.push({ shortcode, media_index: mediaIndex, ok: false, error: e.message || "Import failed" });
          }
        }
        const okn = results.filter((r) => r.ok).length;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            results,
            message: `Imported ${okn} of ${items.length}.`,
          })
        );
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/delete") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
      const paths = Array.isArray(payload.paths) ? payload.paths.filter((p) => typeof p === "string") : [];
      if (!paths.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "paths[] required" }));
        return;
      }

      const errors = [];
      let removedStorage = 0;
      let removedRows = 0;

      for (const storagePath of paths) {
        if (!storagePath.startsWith(`${PREFIX}/`)) {
          errors.push({ path: storagePath, step: "validate", message: "Invalid path" });
          continue;
        }
        const { error: rmErr } = await supabase.storage.from(BUCKET).remove([storagePath]);
        if (rmErr) {
          errors.push({ path: storagePath, step: "storage", message: rmErr.message });
          continue;
        }
        removedStorage++;

        const { data: deleted, error: dbErr } = await supabase
          .from("posts")
          .delete()
          .eq("storage_path", storagePath)
          .select("id");

        if (dbErr) {
          errors.push({ path: storagePath, step: "database", message: dbErr.message });
        } else {
          removedRows += deleted?.length ?? 0;
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          removedStorage,
          removedRows,
          errors: errors.length ? errors : undefined,
          message: `Removed ${removedStorage} file(s); deleted ${removedRows} post row(s).`,
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, host, () => {
    console.log(`Admin UI: http://${host}:${port}/`);
    if (process.env.ADMIN_TOKEN) console.log("ADMIN_TOKEN is set — browser must send X-Admin-Token (the UI stores it after prompt).");
    else console.log("No ADMIN_TOKEN — only use on trusted localhost.");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
