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

const CAMERA_LOOKS = {
  auto: "let the generator choose the best camera texture for the scene",
  "2000s-digital": "grainy high-contrast 2000s digital camera, crushed shadows, blown highlights, saturated color, JPEG softness",
  "cheap-flash": "cheap compact-camera flash, hard shadows, shiny skin, dark real-location background, accidental party-photo energy",
  disposable: "disposable camera photo, soft blur, washed colors, dust, imperfect focus, vacation-camera chaos",
  fisheye: "wide-angle fisheye snapshot, close foreground distortion, goofy low-angle internet-photo energy",
  "night-out": "high-contrast 2004 pocket camera flash at night, wet pavement, neon reflections, black sky",
  sunset: "grainy sunset point-and-shoot photo, pastel sky, warm blown highlights, silhouettes low in frame",
  "raw-iphone": "old iPhone camera roll photo, mild motion blur, uneven exposure, raw found-photo framing",
};

const VIBE_PRESETS = {
  auto: "let the user's idea lead the mood",
  iconic: "main-character cool, attractive, celebrity-adjacent without resembling a real person, confident flash-photo energy",
  chaos: "goofy peak-frame chaos, scream-laughing, absurd but happy, caught mid-action",
  "night-out": "friends outside late, singing, neon, rain-slick street, flash photo after a wild night",
  outdoors: "big view, hiking, beach run, wind, sunset, rainbows, warm rain, full-body joy",
  "animal-chaos": "joyful animal meme energy: single animals or 2-3 animals max, smiling into camera, goofy close-ups, jumping, running, playful piles, nature when it is bright/iconic, cozy flash pets, instant comedy",
  "street-racer": "early-2000s street-racer styling, shiny cars as vague shapes, flash, motion, no logos or exact cast likenesses",
  "dressy-flash": "sharp suit or dress, model-level beauty, red-carpet-ish compact flash, expensive but candid",
};

const STYLE_RECIPES = {
  none: "no locked style recipe",
  "alpine-techwear": [
    "masked alpine techwear outdoor action-camera set",
    "technical shell jacket, reflective sunglasses or goggles, face covering sometimes, gloves, cold-weather or mountain gear, no visible logos",
    "eyewear should rotate: reflective sunglasses, wraparound glacier shades, mirrored shield sunglasses, smoke lenses, amber lenses, blue lenses, green lenses, black lenses, and ski goggles only sometimes; not always silver",
    "expressions should vary: mouth often covered by balaclava or neck gaiter, closed-mouth calm, neutral cool, subtle smile, occasional open smile only sometimes",
    "subjects can be women, men, androgynous people, two girls together, a guy and girl together, or two friends; do not default to solo men",
    "huge mountain, snow, grass, cloud, or sky negative space for text",
    "crunchy early-2000s digital/action-cam texture, cold blue/green color, high contrast, blown sky, visible grain",
    "same isolated iconic outdoor vibe across the whole series while only the chosen variables change",
  ].join("; "),
  "animal-nature-selfie": [
    "goofy animal selfie in a bright real outdoor place",
    "one expressive animal as the hero, or 2-3 animals max only when explicitly requested",
    "wide-angle/fisheye close foreground face, low camera, huge readable sky/field/grass/beach/hill negative space for text",
    "grainy early-2000s compact digital camera texture, oversaturated blue sky and green/yellow grass, blown highlights, JPEG softness",
    "funny wholesome internet-pet energy: smiling into camera, nose close to lens, tiny accessory, awkward crop, accidental nature wallpaper",
  ].join("; "),
};

const ALPINE_TECHWEAR_SUBJECTS = [
  "a solo woman in no-logo alpine techwear",
  "two girls together in matching no-logo mountain shells",
  "a guy and girl together in layered cold-weather techwear",
  "an androgynous solo hiker in layered alpine gear",
  "two friends in no-logo alpine shells and gloves",
  "a solo man in no-logo alpine techwear",
  "a girl and guy sitting together on a high alpine slope",
  "two women in oversized technical shells on a windy ridge",
];

const ALPINE_EYEWEAR = [
  "blue mirrored wraparound sunglasses",
  "amber reflective shield sunglasses",
  "smoke-tinted glacier sunglasses",
  "green mirrored sporty sunglasses",
  "black-lens wraparound shades",
  "rose-gold reflective sunglasses",
  "blue mirrored ski goggles",
  "dark ski goggles under a beanie",
];

const ALPINE_FACE_STYLING = [
  "mouth covered by a black balaclava",
  "mouth hidden by a neck gaiter",
  "closed-mouth calm expression",
  "subtle closed-mouth smile",
  "neutral cool expression",
  "tiny smile with lips closed",
  "face mostly covered by winter gear",
  "occasional open smile, not screaming",
];

const ALPINE_TECHWEAR_VARIATIONS = [
  {
    setting: "a misty mountaintop overlook above a pale cloud layer with blue ridgelines fading into the distance",
    action: "standing low in frame with both gloved hands out in a deadpan shrug toward the camera, mouth covered by a balaclava or neck gaiter",
    weather: "cold bright haze with blown-out blue-white sky",
    composition: "wide action-camera framing, subject low in the bottom third, huge readable sky and mountains above",
    color: "icy blue sky, soft white haze, muted alpine greens, crunchy high-contrast digital color",
  },
  {
    setting: "a snowy alpine ridge with jagged mountains behind, wind-blown snow texture low in frame, and a huge bright sky",
    action: "facing the camera in a clean still pose with gloved hands near the chest, calm closed-mouth expression or mouth hidden by gear",
    weather: "bluebird winter daylight with harsh snow reflection",
    composition: "wide fisheye-ish frame, subject small-to-medium low in frame, mountains and sky dominating the top",
    color: "cold cobalt blue, clean snow white, dark gear contrast, early-digital sensor grain",
  },
  {
    setting: "a high ski slope or glacier path with an empty white run falling away into a distant alpine valley",
    action: "holding one arm toward the camera like a self-shot while looking back through reflective eyewear, subtle closed-mouth smile or covered mouth",
    weather: "thin mountain sun with blown highlights and cold air",
    composition: "POV action-camera angle with an extended arm, subject low and centered, valley and sky left open for text",
    color: "blue-white snow, black gear, washed cyan sky, JPEG softness and grit",
  },
  {
    setting: "a steep green alpine meadow seen from above with tiny yellow flowers and dark grass texture around the subject",
    action: "lying or sitting in the grass with arms crossed, staring up through reflective eyewear like a weird album-cover snapshot",
    weather: "clear crisp daylight with slightly harsh point-and-shoot exposure",
    composition: "top-down wide-angle framing, subject centered low/mid frame, dense green texture with simple upper space",
    color: "saturated moss green, white gear, deep shadow pockets, crunchy old-camera contrast",
  },
  {
    setting: "a bright open ski bowl with dramatic clouds, blue mountain silhouettes, and a clean white slope below",
    action: "leaning close to the lens in full winter face covering and reflective eyewear, playful but cool without an open-mouth grin, as if caught before dropping in",
    weather: "bright high-altitude sun with fast clouds and blown highlights",
    composition: "close wide-angle action-camera frame, helmet and goggles readable, sky and slope open behind for text",
    color: "electric blue sky, clean alpine whites, black lens reflection, high-contrast digital grain",
  },
];

const ANIMAL_NATURE_SELFIE_VARIATIONS = [
  {
    setting: "a soft green meadow with distant blue hills, tiny wildflowers low in frame, and a pale grainy sky above",
    action: "smiling straight into the wide-angle camera with nose slightly too close to the lens",
    weather: "misty bright morning light with soft blown highlights",
    composition: "animal head low and centered in the lower third, goofy face readable, huge hazy sky and meadow open above",
    color: "pale blue sky, soft green field, flower yellow, washed early-digital grain",
  },
  {
    setting: "a wide sandy beach or open dirt path with tiny clouds, low horizon, and a giant saturated blue sky",
    action: "grinning with mouth open toward the camera like a happy accidental selfie",
    weather: "clear bright daylight with harsh compact-camera exposure",
    composition: "extreme wide-angle close animal face in foreground, horizon low, sky dominating the top half",
    color: "deep blue sky, beige sand, warm fur tones, crunchy sensor noise and JPEG softness",
  },
  {
    setting: "a rolling golden field with a few distant animals blurred behind and dramatic purple-grey clouds above",
    action: "looking back at the camera mid-walk with a goofy happy face",
    weather: "stormy-but-bright afternoon light, not gloomy, with glowing field color",
    composition: "animal close in the lower foreground, background animals tiny and blurred, huge textured sky for text",
    color: "golden grass, lavender cloud shadows, warm fur, grainy high-contrast digital color",
  },
  {
    setting: "a grassy hill under an electric blue sky with one wild cloud streak and distant trees low on the horizon",
    action: "staring into the camera with a proud weird little expression",
    weather: "bright blue-sky daylight with sun glare and old-camera softness",
    composition: "low-angle fisheye frame, animal face and shoulders low/mid frame, sky clean and massive above",
    color: "electric blue sky, saturated green grass, clean whites, high-contrast old compact-camera grain",
  },
  {
    setting: "a backyard or park lawn with a line of trees, bright open grass, and a cloud-streaked sky",
    action: "charging toward the camera with tongue out and a ridiculously happy face",
    weather: "sunny afternoon with blown highlights and mild motion blur",
    composition: "wide-angle action selfie, animal low and close, motion blur on body, sky and grass left readable for text",
    color: "bright green lawn, blue sky, warm fur, crunchy 2000s digital saturation",
  },
  {
    setting: "a snowy open hill or grey winter field with bare trees low in the distance and a simple overcast sky",
    action: "accidentally taking a selfie with a startled funny expression while one or two other animals peek from behind",
    weather: "flat winter daylight with flash-like high contrast, still playful not sad",
    composition: "funny close animal face low in frame, optional 1-2 background animals only, large pale sky/field above",
    color: "soft grey sky, muted snow or winter grass, dark fur contrast, visible grain and old-phone softness",
  },
];

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
    idea: "",
    directionMode: "series",
    styleRecipe: "none",
    subject: "",
    location: "",
    gender: "",
    gear: "",
    action: "",
    cameraLook: "auto",
    vibePreset: "auto",
    styleNotes: "",
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
    else if (arg === "--idea") out.idea = cleanOptionText(next(), 700);
    else if (arg === "--direction-mode") out.directionMode = next();
    else if (arg === "--style-recipe") out.styleRecipe = next();
    else if (arg === "--subject") out.subject = cleanOptionText(next(), 300);
    else if (arg === "--location") out.location = cleanOptionText(next(), 300);
    else if (arg === "--gender") out.gender = cleanOptionText(next(), 160);
    else if (arg === "--gear") out.gear = cleanOptionText(next(), 300);
    else if (arg === "--action") out.action = cleanOptionText(next(), 300);
    else if (arg === "--camera-look") out.cameraLook = next();
    else if (arg === "--vibe-preset") out.vibePreset = next();
    else if (arg === "--style-notes") out.styleNotes = cleanOptionText(next(), 500);
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
  if (!["series", "exact"].includes(out.directionMode)) {
    throw new Error("--direction-mode must be one of: series, exact");
  }
  if (!STYLE_RECIPES[out.styleRecipe]) {
    throw new Error(`--style-recipe must be one of: ${Object.keys(STYLE_RECIPES).join(", ")}`);
  }
  if (!CAMERA_LOOKS[out.cameraLook]) {
    throw new Error(`--camera-look must be one of: ${Object.keys(CAMERA_LOOKS).join(", ")}`);
  }
  if (!VIBE_PRESETS[out.vibePreset]) {
    throw new Error(`--vibe-preset must be one of: ${Object.keys(VIBE_PRESETS).join(", ")}`);
  }

  if (!out.outDir) {
    out.outDir = out.mode === "prompts" ? PROMPTS_DIR : BACKGROUNDS_DIR;
  }
  out.metaDir = out.mode === "prompts" ? out.outDir : META_DIR;

  return out;
}

function cleanOptionText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
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
  --idea <text>        Optional scene/topic direction for the batch
  --direction-mode     series | exact. Default: series
  --camera-look        ${Object.keys(CAMERA_LOOKS).join(" | ")}
  --vibe-preset        ${Object.keys(VIBE_PRESETS).join(" | ")}
  --style-notes <text> Optional extra styling notes
  --dry-run            Print scenes/prompts only; no API calls
  --style-recipe       ${Object.keys(STYLE_RECIPES).join(" | ")}
  --subject <text>     Variable subject notes for directed/locked-style generation
  --location <text>    Variable location notes for directed/locked-style generation
  --gender <text>      Variable gender/look notes for directed/locked-style generation
  --gear <text>        Variable outfit/gear notes for directed/locked-style generation
  --action <text>      Variable pose/action notes for directed/locked-style generation
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

function hasDirection(args) {
  return Boolean(
    args.idea ||
    args.styleNotes ||
    args.subject ||
    args.location ||
    args.gender ||
    args.gear ||
    args.action ||
    args.styleRecipe !== "none" ||
    args.cameraLook !== "auto" ||
    args.vibePreset !== "auto"
  );
}

function directionMetadata(args) {
  if (!hasDirection(args)) return null;
  return {
    idea: args.idea || null,
    directionMode: args.directionMode,
    styleRecipe: args.styleRecipe,
    styleRecipeDescription: STYLE_RECIPES[args.styleRecipe],
    subject: args.subject || null,
    location: args.location || null,
    gender: args.gender || null,
    gear: args.gear || null,
    action: args.action || null,
    cameraLook: args.cameraLook,
    cameraLookDescription: CAMERA_LOOKS[args.cameraLook],
    vibePreset: args.vibePreset,
    vibePresetDescription: VIBE_PRESETS[args.vibePreset],
    styleNotes: args.styleNotes || null,
  };
}

function directionAvoidList(avoidSignatures = new Set()) {
  return [...avoidSignatures]
    .filter((key) => key.startsWith("family:") || key.startsWith("concept:"))
    .slice(0, 20)
    .map((key) => `- ${key.replace(/^(family|concept):/, "")}`)
    .join("\n");
}

function buildDirectedScenePrompt({ args, index, count, avoidSignatures }) {
  const avoidList = directionAvoidList(avoidSignatures);
  const modeInstruction = args.directionMode === "exact"
    ? "Preserve the user's core scene as closely as possible while making the photo coherent and text-friendly."
    : "Treat the user's idea as a loose topic/vibe for a related series. This item should clearly belong to the same set, but it must change at least one meaningful element such as subject detail, gesture, camera angle, nearby action, weather, or micro-setting.";
  const styleLock = args.styleRecipe !== "none"
    ? `\nLocked style recipe:\n${STYLE_RECIPES[args.styleRecipe]}\n\nThe style recipe is NOT optional. Preserve its camera texture, color family, composition grammar, and emotional vibe across the whole batch. Only vary the variable knobs below and small scene details needed for freshness.`
    : "";

  return `Create ONE scene brief for a square Instagram lock-screen poster background.

This is item ${index} of ${count}.

User idea / topic:
${args.idea || "(none provided; use the options below)"}

Variable knobs:
- subject: ${args.subject || "(open)"}
- gender/look: ${args.gender || "(open)"}
- location: ${args.location || "(open)"}
- gear/outfit: ${args.gear || "(open)"}
- action/pose: ${args.action || "(open)"}
${styleLock}

Direction mode:
${args.directionMode}

${modeInstruction}

Camera look:
${CAMERA_LOOKS[args.cameraLook]}

Scene vibe preset:
${VIBE_PRESETS[args.vibePreset]}

Extra style notes:
${args.styleNotes || "(none)"}

Hard creative rules:
- Keep the result like a real forgotten camera-roll photo: early-2000s digital, grain, cheap flash or imperfect exposure, accidental framing.
- The default emotional temperature is bright, uplifting, funny, and save-worthy. It should feel like a small hit of joy, not gloomy nature content.
- Use a specific, interesting real place. The background can be readable for text, but it must still have context: sky, smoke, mist, sunset, arena rafters, packed bleachers, convention lights, neon reflections, rain, crowd bokeh, bridge underside, high ceiling, or event lighting.
- Never solve text space with a plain wall, blank beige wall, empty studio backdrop, blank concrete, plain curtain, or featureless indoor surface.
- Make it emotionally readable: happy, iconic, weird, confident, funny, scream-laughing, or caught in a peak moment.
- Avoid muddy, swampy, murky, grey-green, damp, sad, documentary-wildlife, or eerie scenes unless the user explicitly asks for that.
- Animal ideas should usually be singular. If there is a group, use only 2-3 animals max; never use crowds, flocks, big litters, packs, swarms, or more than 3 animals.
- Animal ideas can show: smiling straight into camera, goofy close-up face, jumping, sprinting, tumbling, wearing a harmless prop, or doing one instantly readable silly thing.
- Animal backgrounds can be nature when the animal is doing something fun: blue-sky grassland, flower field, bright ice floe, beach, sunny pond edge, farmyard, backyard, mountain meadow, or ocean overlook. Cozy indoor/flash pet photos are also good. Do not use foggy riverbanks, dark wet fur piles, muddy banks, cold mist, or gloomy swamp water.
- If the user asks for costume, sport, formalwear, celebrity-adjacent, or pop-reference energy, put it in a fitting world: a convention floor, real boxing ring, stadium, paddock, hotel driveway, rooftop, arcade, street meet, public pool, beach sprint, or crowded event space.
- If the user names a real person, actor, athlete, musician, celebrity, public figure, or fictional/franchise character, DO NOT depict that exact person/character. Translate it into generic styling, era, costume, posture, subject type, or aesthetic only.
- Do not include logos, team crests, brand marks, franchise symbols, typography, signs as readable text, or exact celebrity likenesses.
- If the idea mentions a specific famous place with lots of signs, keep signage unreadable/blurred and focus on lights, color, crowd, and mood.
- Keep clothing coherent with the scene.
- If this is a series, avoid making every item the same composition.
${avoidList ? `\nRecently used concepts/families to avoid repeating too closely:\n${avoidList}` : ""}

Return ONLY JSON with these exact fields:
{
  "conceptId": "short-kebab-id",
  "vibe": "3-6 word mood label",
  "subjectKind": "animal" or "person",
  "subject": "full subject phrase, generic not a named likeness",
  "action": "pose/behavior only, no location words",
  "setting": "one specific place, richly described",
  "camera": "camera texture phrase",
  "weather": "light/weather phrase",
  "timeOfDay": "same as weather or time phrase",
  "prop": "nothing or one simple prop",
  "cameraAngle": "composition phrase",
  "composition": "same as cameraAngle",
  "colorDirection": "color palette phrase",
  "emotion": "one of: gentle, funny, momentum, self-worth, perspective",
  "copyFormula": "one of: plain opener, then deadpan truth | smile/stay/remember opener, then tiny sincere payoff | group-chat line, then iconic/gangsta/real payoff"
}`;
}

function compactJoin(parts) {
  return parts
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function buildAlpineTechwearScene({ args, index, count, guidance }) {
  const variation = fallbackPick(ALPINE_TECHWEAR_VARIATIONS, index);
  const userLocation = args.location || "";
  const userGear = args.gear || "";
  const userAction = args.action || "";
  const genderLook = args.gender ? `${args.gender} ` : "";
  const subjectCore = args.subject || fallbackPick(ALPINE_TECHWEAR_SUBJECTS, index);
  const hasEyewear = /\b(goggle|goggles|sunglasses|shades|visor|lenses|lens|eyewear)\b/i.test(userGear);
  const hasFaceCovering = /\b(balaclava|neck gaiter|mask|masked|face covering|covered mouth|mouth covered)\b/i.test(userGear);
  const eyewear = hasEyewear ? null : fallbackPick(ALPINE_EYEWEAR, index);
  const faceStyling = hasFaceCovering ? null : fallbackPick(ALPINE_FACE_STYLING, index);
  const subject = compactJoin([
    `${genderLook}${subjectCore}`.trim(),
    eyewear && `wearing ${eyewear}`,
    faceStyling,
    userGear || "technical shell jacket, gloves, mountain pants, winter/outdoor gear",
    "generic no-logo styling",
  ]);
  const setting = userLocation
    ? `${userLocation}, rendered in the same alpine/outdoor action-camera world with real terrain, sky, weather, and distance`
    : variation.setting;
  const action = userAction || variation.action;
  const camera = args.cameraLook === "auto"
    ? "wide-angle early-2000s action-camera snapshot with fisheye distortion, heavy sensor noise, JPEG softness, and accidental framing"
    : `${CAMERA_LOOKS[args.cameraLook]}, still preserving the wide alpine action-camera look`;
  const styleNotes = args.styleNotes
    ? ` Extra locked notes: ${args.styleNotes}.`
    : "";

  return {
    ...buildSceneFromDirector({
      conceptId: `alpine-techwear-${index}`,
      vibe: "cold alpine techwear nostalgia",
      subjectKind: "person",
      subject,
      action,
      setting,
      camera,
      weather: variation.weather,
      timeOfDay: variation.weather,
      prop: "nothing",
      cameraAngle: variation.composition,
      composition: variation.composition,
      colorDirection: `${variation.color}; ${styleNotes}`.trim(),
      emotion: "perspective",
      copyFormula: "group-chat line, then iconic/gangsta/real payoff",
      guidance,
      seriesIndex: index,
      seriesCount: count,
    }),
    source: "custom-direction",
  };
}

function buildAnimalNatureSelfieScene({ args, index, count, guidance }) {
  const variation = fallbackPick(ANIMAL_NATURE_SELFIE_VARIATIONS, index);
  const animal = args.subject || args.idea || "happy dog";
  const look = args.gender ? `${args.gender}, ` : "";
  const accessory = args.gear
    ? `${args.gear}, used as a tiny harmless accessory or styling detail`
    : "maybe one tiny accessory like a cap, flower, bandana, or nothing at all";
  const subject = compactJoin([
    `${look}${animal}`.trim(),
    "the unmistakable hero animal",
    accessory,
    "real animal photo, not CGI",
  ]);
  const setting = args.location
    ? `${args.location}, treated as a real outdoor animal-selfie place with visible terrain, sky, horizon, and natural context`
    : variation.setting;
  const action = args.action || variation.action;
  const camera = args.cameraLook === "auto"
    ? "cheap early-2000s digital camera or action-camera selfie, wide-angle/fisheye distortion, visible sensor noise, blown highlights, JPEG softness"
    : `${CAMERA_LOOKS[args.cameraLook]}, while preserving the close wide-angle animal selfie look`;
  const styleNotes = args.styleNotes
    ? ` Extra locked notes: ${args.styleNotes}.`
    : "";

  return {
    ...buildSceneFromDirector({
      conceptId: `animal-nature-selfie-${index}`,
      vibe: "goofy animal nature selfie",
      subjectKind: "animal",
      subject,
      action,
      setting,
      camera,
      weather: variation.weather,
      timeOfDay: variation.weather,
      prop: "nothing",
      cameraAngle: variation.composition,
      composition: variation.composition,
      colorDirection: `${variation.color}; ${styleNotes}`.trim(),
      emotion: "funny",
      copyFormula: "smile/stay/remember opener, then tiny sincere payoff",
      guidance,
      seriesIndex: index,
      seriesCount: count,
    }),
    source: "custom-direction",
  };
}

async function generateDirectedScene({ client, model, args, index, count, avoidSignatures }) {
  const guidance = directionMetadata(args);
  if (args.styleRecipe === "alpine-techwear") {
    return buildAlpineTechwearScene({ args, index, count, guidance });
  }
  if (args.styleRecipe === "animal-nature-selfie") {
    return buildAnimalNatureSelfieScene({ args, index, count, guidance });
  }

  if (!client) return buildDirectedSceneFallback({ args, index, count, guidance });

  const prompt = buildDirectedScenePrompt({ args, index, count, avoidSignatures });
  const response = await client.responses.create({
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
  });
  const raw = parseDirectorScene(responseText(response));
  return {
    ...buildSceneFromDirector(raw),
    source: "custom-direction",
    guidance,
    seriesIndex: index,
    seriesCount: count,
  };
}

function fallbackPick(items, index) {
  return items[(Math.max(1, Number(index) || 1) - 1) % items.length];
}

function animalFallbackDirection(idea, index) {
  const text = String(idea || "").toLowerCase();
  const base = {
    setting: "a bright blue-sky field with flowers, grass texture low in frame, and a clean happy sky above",
    weather: "clear blue sky with warm happy sunlight",
    timeOfDay: "bright cheerful daytime",
    composition: "animal low in frame, funny face readable, bright simple upper background for text",
    colorDirection: "saturated blue sky, bright grass, clean whites, warm sunlight, and early-digital color",
  };

  if (/\b(cat|cats|kitten|kittens|kitty|tabby|siamese)\b/.test(text)) {
    return {
      setting: fallbackPick([
        "a cozy messy bedroom with rumpled bedding low in frame, cheap flash glare, and a simple bright ceiling/wall area above",
        "a dark hallway pet snapshot with hard compact-camera flash, floor texture low in frame, and a funny spotlight falloff above",
        "a sunny flower patch with blue sky, bright petals around the cat, and a clean upper background",
      ], index),
      weather: "cheap compact-camera flash or bright sunny window light",
      timeOfDay: "flash-lit indoor moment or bright garden daytime",
      composition: "goofy cat face close to the lens or low in frame, eyes readable, simple upper area for text",
      colorDirection: "warm flash whites, natural fur color, saturated blue or cozy shadow, visible digital grain",
    };
  }

  if (/\b(dog|dogs|puppy|puppies|pup|pups)\b/.test(text)) {
    return {
      setting: fallbackPick([
        "a bright backyard lawn with a white fence, saturated blue sky, and two or three puppies tumbling low in frame",
        "a beach boardwalk edge with warm sand, ocean color, and a happy dog smiling into the camera",
        "a cozy living room with window light, toys low in frame, and a simple bright upper wall/ceiling glow",
      ], index),
      weather: "bright happy daylight or warm window flash",
      timeOfDay: "cheerful daytime",
      composition: "dog or puppy cluster low in frame, smiling face readable, upper third clean for text",
      colorDirection: "blue sky, bright grass or warm indoor flash, clean whites, and early-digital saturation",
    };
  }

  if (/\b(goat|goats|lamb|lambs|sheep|duck|ducks|duckling|ducklings)\b/.test(text)) {
    return {
      setting: fallbackPick([
        "a sunny farmyard with a tiny bench low in frame, electric blue sky, grass texture, and animals mid-jump",
        "a flower meadow beside a fence with bright grass low in frame and clean blue sky above",
        "a colorful backyard garden with a picnic blanket, toy clutter low in frame, and warm sun",
      ], index),
      weather: "clear blue sky and bright sunlight",
      timeOfDay: "bright cheerful daytime",
      composition: "two or three small animals max mid-jump or clustered low in frame, tiny paws readable, huge clean sky above",
      colorDirection: "saturated blue sky, spring grass, bright whites, flowers, and high-contrast digital grain",
    };
  }

  if (/\b(polar bear|penguin|penguins)\b/.test(text)) {
    return {
      setting: fallbackPick([
        "a bright ice floe under cobalt blue sky with clean white snow shapes and the animal low in frame",
        "a sunny arctic shoreline with sparkling ice, blue water, and a huge simple sky above",
        "a surreal bright flower field near a cold ocean overlook, clean horizon, and the animal low in frame",
      ], index),
      weather: "clear cold sunlight that still feels happy",
      timeOfDay: "bright arctic daytime",
      composition: "animal low in frame, face readable, cobalt sky or clean horizon above for text",
      colorDirection: "clean icy whites, deep cobalt blue, bright sun, and crunchy early-digital contrast",
    };
  }

  if (/\b(bear|bears|rhino|rhinos|rhinoceros|fox|foxes|monkey|monkeys|donkey|donkeys|horse|horses|pony|ponies)\b/.test(text)) {
    return {
      setting: fallbackPick([
        "a wide blue-sky grassland with flowers and the animal sprinting low in frame",
        "a sunny ocean-overlook flower field with bright color low in frame and a clean horizon above",
        "a playful sanctuary yard with toys, sunlit grass, fence shapes low in frame, and clean sky above",
      ], index),
      weather: "bright open daylight",
      timeOfDay: "cheerful daytime",
      composition: "animal running, smiling, or doing one goofy action low in frame with a simple iconic background above",
      colorDirection: "natural bright greens, saturated blue sky, flower color, and old digital-camera contrast",
    };
  }

  return {
    ...base,
    setting: fallbackPick([
      base.setting,
      "a sunny flower field with the animal smiling into camera, bright petals low in frame, and blue sky above",
      "a cozy flash-lit room with playful clutter low in frame, funny animal expression, and a simple upper glow",
      "a bright beach or pond edge with sparkling water low in frame and clean sky above",
    ], index),
  };
}

function buildDirectedSceneFallback({ args, index, count, guidance }) {
  const idea = args.idea || args.styleNotes || "custom camera-roll idea";
  const subjectKind = args.vibePreset === "animal-chaos" || /\b(cat|cats|dog|dogs|cow|cows|bear|bears|polar bear|brown bear|monkey|monkeys|duck|ducks|duckling|ducklings|donkey|donkeys|fox|foxes|lamb|lambs|animal|animals|puppy|puppies|kitten|kittens|otter|otters|seal|seals|bunny|bunnies|rabbit|rabbits|goat|goats|rhino|rhinos|rhinoceros|penguin|penguins|horse|horses|pony|ponies)\b/i.test(idea)
    ? "animal"
    : "person";
  const camera = args.cameraLook === "auto"
    ? "grainy high-contrast 2000s digital camera photo"
    : CAMERA_LOOKS[args.cameraLook];
  const animalDirection = subjectKind === "animal" ? animalFallbackDirection(idea, index) : null;
  let setting = subjectKind === "animal"
    ? animalDirection.setting
    : "a real camera-roll location with interesting context and a readable upper sky, ceiling, mist, lights, or crowd-glow area";
  if (/\bspace|sci-fi|helmet|convention\b/i.test(idea)) {
    setting = "a busy space convention atrium with suspended planet props, vendor booths low in frame, camera flashes, and a high industrial ceiling";
  } else if (/\bbox|boxing|boxer|glove|ring\b/i.test(idea)) {
    setting = "a real boxing ring under arena lights with ropes low in frame and packed bleachers fading into darkness behind";
  } else if (/\btimes square|city|street|night|neon\b/i.test(idea)) {
    setting = "a busy neon city square at night with blurred unreadable signs, crowd glow, wet pavement, and a dark open sky above";
  } else if (/\bstreet.?racer|tuner|modified car|fast car|garage\b/i.test(idea)) {
    setting = "a night street-race meet under an overpass with modified cars, blue underglow, smoke, wet pavement, and bridge lights";
  } else if (/\btux|dress|formal|red carpet|hotel|paparazzi\b/i.test(idea)) {
    setting = "a hotel driveway at night with wet pavement, velvet ropes, valet lights, blurred camera flashes, and a dark entrance canopy";
  }
  const vibe = args.vibePreset === "auto" ? (args.directionMode === "series" ? "custom series vibe" : "custom directed scene") : args.vibePreset.replace(/-/g, " ");

  return {
    ...buildSceneFromDirector({
      conceptId: `custom-direction-${index}`,
      vibe,
      subjectKind,
      subject: subjectKind === "animal" ? "the user-described animal subject" : "the user-described subject",
      action: `${idea}${args.directionMode === "series" && count > 1 ? `, variation ${index} of ${count}` : ""}`,
      setting,
      camera,
      weather: subjectKind === "animal"
        ? animalDirection.weather
        : args.cameraLook === "night-out" ? "clear night with distant city glow" : "high-contrast 2000s light",
      timeOfDay: subjectKind === "animal"
        ? animalDirection.timeOfDay
        : args.cameraLook === "night-out" ? "night" : "2000s camera-roll light",
      prop: "nothing",
      cameraAngle: subjectKind === "animal" ? animalDirection.composition : "subject low in frame with a readable but interesting upper background",
      composition: subjectKind === "animal" ? animalDirection.composition : "subject low in frame with a readable but interesting upper background",
      colorDirection: subjectKind === "animal"
        ? animalDirection.colorDirection
        : "high-contrast 2000s digital color with crushed shadows",
      emotion: "funny",
      copyFormula: "group-chat line, then iconic/gangsta/real payoff",
      guidance,
      seriesIndex: index,
      seriesCount: count,
    }),
    source: "custom-direction",
  };
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
    if (hasDirection(args)) {
      console.log(`Direction: ${args.directionMode} | ${args.idea || "(style-only)"}`);
      if (args.styleRecipe !== "none") console.log(`Style recipe: ${args.styleRecipe}`);
      const knobs = [
        args.subject && `subject=${args.subject}`,
        args.gender && `gender/look=${args.gender}`,
        args.location && `location=${args.location}`,
        args.gear && `gear=${args.gear}`,
        args.action && `action=${args.action}`,
      ].filter(Boolean);
      if (knobs.length) console.log(`Variables: ${knobs.join(" | ")}`);
      console.log(`Camera look: ${args.cameraLook}`);
      console.log(`Scene vibe: ${args.vibePreset}`);
      if (args.styleNotes) console.log(`Style notes: ${args.styleNotes}`);
    }
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
      if (hasDirection(args)) {
        scene = await generateDirectedScene({
          client: openai,
          model: args.promptModel,
          args,
          index: itemNumber,
          count: args.count,
          avoidSignatures: avoidSceneSignatures,
        });
      } else {
        scene = await pickUniqueScene({
          client: openai,
          promptModel: args.promptModel,
          avoidSignatures: avoidSceneSignatures,
          preferEnergy: itemNumber % 3 === 1,
        });
      }
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
          generationDirection: directionMetadata(args),
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
        generationDirection: directionMetadata(args),
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
