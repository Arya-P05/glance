/**
 * Generate nostalgic motivational posters with OpenAI Images.
 *
 * Examples:
 *   npm run generate-posters -- --count 25
 *   npm run generate-posters -- --count 10 --upload
 */
import "dotenv/config";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "./supabase-env.js";
import {
  DEFAULT_CAPTION_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PROMPT_MODEL,
  buildCaptionPrompt,
  buildHighConceptScene,
  buildIconicEnergyScene,
  buildLegacyPromptForMetadata,
  buildMotivationalPrompt,
  buildPromptWriterPrompt,
  buildScene,
  buildSceneFromArchetype,
  sceneDedupKeys,
  cleanGeneratedPrompt,
  finalizeCaption,
  variedFallbackCaption,
  makeAssetName,
  overlayCaption,
  parseCaption,
  saveGeneratedAsset,
  savePromptAsset,
} from "./motivational-generator.js";
import { BUCKET, POST_PREFIX, resizeForWidget } from "./instagram-helper.js";

function parseArgs(argv) {
  const out = {
    count: Number(process.env.POSTER_COUNT || "25"),
    outputDir: process.env.POSTER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    promptModel: process.env.OPENAI_PROMPT_MODEL || DEFAULT_PROMPT_MODEL,
    captionModel: process.env.OPENAI_CAPTION_MODEL || DEFAULT_CAPTION_MODEL,
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
    upload: process.env.POSTER_UPLOAD === "true" || process.env.POSTER_UPLOAD === "1",
    imageOnly: process.env.POSTER_IMAGE_ONLY === "true" || process.env.POSTER_IMAGE_ONLY === "1",
    promptOnly: process.env.POSTER_PROMPT_ONLY === "true" || process.env.POSTER_PROMPT_ONLY === "1",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--count" || arg === "-n") out.count = Number(next());
    else if (arg === "--out" || arg === "--output-dir") out.outputDir = next();
    else if (arg === "--model") out.model = next();
    else if (arg === "--prompt-model") out.promptModel = next();
    else if (arg === "--caption-model") out.captionModel = next();
    else if (arg === "--size") out.size = next();
    else if (arg === "--upload") out.upload = true;
    else if (arg === "--image-only") out.imageOnly = true;
    else if (arg === "--prompt-only") out.promptOnly = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(out.count) || out.count < 1 || out.count > 200) {
    throw new Error("--count must be an integer from 1 to 200");
  }
  if (!out.outputDir) throw new Error("--out must not be empty");
  if (!out.model) throw new Error("--model must not be empty");
  if (!out.promptModel) throw new Error("--prompt-model must not be empty");
  if (!out.captionModel) throw new Error("--caption-model must not be empty");
  if (out.promptOnly && out.upload) throw new Error("--prompt-only cannot be combined with --upload");
  return out;
}

function usage() {
  return `Usage:
  npm run generate-posters -- --count 25
  npm run generate-posters -- --count 10 --upload

Options:
  --count, -n <number>       Number of posters to generate. Default: 25
  --out <dir>                Output directory. Default: motivational_assets
  --model <model>            Image model. Default: ${DEFAULT_IMAGE_MODEL}
  --prompt-model <model>     Prompt writer model. Default: ${DEFAULT_PROMPT_MODEL}
  --caption-model <model>    Caption model. Default: ${DEFAULT_CAPTION_MODEL}
  --size <size>              Image size. Default: 1024x1024
  --upload                   Upload resized JPEGs to Supabase Storage + posts table
  --image-only               Save textless image candidates and skip caption/text overlay
  --prompt-only              Write bespoke image prompts only; does not call image generation
  --dry-run                  Print prompts only; does not call OpenAI or Supabase
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

async function uploadPoster({ supabase, name, imageBytes, caption }) {
  const storagePath = `${POST_PREFIX}/${name}.jpg`;
  const toUpload = await resizeForWidget(imageBytes);

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, toUpload, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (uploadErr) throw uploadErr;

  const { error: insertErr } = await supabase.from("posts").upsert(
    {
      instagram_id: `generated_${name}`,
      storage_path: storagePath,
      caption,
      posted_at: null,
    },
    { onConflict: "instagram_id" }
  );
  if (insertErr) throw insertErr;

  return storagePath;
}

async function generateImage({ client, model, prompt, size }) {
  const result = await client.images.generate({
    model,
    prompt,
    size,
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image response did not include b64_json");
  return Buffer.from(b64, "base64");
}

async function generateDetailedPrompt({ client, model, scene }) {
  const promptWriterPrompt = buildPromptWriterPrompt(scene);
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: promptWriterPrompt }],
      },
    ],
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

async function generateCaption({ client, model, scene, recentCaptions = [] }) {
  let lastPrompt = buildCaptionPrompt(scene, { recentCaptions });

  for (let attempt = 0; attempt < 5; attempt++) {
    lastPrompt = buildCaptionPrompt(scene, { recentCaptions, attempt });
    const response = await client.responses.create({
      model,
      temperature: 0.7,
      input: [{ role: "user", content: [{ type: "input_text", text: lastPrompt }] }],
    });
    const caption = finalizeCaption(parseCaption(responseText(response)), recentCaptions, scene);
    if (caption) return { caption, prompt: lastPrompt };
  }

  return {
    caption: variedFallbackCaption(scene, recentCaptions),
    prompt: lastPrompt,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const openai = args.dryRun ? null : new OpenAI({ apiKey: env("OPENAI_API_KEY") });
  const supabase =
    args.upload && !args.dryRun
      ? createClient(supabaseUrl(), supabaseServiceRoleKey())
      : null;

  const startedAt = Date.now();
  let saved = 0;
  let failed = 0;

  if (!args.dryRun) {
    console.log(`Generating ${args.count} poster${args.count === 1 ? "" : "s"}...`);
    console.log(`Prompts: ${args.promptModel}; images: ${args.model}; captions: ${args.captionModel}; size: ${args.size}`);
    if (args.promptOnly) console.log("Prompt-only: enabled");
    if (args.imageOnly) console.log("Image-only: enabled");
    if (args.upload) console.log("Upload: enabled");
    console.log("");
  }

  const avoidSceneSignatures = new Set();
  const recentCaptions = [];

  let completed = 0;
  let attempted = 0;
  const maxAttempts = args.dryRun
    ? args.count
    : args.count + Math.max(3, Math.ceil(args.count * 0.5));

  while (completed < args.count && attempted < maxAttempts) {
    attempted++;
    const itemNumber = completed + 1;
    const name = makeAssetName(attempted);
    let scene = null;
    for (let tries = 0; tries < 25; tries++) {
      const roll = Math.random();
      const candidate =
        itemNumber % 3 === 1 && tries < 12
          ? buildHighConceptScene()
          : roll < 0.18
            ? buildHighConceptScene()
            : roll < 0.42
            ? buildIconicEnergyScene()
            : roll < 0.78
              ? buildSceneFromArchetype()
              : buildScene(Math.random, { avoidSignatures: avoidSceneSignatures });
      if (isAllowedScene(candidate, avoidSceneSignatures)) {
        scene = candidate;
        break;
      }
    }
    if (!scene) {
      for (let tries = 0; tries < 80; tries++) {
        const candidate =
          itemNumber % 3 === 1 && tries < 40
            ? buildHighConceptScene()
            : tries % 3 === 0
              ? buildIconicEnergyScene()
              : buildSceneFromArchetype();
        if (isAllowedScene(candidate, avoidSceneSignatures, { allowFamilyRepeat: true })) {
          scene = candidate;
          break;
        }
      }
    }
    if (!scene) scene = itemNumber % 3 === 1 ? buildHighConceptScene() : buildSceneFromArchetype();
    for (const key of sceneDedupKeys(scene)) avoidSceneSignatures.add(key);
    const fallbackScenePrompt = buildMotivationalPrompt(scene);
    const promptWriterPrompt = buildPromptWriterPrompt(scene);
    const prefix = `[${itemNumber}/${args.count}]`;

    if (args.dryRun) {
      console.log(`\n--- ${name} creative brief ---\n${JSON.stringify(scene, null, 2)}`);
      console.log(`\n--- ${name} prompt-writer request ---\n${promptWriterPrompt}`);
      completed++;
      continue;
    }

    try {
      console.log(`${prefix} ${sceneSummary(scene)}`);
      const promptResult = await withProgress(`${prefix} writing image prompt`, () =>
        generateDetailedPrompt({
          client: openai,
          model: args.promptModel,
          scene,
        })
      );
      const scenePrompt = promptResult.prompt || fallbackScenePrompt;
      if (args.promptOnly) {
        const paths = await withProgress(`${prefix} saving prompt`, () =>
          savePromptAsset({
            outputDir: args.outputDir,
            name,
            prompt: scenePrompt,
            metadata: {
              promptModel: args.promptModel,
              generatedAt: new Date().toISOString(),
              scene,
              promptWriterPrompt: promptResult.promptWriterPrompt,
            },
          })
        );
        saved++;
        completed++;
        console.log(`${prefix} prompt: ${paths.promptPath}\n`);
        continue;
      }
      const rawImageBytes = await withProgress(`${prefix} making image`, () =>
        generateImage({
          client: openai,
          model: args.model,
          prompt: scenePrompt,
          size: args.size,
        })
      );
      let caption = null;
      let captionPrompt = null;
      let finalImageBytes = rawImageBytes;
      if (!args.imageOnly) {
        const captionResult = await withProgress(`${prefix} writing caption`, () =>
          generateCaption({
            client: openai,
            model: args.captionModel,
            scene,
            recentCaptions,
          })
        );
        caption = captionResult.caption;
        captionPrompt = captionResult.prompt;
        recentCaptions.unshift(caption);
        if (recentCaptions.length > 40) recentCaptions.length = 40;
        finalImageBytes = await withProgress(`${prefix} placing text`, () => overlayCaption(rawImageBytes, caption));
      }
      const posterPrompt = buildLegacyPromptForMetadata(scene, caption);
      const paths = await withProgress(`${prefix} saving files`, () =>
        saveGeneratedAsset({
          outputDir: args.outputDir,
          name,
          imageBytes: finalImageBytes,
          rawImageBytes: args.imageOnly ? null : rawImageBytes,
          prompt: posterPrompt,
          metadata: {
            imageModel: args.model,
            captionModel: args.captionModel,
            size: args.size,
            generatedAt: new Date().toISOString(),
            scene,
            scenePrompt,
            promptModel: args.promptModel,
            promptWriterPrompt: promptResult.promptWriterPrompt,
            captionPrompt,
            caption,
          },
        })
      );

      let uploadNote = "";
      if (supabase) {
        const storagePath = await withProgress(`${prefix} uploading to Glance`, () =>
          uploadPoster({
            supabase,
            name,
            imageBytes: finalImageBytes,
            caption: caption ? `${caption.smallText} ${caption.bigText}` : null,
          })
        );
        uploadNote = `; uploaded ${storagePath}`;
      }

      saved++;
      completed++;
      console.log(`${prefix} saved ${paths.imagePath}${uploadNote}`);
      if (paths.rawImagePath) console.log(`${prefix} background: ${paths.rawImagePath}`);
      if (caption) console.log(`${prefix} caption: ${caption.smallText} / ${caption.bigText}`);
      console.log("");
    } catch (e) {
      failed++;
      console.error(`${prefix} failed: ${e.message || e}\n`);
    }
  }

  if (!args.dryRun) {
    console.log(`Done: ${saved} saved, ${failed} failed in ${formatElapsed(Date.now() - startedAt)}.`);
    if (saved < args.count) {
      console.log(`Stopped after ${attempted} attempt${attempted === 1 ? "" : "s"} before reaching ${args.count} saved poster${args.count === 1 ? "" : "s"}.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
