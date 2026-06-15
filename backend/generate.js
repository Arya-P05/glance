/**
 * Content generator — prompts or raw background images.
 *
 * Modes:
 *   --mode prompts   Write image prompts only → content/prompts/
 *   --mode images    Generate raw background images → content/backgrounds/  [default]
 *
 * Examples:
 *   npm run gen -- --count 10 --mode prompts
 *   npm run gen -- --count 10 --mode images
 *   npm run gen -- --count 10
 *   npm run gen -- --count 10 --from-prompts
 */
import "dotenv/config";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_PROMPT_MODEL,
  buildHighConceptScene,
  buildIconicEnergyScene,
  buildMotivationalPrompt,
  buildPlayfulAnimalScene,
  buildPromptWriterPrompt,
  buildReferenceAestheticScene,
  buildScene,
  buildSceneFromArchetype,
  buildSceneFromDirector,
  cleanGeneratedPrompt,
  makeBackgroundName,
  saveGeneratedAsset,
  savePromptAsset,
  sceneDedupKeys,
} from "./motivational-generator.js";
import {
  buildSceneDirectorPrompt,
  parseDirectorScene,
} from "./poster-concepts.js";
import { BUCKET, DRAFT_PREFIX } from "./instagram-helper.js";
import { supabaseUrl, supabaseServiceRoleKey } from "./supabase-env.js";

const PROMPTS_DIR = "content/prompts";
const BACKGROUNDS_DIR = "content/backgrounds";
const META_DIR = "content/meta";

function parseArgs(argv) {
  const out = {
    count: Number(process.env.POSTER_COUNT || "10"),
    mode: "images",
    fromPrompts: false,
    fromPromptsDir: PROMPTS_DIR,
    promptIds: null, // comma-separated list of prompt IDs to use
    outDir: null,
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    promptModel: process.env.OPENAI_PROMPT_MODEL || DEFAULT_PROMPT_MODEL,
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--count" || arg === "-n") out.count = Number(next());
    else if (arg === "--mode") out.mode = next();
    else if (arg === "--from-prompts") {
      out.fromPrompts = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) out.fromPromptsDir = next();
    } else if (arg === "--prompt-ids") {
      out.fromPrompts = true;
      out.promptIds = next().split(",").map(s => s.trim()).filter(Boolean);
    } else if (arg === "--out") out.outDir = next();
    else if (arg === "--model") out.model = next();
    else if (arg === "--prompt-model") out.promptModel = next();
    else if (arg === "--size") out.size = next();
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["prompts", "images"].includes(out.mode)) {
    throw new Error(`--mode must be one of: prompts, images`);
  }
  if (!Number.isInteger(out.count) || out.count < 1 || out.count > 200) {
    throw new Error("--count must be an integer from 1 to 200");
  }
  if (out.fromPrompts && out.mode === "prompts") {
    throw new Error("--from-prompts cannot be used with --mode prompts");
  }

  if (!out.outDir) {
    out.outDir = out.mode === "prompts" ? PROMPTS_DIR : BACKGROUNDS_DIR;
  }
  out.metaDir = out.mode === "prompts" ? out.outDir : META_DIR;

  return out;
}

function usage() {
  return `Usage:
  npm run gen -- --count 10                         backgrounds   → content/backgrounds/
  npm run gen -- --count 10 --mode prompts          prompts only  → content/prompts/
  npm run gen -- --count 10 --mode images           backgrounds   → content/backgrounds/
  npm run gen -- --count 10 --from-prompts          images from existing prompts
  npm run publish                                   push drafts   → Supabase

Options:
  --count, -n <n>      Number to generate. Default: 10
  --mode <mode>        prompts | images. Default: images
  --from-prompts [dir] Load scene+prompt from content/prompts/ instead of generating
  --out <dir>          Override output directory
  --model <model>      Image model. Default: ${DEFAULT_IMAGE_MODEL}
  --prompt-model       Prompt writer model. Default: ${DEFAULT_PROMPT_MODEL}
  --size <size>        Image size. Default: 1024x1024
  --dry-run            Print scenes/prompts only; no API calls
`;
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function sceneSummary(scene) {
  const prop = scene.prop === "nothing" ? "no prop" : scene.prop;
  return `${scene.subject} / ${scene.setting} / ${scene.weather} / ${prop}`;
}

function isAllowedScene(scene, avoidSignatures, { allowFamilyRepeat = false } = {}) {
  return [...sceneDedupKeys(scene)].every((key) =>
    allowFamilyRepeat && key.startsWith("family:")
      ? true
      : !avoidSignatures.has(key)
  );
}

async function withProgress(label, task) {
  const frames = ["-", "\\", "|", "/"];
  const startedAt = Date.now();
  const isInteractive = process.stdout.isTTY;
  let frame = 0;
  let timer = null;

  if (isInteractive) {
    timer = setInterval(() => {
      const elapsed = formatElapsed(Date.now() - startedAt);
      process.stdout.write(`\r${frames[frame]} ${label} (${elapsed})`);
      frame = (frame + 1) % frames.length;
    }, 120);
  } else {
    console.log(`${label}...`);
  }

  try {
    const result = await task();
    const elapsed = formatElapsed(Date.now() - startedAt);
    if (timer) clearInterval(timer);
    if (isInteractive) process.stdout.write(`\r\x1b[Kok ${label} (${elapsed})\n`);
    else console.log(`ok ${label} (${elapsed})`);
    return result;
  } catch (e) {
    const elapsed = formatElapsed(Date.now() - startedAt);
    if (timer) clearInterval(timer);
    if (isInteractive) process.stdout.write(`\r\x1b[Kfailed ${label} (${elapsed})\n`);
    else console.log(`failed ${label} (${elapsed})`);
    throw e;
  }
}

async function generateImage({ client, model, prompt, size }) {
  const result = await client.images.generate({ model, prompt, size });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image response did not include b64_json");
  return Buffer.from(b64, "base64");
}

async function generateDetailedPrompt({ client, model, scene }) {
  const promptWriterPrompt = buildPromptWriterPrompt(scene);
  const response = await client.responses.create({
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: promptWriterPrompt }] }],
  });
  return {
    prompt: cleanGeneratedPrompt(responseText(response)),
    promptWriterPrompt,
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

async function loadRecentScenesFromDb(supabase, limit = 40) {
  if (!supabase) return new Set();
  const keys = new Set();

  const { data: drafts } = await supabase
    .from("drafts")
    .select("scene")
    .not("scene", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const row of drafts ?? []) {
    if (row.scene && typeof row.scene === "object") {
      for (const key of sceneDedupKeys(row.scene)) keys.add(key);
    }
  }

  const { data: backgrounds } = await supabase
    .from("backgrounds")
    .select("scene")
    .not("scene", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const row of backgrounds ?? []) {
    if (row.scene && typeof row.scene === "object") {
      for (const key of sceneDedupKeys(row.scene)) keys.add(key);
    }
  }

  const { data: prompts } = await supabase
    .from("prompts")
    .select("scene")
    .not("scene", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const row of prompts ?? []) {
    if (row.scene && typeof row.scene === "object") {
      for (const key of sceneDedupKeys(row.scene)) keys.add(key);
    }
  }

  return keys;
}

async function generateSceneFromDirector({ client, model, avoidSignatures }) {
  const prompt = buildSceneDirectorPrompt({ avoidSignatures });
  const response = await client.responses.create({
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
  });
  const raw = parseDirectorScene(responseText(response));
  return buildSceneFromDirector(raw);
}

async function pickUniqueScene({ client, promptModel, avoidSignatures, preferEnergy = false }) {
  for (let attempt = 0; attempt < 28; attempt++) {
    const roll = Math.random();
    let scene;

    if (preferEnergy && attempt < 6) {
      scene = buildPlayfulAnimalScene();
    } else if (preferEnergy && attempt < 12) {
      scene = buildReferenceAestheticScene();
    } else if (preferEnergy && attempt < 20) {
      scene = buildHighConceptScene();
    } else if (roll < 0.14) {
      scene = buildPlayfulAnimalScene();
    } else if (roll < 0.32) {
      scene = buildReferenceAestheticScene();
    } else if (roll < 0.52) {
      scene = buildHighConceptScene();
    } else if (roll < 0.76) {
      scene = buildIconicEnergyScene();
    } else if (roll < 0.9) {
      scene = buildSceneFromArchetype();
    } else if (roll < 0.96) {
      scene = buildScene(Math.random, { avoidSignatures });
    } else if (client) {
      try {
        scene = await generateSceneFromDirector({ client, model: promptModel, avoidSignatures });
      } catch {
        scene = buildSceneFromArchetype();
      }
    } else {
      scene = buildSceneFromArchetype();
    }

    if (isAllowedScene(scene, avoidSignatures)) return scene;
  }

  for (let attempt = 0; attempt < 80; attempt++) {
    const scene =
      preferEnergy && attempt < 40
        ? (attempt % 3 === 0 ? buildPlayfulAnimalScene() : attempt % 3 === 1 ? buildReferenceAestheticScene() : buildHighConceptScene())
        : attempt % 2 === 0
          ? buildIconicEnergyScene()
          : buildReferenceAestheticScene();
    if (isAllowedScene(scene, avoidSignatures, { allowFamilyRepeat: true })) return scene;
  }

  return preferEnergy ? buildReferenceAestheticScene() : buildSceneFromArchetype();
}

function rememberScene(scene, avoidSignatures) {
  for (const key of sceneDedupKeys(scene)) avoidSignatures.add(key);
}

async function loadFromPromptsDir(dir, count, filterIds = null) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    throw new Error(`Prompts directory not found: ${dir}\nRun: npm run gen -- --mode prompts`);
  }

  let jsonFiles = files.filter((f) => f.endsWith(".json")).sort();
  if (filterIds) {
    jsonFiles = jsonFiles.filter(f => filterIds.includes(f.replace(/\.json$/, "")));
  } else {
    jsonFiles = jsonFiles.slice(0, count);
  }
  if (jsonFiles.length === 0) {
    throw new Error(`No prompt JSON files found in ${dir}\nRun: npm run gen -- --mode prompts`);
  }

  const prompts = [];
  for (const file of jsonFiles) {
    const data = JSON.parse(await readFile(join(dir, file), "utf8"));
    if (data.scene && data.prompt) {
      prompts.push({
        name: file.replace(/\.json$/, ""),
        scene: data.scene,
        prompt: data.prompt,
        promptWriterPrompt: data.promptWriterPrompt || "",
      });
    }
  }

  if (prompts.length === 0) {
    throw new Error(`No valid prompt files found in ${dir} (need scene + prompt fields)`);
  }

  return prompts;
}

async function loadFromPromptsDb(supabase, count, filterIds = null) {
  if (!supabase) return [];

  let query = supabase
    .from("prompts")
    .select("name, scene, image_prompt, metadata")
    .order("created_at", { ascending: true });

  if (filterIds?.length) query = query.in("name", filterIds);
  else query = query.limit(count);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const orderedRows = filterIds?.length
    ? filterIds.map(id => rows.find(row => row.name === id)).filter(Boolean)
    : rows;

  return orderedRows
    .filter(row => row.scene && row.image_prompt)
    .map(row => ({
      name: row.name,
      scene: row.scene,
      prompt: row.image_prompt,
      promptWriterPrompt: row.metadata?.promptWriterPrompt || "",
    }));
}

async function loadPromptSources({ dir, count, filterIds, supabase }) {
  if (filterIds?.length && supabase) {
    const dbPrompts = await loadFromPromptsDb(supabase, count, filterIds);
    const found = new Set(dbPrompts.map(p => p.name));
    const missing = filterIds.filter(id => !found.has(id));
    if (missing.length === 0) return { prompts: dbPrompts, source: "Supabase prompts table" };
    throw new Error(`Prompt not found or already used: ${missing.join(", ")}`);
  }

  try {
    return {
      prompts: await loadFromPromptsDir(dir, count, filterIds),
      source: dir,
    };
  } catch (localError) {
    if (!supabase) throw localError;
    const dbPrompts = await loadFromPromptsDb(supabase, count, filterIds);
    if (dbPrompts.length) return { prompts: dbPrompts, source: "Supabase prompts table" };
    throw localError;
  }
}

async function upsertWithSchemaFallback(supabase, table, row, { onConflict, optionalColumns }) {
  let nextRow = row;
  let remainingOptional = new Set(optionalColumns);

  for (;;) {
    const { error } = await supabase.from(table).upsert(nextRow, { onConflict });
    if (!error) return;

    const message = error.message || "";
    const missingColumn = [...remainingOptional].find((column) =>
      message.includes(`'${column}'`) || message.includes(`column ${column}`)
    );
    if (!missingColumn) throw error;

    remainingOptional.delete(missingColumn);
    const { [missingColumn]: _missing, ...stripped } = nextRow;
    nextRow = stripped;
  }
}

async function uploadBackgroundToDb(supabase, { name, imageBytes, metadata }) {
  const storagePath = `${DRAFT_PREFIX}/backgrounds/${name}.png`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, imageBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) throw uploadErr;

  await upsertWithSchemaFallback(supabase, "backgrounds",
    {
      name,
      storage_path: storagePath,
      scene: metadata.scene ?? null,
      image_prompt: metadata.scenePrompt ?? null,
      metadata,
      image_model: metadata.imageModel ?? null,
      prompt_model: metadata.promptModel ?? null,
      status: "pending",
    },
    { onConflict: "name", optionalColumns: ["metadata", "image_model", "prompt_model"] }
  );
}

async function uploadPromptToDb(supabase, { name, prompt, metadata }) {
  await upsertWithSchemaFallback(supabase, "prompts",
    {
      name,
      scene: metadata.scene ?? null,
      image_prompt: prompt,
      prompt_model: metadata.promptModel ?? null,
      metadata,
    },
    { onConflict: "name", optionalColumns: ["metadata"] }
  );
}

async function removePromptFromDb(supabase, name) {
  if (!supabase || !name) return;
  const { error } = await supabase.from("prompts").delete().eq("name", name);
  if (error) throw error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const openai = args.dryRun ? null : new OpenAI({ apiKey: env("OPENAI_API_KEY") });
  let supabase = null;
  try {
    supabase = createClient(supabaseUrl(), supabaseServiceRoleKey());
  } catch {
    console.warn("Supabase not configured — drafts/prompts won't be saved to DB");
  }
  const startedAt = Date.now();
  let saved = 0;
  let failed = 0;

  if (!args.dryRun) {
    const modeLabel = { prompts: "prompts only", images: "background images" }[args.mode];
    console.log(`Generating ${args.count} × ${modeLabel} → ${args.outDir}/`);
    if (args.fromPrompts) console.log(`Using prompts from: ${args.fromPromptsDir}/`);
    console.log(`Models: prompt=${args.promptModel}  image=${args.model}`);
    console.log("");
  }

  let promptSources = null;
  if (args.fromPrompts) {
    const loaded = await loadPromptSources({
      dir: args.fromPromptsDir,
      count: args.count,
      filterIds: args.promptIds,
      supabase,
    });
    promptSources = loaded.prompts;
    console.log(`Loaded ${promptSources.length} prompts from ${loaded.source}`);
    if (args.promptIds?.length) console.log(`Prompt IDs: ${args.promptIds.join(", ")}`);
    console.log("");
  }

  const avoidSceneSignatures = supabase ? await loadRecentScenesFromDb(supabase) : new Set();

  let completed = 0;
  let attempted = 0;
  const maxAttempts = args.dryRun
    ? args.count
    : args.count + Math.max(3, Math.ceil(args.count * 0.5));

  while (completed < args.count && attempted < maxAttempts) {
    attempted++;
    const itemNumber = completed + 1;
    const prefix = `[${itemNumber}/${args.count}]`;

    let scene, scenePrompt, promptWriterPrompt, name;

    if (promptSources) {
      const source = promptSources[completed];
      if (!source) break;
      ({ scene, prompt: scenePrompt, promptWriterPrompt, name } = source);
    } else {
      name = makeBackgroundName(attempted);
      scene = await pickUniqueScene({
        client: openai,
        promptModel: args.promptModel,
        avoidSignatures: avoidSceneSignatures,
        preferEnergy: itemNumber % 3 === 1,
      });
      rememberScene(scene, avoidSceneSignatures);
    }

    const fallbackPrompt = buildMotivationalPrompt(scene);

    if (args.dryRun) {
      console.log(`\n--- ${name ?? `item_${itemNumber}`} scene ---\n${JSON.stringify(scene, null, 2)}`);
      if (!promptSources) {
        console.log(`\n--- prompt-writer request ---\n${buildPromptWriterPrompt(scene)}`);
      }
      completed++;
      continue;
    }

    try {
      console.log(`${prefix} ${sceneSummary(scene)}`);

      if (!promptSources && !scenePrompt) {
        const result = await withProgress(`${prefix} writing image prompt`, () =>
          generateDetailedPrompt({ client: openai, model: args.promptModel, scene })
        );
        scenePrompt = result.prompt || fallbackPrompt;
        promptWriterPrompt = result.promptWriterPrompt;
      }

      if (args.mode === "prompts") {
        const promptMetadata = {
          promptModel: args.promptModel,
          generatedAt: new Date().toISOString(),
          scene,
          promptWriterPrompt,
        };
        const paths = await withProgress(`${prefix} saving prompt`, () =>
          savePromptAsset({
            outputDir: args.outDir,
            name,
            prompt: scenePrompt,
            metadata: promptMetadata,
          })
        );
        if (supabase) {
          await withProgress(`${prefix} saving prompt to DB`, () =>
            uploadPromptToDb(supabase, { name, prompt: scenePrompt, metadata: promptMetadata })
          );
        }
        saved++;
        completed++;
        console.log(`${prefix} → ${paths.promptPath}\n`);
        continue;
      }

      const rawImageBytes = await withProgress(`${prefix} generating image`, () =>
        generateImage({ client: openai, model: args.model, prompt: scenePrompt, size: args.size })
      );

      const draftMetadata = {
        imageModel: args.model,
        promptModel: args.promptModel,
        size: args.size,
        generatedAt: new Date().toISOString(),
        scene,
        scenePrompt,
        promptWriterPrompt,
      };
      const paths = await withProgress(`${prefix} saving background`, () =>
        saveGeneratedAsset({
          outputDir: args.outDir,
          metaDir: args.metaDir,
          name,
          imageBytes: rawImageBytes,
          rawImageBytes: null,
          prompt: scenePrompt,
          metadata: draftMetadata,
        })
      );
      if (supabase) {
        await withProgress(`${prefix} saving background to DB`, () =>
          uploadBackgroundToDb(supabase, {
            name,
            imageBytes: rawImageBytes,
            metadata: draftMetadata,
          })
        );
        if (promptSources) {
          await withProgress(`${prefix} removing used prompt`, () =>
            removePromptFromDb(supabase, name)
          );
        }
      }

      saved++;
      completed++;
      console.log(`${prefix} → ${paths.imagePath}`);
      console.log("");
    } catch (e) {
      failed++;
      console.error(`${prefix} failed: ${e.message || e}\n`);
    }
  }

  if (!args.dryRun) {
    console.log(`Done: ${saved} saved, ${failed} failed in ${formatElapsed(Date.now() - startedAt)}.`);
    if (saved < args.count) {
      console.log(`Stopped after ${attempted} attempt${attempted === 1 ? "" : "s"} before reaching ${args.count} saved item${args.count === 1 ? "" : "s"}.`);
    }
    if (saved > 0 && args.mode !== "prompts") {
      console.log(`\nReview generated backgrounds in the dashboard Backgrounds tab.`);
    }
    if (saved > 0 && args.mode === "prompts") {
      console.log(`\nGenerate images from these prompts? Run: npm run gen -- --from-prompts`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
