/**
 * Content generator — prompts, raw images, or finished posters.
 *
 * Modes:
 *   --mode prompts   Write image prompts only → content/prompts/
 *   --mode images    Generate raw background images (no caption) → content/drafts/
 *   --mode full      Full pipeline: image + caption overlay → content/drafts/  [default]
 *
 * Examples:
 *   npm run gen -- --count 10 --mode prompts
 *   npm run gen -- --count 10 --mode images
 *   npm run gen -- --count 10
 *   npm run gen -- --count 10 --from-prompts
 */
import "dotenv/config";
import OpenAI from "openai";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_CAPTION_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_PROMPT_MODEL,
  buildCaptionPrompt,
  buildLegacyPromptForMetadata,
  buildMotivationalPrompt,
  buildPromptWriterPrompt,
  buildScene,
  cleanGeneratedPrompt,
  coerceReferenceCaption,
  makeAssetName,
  overlayCaption,
  parseCaption,
  saveGeneratedAsset,
  savePromptAsset,
} from "./motivational-generator.js";

const PROMPTS_DIR = "content/prompts";
const DRAFTS_DIR = "content/drafts";
const BACKGROUNDS_DIR = "content/backgrounds";
const META_DIR = "content/meta";

function parseArgs(argv) {
  const out = {
    count: Number(process.env.POSTER_COUNT || "10"),
    mode: "full",
    fromPrompts: false,
    fromPromptsDir: PROMPTS_DIR,
    outDir: null,
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    promptModel: process.env.OPENAI_PROMPT_MODEL || DEFAULT_PROMPT_MODEL,
    captionModel: process.env.OPENAI_CAPTION_MODEL || DEFAULT_CAPTION_MODEL,
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
    } else if (arg === "--out") out.outDir = next();
    else if (arg === "--model") out.model = next();
    else if (arg === "--prompt-model") out.promptModel = next();
    else if (arg === "--caption-model") out.captionModel = next();
    else if (arg === "--size") out.size = next();
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["prompts", "images", "full"].includes(out.mode)) {
    throw new Error(`--mode must be one of: prompts, images, full`);
  }
  if (!Number.isInteger(out.count) || out.count < 1 || out.count > 200) {
    throw new Error("--count must be an integer from 1 to 200");
  }
  if (out.fromPrompts && out.mode === "prompts") {
    throw new Error("--from-prompts cannot be used with --mode prompts");
  }

  if (!out.outDir) {
    out.outDir = out.mode === "prompts" ? PROMPTS_DIR : DRAFTS_DIR;
  }
  out.backgroundDir = BACKGROUNDS_DIR;
  out.metaDir = out.mode === "prompts" ? out.outDir : META_DIR;

  return out;
}

function usage() {
  return `Usage:
  npm run gen -- --count 10                         full pipeline → content/drafts/
  npm run gen -- --count 10 --mode prompts          prompts only  → content/prompts/
  npm run gen -- --count 10 --mode images           raw images    → content/drafts/
  npm run gen -- --count 10 --from-prompts          images from existing prompts
  npm run publish                                   push drafts   → Supabase

Options:
  --count, -n <n>      Number to generate. Default: 10
  --mode <mode>        prompts | images | full. Default: full
  --from-prompts [dir] Load scene+prompt from content/prompts/ instead of generating
  --out <dir>          Override output directory
  --model <model>      Image model. Default: ${DEFAULT_IMAGE_MODEL}
  --prompt-model       Prompt writer model. Default: ${DEFAULT_PROMPT_MODEL}
  --caption-model      Caption model. Default: ${DEFAULT_CAPTION_MODEL}
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

async function generateCaption({ client, model, scene, imageBytes }) {
  const prompt = buildCaptionPrompt(scene);
  const imageUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl },
        ],
      },
    ],
  });
  return {
    caption: coerceReferenceCaption(parseCaption(responseText(response)), scene),
    prompt,
  };
}

async function loadFromPromptsDir(dir, count) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    throw new Error(`Prompts directory not found: ${dir}\nRun: npm run gen -- --mode prompts`);
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().slice(0, count);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const openai = args.dryRun ? null : new OpenAI({ apiKey: env("OPENAI_API_KEY") });
  const startedAt = Date.now();
  let saved = 0;
  let failed = 0;

  if (!args.dryRun) {
    const modeLabel = { prompts: "prompts only", images: "raw images", full: "full posters" }[args.mode];
    console.log(`Generating ${args.count} × ${modeLabel} → ${args.outDir}/`);
    if (args.fromPrompts) console.log(`Using prompts from: ${args.fromPromptsDir}/`);
    console.log(`Models: prompt=${args.promptModel}  image=${args.model}  caption=${args.captionModel}`);
    console.log("");
  }

  let promptSources = null;
  if (args.fromPrompts) {
    promptSources = await loadFromPromptsDir(args.fromPromptsDir, args.count);
    console.log(`Loaded ${promptSources.length} prompts from ${args.fromPromptsDir}/\n`);
  }

  const usedSubjects = new Set();

  for (let i = 1; i <= args.count; i++) {
    const prefix = `[${i}/${args.count}]`;

    let scene, scenePrompt, promptWriterPrompt, name;

    if (promptSources) {
      const source = promptSources[i - 1];
      if (!source) break;
      ({ scene, prompt: scenePrompt, promptWriterPrompt, name } = source);
    } else {
      name = makeAssetName(i);
      scene = buildScene();
      for (let tries = 0; usedSubjects.has(scene.subject) && tries < 20; tries++) {
        scene = buildScene();
      }
      usedSubjects.add(scene.subject);
    }

    const fallbackPrompt = buildMotivationalPrompt(scene);

    if (args.dryRun) {
      console.log(`\n--- ${name ?? `item_${i}`} scene ---\n${JSON.stringify(scene, null, 2)}`);
      if (!promptSources) {
        console.log(`\n--- prompt-writer request ---\n${buildPromptWriterPrompt(scene)}`);
      }
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
        const paths = await withProgress(`${prefix} saving prompt`, () =>
          savePromptAsset({
            outputDir: args.outDir,
            name,
            prompt: scenePrompt,
            metadata: {
              promptModel: args.promptModel,
              generatedAt: new Date().toISOString(),
              scene,
              promptWriterPrompt,
            },
          })
        );
        saved++;
        console.log(`${prefix} → ${paths.promptPath}\n`);
        continue;
      }

      const rawImageBytes = await withProgress(`${prefix} generating image`, () =>
        generateImage({ client: openai, model: args.model, prompt: scenePrompt, size: args.size })
      );

      let caption = null;
      let captionPrompt = null;
      let finalImageBytes = rawImageBytes;

      if (args.mode === "full") {
        const captionResult = await withProgress(`${prefix} writing caption`, () =>
          generateCaption({ client: openai, model: args.captionModel, scene, imageBytes: rawImageBytes })
        );
        caption = captionResult.caption;
        captionPrompt = captionResult.prompt;
        finalImageBytes = await withProgress(`${prefix} placing text`, () =>
          overlayCaption(rawImageBytes, caption)
        );
      }

      const posterPrompt = buildLegacyPromptForMetadata(scene, caption);
      const paths = await withProgress(`${prefix} saving draft`, () =>
        saveGeneratedAsset({
          outputDir: args.outDir,
          backgroundDir: args.backgroundDir,
          metaDir: args.metaDir,
          name,
          imageBytes: finalImageBytes,
          rawImageBytes: args.mode === "full" ? rawImageBytes : null,
          prompt: posterPrompt,
          metadata: {
            imageModel: args.model,
            captionModel: args.mode === "full" ? args.captionModel : null,
            promptModel: args.promptModel,
            size: args.size,
            generatedAt: new Date().toISOString(),
            scene,
            scenePrompt,
            promptWriterPrompt,
            captionPrompt,
            caption,
          },
        })
      );

      saved++;
      console.log(`${prefix} → ${paths.imagePath}`);
      if (caption) console.log(`${prefix}   caption: "${caption.smallText} ${caption.bigText}"`);
      console.log("");
    } catch (e) {
      failed++;
      console.error(`${prefix} failed: ${e.message || e}\n`);
    }
  }

  if (!args.dryRun) {
    console.log(`Done: ${saved} saved, ${failed} failed in ${formatElapsed(Date.now() - startedAt)}.`);
    if (saved > 0 && args.mode !== "prompts") {
      console.log(`\nReady to publish? Run: npm run publish`);
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
