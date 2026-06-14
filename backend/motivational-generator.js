import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  HIGH_CONCEPT_ARCHETYPES,
  ICONIC_ENERGY_ARCHETYPES,
  POSTER_ARCHETYPES,
  isSceneBlocked,
  sceneDedupKeys,
  sceneSignature,
  settingFamily,
} from "./poster-concepts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPROVED_CAPTION_EXAMPLES_CSV = join(__dirname, "extract-post-text.manual.csv");
const DEFAULT_CAPTION_OPTION_COUNT = 5;
const MAX_SMALL_TEXT_LENGTH = 36;
const MAX_BIG_TEXT_LENGTH = 44;
const CAPTION_LINE_GAP_RATIO = 0.12;
const CAPTION_SMALL_FONT_RATIO = 0.032;
const CAPTION_BIG_FONT_RATIO = 0.06;
const MEDIUM_WIDGET_WIDTH = 1024;
const MEDIUM_WIDGET_HEIGHT = Math.round(MEDIUM_WIDGET_WIDTH * 155 / 329);

export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
/** Fast + strong instruction following for detailed image prompts */
export const DEFAULT_PROMPT_MODEL = "gpt-4.1-mini";
/** Vision-capable, good at short scene-specific copy; faster than gpt-5-mini */
export const DEFAULT_CAPTION_MODEL = "gpt-4.1-mini";

const ANIMAL_IDEAS = [
  "golden retriever",
  "samoyed",
  "border collie",
  "tiny chihuahua",
  "orange cat",
  "black cat",
  "cow",
  "highland cow",
  "alpaca",
  "llama",
  "duck",
  "goose",
  "horse",
  "miniature horse",
  "goat",
  "rabbit",
  "polar bear",
  "sheep",
  "donkey",
  "capybara",
  "penguin",
  "seal",
  "otter",
  "frog",
  "swan",
  "hamster",
  "raccoon plush-like dog",
  "parrot",
  "cockatoo",
  "pigeon",
  "turtle",
  "hedgehog",
  "red panda",
  "marmot",
  "ferret",
  "guinea pig",
  "pony",
];

// Explicit ethnicity descriptors so the model varies race, not just defaulting to white
const PERSON_ETHNICITIES = [
  "Black",
  "South Asian",
  "East Asian",
  "Latino",
  "Middle Eastern",
  "Southeast Asian",
  "Pacific Islander",
  "white",
  "mixed-race",
];

const PERSON_AGES = [
  "a little kid",
  "a teenage girl",
  "a teenage boy",
  "a young woman",
  "a young man",
  "a woman in her 30s",
  "a man in his 30s",
  "a middle-aged woman",
  "a middle-aged man",
  "a dad",
  "a mom",
  "a grandma",
  "a grandpa",
  "an elderly man",
  "an elderly woman",
];

const PERSON_ROLES = [
  "wearing roller skates",
  "in a flight suit",
  "wearing a life jacket",
  "in a puffy winter coat",
  "holding a grocery bag",
  "wearing sunglasses",
  "in a cheap suit",
  "in a rain jacket",
  "wearing a bike helmet",
  "holding a bouquet",
  "wearing a Santa hat",
  "in a soccer jersey",
  "with a tiny backpack",
  "holding a skateboard",
  "wearing headphones",
];

// Actions describe pose/behavior only — location lives in `setting`, never here.
const WILD_ACTIONS = [
  "smiling into the camera",
  "standing way too close to the camera",
  "jumping over a tiny ramp",
  "riding through golden light",
  "looking out toward the horizon",
  "running with pure joy",
  "sitting peacefully in sunlight",
  "standing proudly on something ordinary",
  "standing next to a tiny flower like it matters",
  "wearing oversized headphones",
  "sipping from a soda bottle like a tiny menace",
  "raising one paw like it has attitude",
  "leaning toward the camera with a ridiculous grin",
  "walking through warm rain and smiling",
  "making the most of a snowy day",
  "posing like it owns the place",
  "wearing sunglasses with complete confidence",
  "standing beside a weirdly parked car",
  "peeking over a fence",
  "watching distant fireworks",
  "chasing glowing sparklers",
  "floating in a canoe",
  "sitting in a fighter jet cockpit",
  "sitting on a skateboard",
  "holding an ice cream cone on a windy day",
  "running downhill with arms out",
  "splashing in a kiddie pool",
  "looking proud on a road trip",
  "walking through fog with a huge smile",
];

const MOODBOARD_SETTINGS = [
  "a huge green hill under a bright blue sky",
  "an empty beach with soft blue water",
  "a parking lot at golden hour",
  "a quiet highway rest stop",
  "a farm field with a low horizon",
  "a soccer field after school",
  "a boat dock on a calm lake",
  "a rooftop with open sky",
  "a sunflower field",
  "a mountain overlook with hazy hills",
  "a snowy field with bright white negative space",
  "a front porch with blank siding behind it",
  "a sunny bedroom corner with a plain wall",
  "a messy bedroom gaming desk with a blank wall above",
  "a cluttered desk under a plain wall",
  "a grocery store parking lot",
  "an empty basketball court",
  "a backyard with harsh afternoon sun",
  "a gas station at sunset",
  "a roadside ditch full of wildflowers",
  "a playground with a giant empty sky",
  "a ferry deck with ocean behind it",
  "a canoe in a quiet lake",
  "a small airplane runway at sunset",
  "a county fair parking lot",
  "a picnic area with pine trees",
  "a desert road with pastel sky",
  "a laundromat with a blank wall",
  "a school field on a sunny day",
  "inside a fighter jet cockpit with sunset sky outside",
];

const POSITIVE_WEATHER = [
  "clear blue sky",
  "bright midday sun",
  "warm golden hour",
  "soft sunrise",
  "pastel sunset",
  "blue hour with a hopeful glow",
  "sun peeking through clouds",
  "light fog with warm sun behind it",
  "misty morning light",
  "gentle snowfall with a happy subject",
  "warm rain with sunlight",
  "windy day with playful movement",
  "bright white winter light",
  "dreamy summer haze",
];

const CAMERA_TEXTURES = [
  "raw early-2000s digital camera photo",
  "cheap 2006 point-and-shoot camera photo",
  "old iPhone camera roll photo",
  "disposable camera photo",
  "wide-angle fisheye snapshot",
  "slightly blurry camcorder still",
  "compact camera flash photo",
  "accidental low-angle phone photo",
];

const COMPOSITION_IDEAS = [
  "subject huge in the lower third with a massive clean sky above",
  "subject close to the lens, low camera angle, open negative space above",
  "subject slightly off-center with blank wall or sky for text",
  "subject filling the bottom half, horizon low, simple background",
  "wide-angle close-up with goofy face and lots of empty color above",
  "simple candid frame with one clear focal point and no clutter",
];

const COLOR_DIRECTIONS = [
  "saturated blue sky and green grass",
  "washed-out pale beach colors",
  "golden sunlight and soft shadows",
  "pastel sunset colors",
  "flash-lit subject against dark simple background",
  "bright white negative space with black-text-friendly contrast",
  "clean early-digital blue and green color",
];

const DESK_SETTINGS = [
  "a messy bedroom gaming desk with a blank wall above",
  "a cluttered desk under a plain wall",
  "a sunny bedroom corner with a plain wall",
];

const INDOOR_SETTINGS = [
  "a sunny bedroom corner with a plain wall",
  "a laundromat with a blank wall",
  "a front porch with blank siding behind it",
];

const FIREWORKS_SETTINGS = [
  "an empty outdoor basketball court at night with fireworks in the distance",
  "a field under fireworks far in the background",
  "a rooftop with open sky and distant fireworks",
];

const SKATE_SETTINGS = [
  "an empty basketball court",
  "a parking lot at golden hour",
  "a school field on a sunny day",
];

const ROAD_TRIP_SETTINGS = [
  "a quiet highway rest stop",
  "a grocery store parking lot",
  "a gas station at sunset",
];

const COLD_SETTINGS = [
  "a snowy field with bright white negative space",
  "a quiet highway rest stop",
  "a parking lot at golden hour",
  "a small airplane runway at sunset",
];

const FIELD_SETTINGS = [
  "a huge green hill under a bright blue sky",
  "a farm field with a low horizon",
  "a soccer field after school",
  "a sunflower field",
  "a backyard with harsh afternoon sun",
];

const BEACH_WATER_SETTINGS = [
  "an empty beach with soft blue water",
  "a boat dock on a calm lake",
  "a ferry deck with ocean behind it",
  "a canoe in a quiet lake",
];

const FIELD_SETTINGS_NO_FIREWORKS = [
  "a huge green hill under a bright blue sky",
  "a farm field with a low horizon",
  "a soccer field after school",
  "a sunflower field",
  "a backyard with harsh afternoon sun",
];

/** When an action implies a location family, pick a matching setting if the current one conflicts. */
const ACTION_SETTING_HINTS = [
  { pattern: /headphones|soda bottle|gaming desk/, settings: DESK_SETTINGS },
  { pattern: /skateboard|tiny ramp/, settings: SKATE_SETTINGS },
  { pattern: /canoe|horizon|ocean/, settings: BEACH_WATER_SETTINGS },
  { pattern: /fireworks|sparkler/, settings: FIREWORKS_SETTINGS },
  { pattern: /cockpit|fighter jet/, settings: ["inside a fighter jet cockpit with sunset sky outside"] },
  { pattern: /road trip|rest stop|parked car/, settings: ROAD_TRIP_SETTINGS },
  { pattern: /flower|pure joy|running with/, settings: FIELD_SETTINGS_NO_FIREWORKS },
  { pattern: /kiddie pool|splashing/, settings: ["a backyard with harsh afternoon sun", "a front porch with blank siding behind it"] },
  { pattern: /downhill|grassy/, settings: ["a huge green hill under a bright blue sky", "a farm field with a low horizon", "a sunflower field"] },
  { pattern: /snowy day/, settings: COLD_SETTINGS },
];

const SKY_COMPOSITIONS = [
  "subject huge in the lower third with a massive clean sky above",
  "subject close to the lens, low camera angle, open negative space above",
  "subject filling the bottom half, horizon low, simple background",
  "wide-angle close-up with goofy face and lots of empty color above",
];

const WALL_COMPOSITIONS = [
  "subject close to the lens in the lower third with a blank wall above",
  "subject slightly off-center with blank wall or sky for text",
  "simple candid frame with one clear focal point and no clutter",
];

export const SUBJECTS = [
  "a golden retriever",
  "a cow",
  "an alpaca",
  "a duck",
  "a horse",
  "a goat",
  "a rabbit",
  "an orange cat",
  "a black cat",
  "a polar bear",
  "a sheep",
  "a donkey",
  "a highland cow",
  "a capybara",
  "an elderly man",
  "an elderly woman",
  "a little kid",
  "a grandma",
  "a grandpa",
  "an angler",
  "a surfer",
  "a construction worker",
  "a student",
  "a cyclist",
  "a hiker",
  "a farmer",
  "a skateboarder",
  "a mail carrier",
  "a nurse",
  "a chef",
];

const PEOPLE_SUBJECTS = new Set([
  "an elderly man",
  "an elderly woman",
  "a little kid",
  "a grandma",
  "a grandpa",
  "an angler",
  "a surfer",
  "a construction worker",
  "a student",
  "a cyclist",
  "a hiker",
  "a farmer",
  "a skateboarder",
  "a mail carrier",
  "a nurse",
  "a chef",
]);

const CAT_SUBJECTS = new Set(["an orange cat", "a black cat"]);

const DOG_SUBJECTS = new Set(["a golden retriever"]);

const FARM_ANIMAL_SUBJECTS = new Set([
  "a cow",
  "an alpaca",
  "a duck",
  "a horse",
  "a goat",
  "a rabbit",
  "a sheep",
  "a donkey",
  "a highland cow",
  "a capybara",
]);

const COLD_ANIMAL_SUBJECTS = new Set(["a polar bear"]);

export const SETTINGS = [
  "an empty beach",
  "a snow field",
  "a parking lot",
  "a mountain overlook",
  "a forest trail",
  "a suburban street",
  "a gas station",
  "a farm field",
  "a soccer field",
  "a boat dock",
  "a rooftop",
  "a sunflower field",
  "a highway rest stop",
  "a desert",
  "a lake shore",
  "a playground",
  "a grocery store parking lot",
  "an empty basketball court",
  "a driveway",
  "a school field",
  "a roadside ditch",
  "a backyard",
  "a front porch",
  "a bus stop",
  "a laundromat",
  "a boat ramp",
  "a mall parking lot",
  "a campground",
  "a picnic area",
  "a plain bedroom wall",
  "a sunny corner of a room",
  "a quiet kitchen",
  "a grassy hill",
  "a wooden bench overlook",
];

const PEOPLE_SETTINGS = [
  "an empty beach",
  "a snow field",
  "a parking lot",
  "a mountain overlook",
  "a forest trail",
  "a suburban street",
  "a gas station",
  "a soccer field",
  "a boat dock",
  "a rooftop",
  "a highway rest stop",
  "a lake shore",
  "a playground",
  "a grocery store parking lot",
  "an empty basketball court",
  "a driveway",
  "a school field",
  "a front porch",
  "a campground",
  "a picnic area",
  "a plain bedroom wall",
  "a sunny corner of a room",
  "a quiet kitchen",
  "a grassy hill",
  "a wooden bench overlook",
];

const SPECIAL_SETTINGS = {
  "an angler": ["a lake shore", "a boat dock", "a boat ramp", "an empty beach"],
  "a surfer": ["an empty beach", "a lake shore", "a boat dock"],
  "a construction worker": ["a parking lot", "a gas station", "a highway rest stop", "a driveway", "a suburban street"],
  "a cyclist": ["a mountain overlook", "a forest trail", "a highway rest stop", "a parking lot", "a lake shore"],
  "a hiker": ["a mountain overlook", "a forest trail", "a campground", "a grassy hill", "a wooden bench overlook"],
  "a farmer": ["a farm field", "a grassy hill", "a backyard", "a sunflower field"],
  "a skateboarder": ["a parking lot", "an empty basketball court", "a highway rest stop", "a driveway"],
  "a mail carrier": ["a suburban street", "a driveway", "a front porch", "a parking lot"],
};

const CAT_SETTINGS = [
  "a plain bedroom wall",
  "a sunny corner of a room",
  "a quiet kitchen",
  "a backyard",
  "a front porch",
  "a driveway",
  "a wooden bench overlook",
  "a grassy hill",
];

const DOG_SETTINGS = [
  "a grassy hill",
  "a farm field",
  "an empty beach",
  "a backyard",
  "a lake shore",
  "a forest trail",
  "a driveway",
  "a soccer field",
];

const FARM_ANIMAL_SETTINGS = [
  "a farm field",
  "a grassy hill",
  "a backyard",
  "a forest trail",
  "a mountain overlook",
  "a lake shore",
  "a sunflower field",
  "a wooden bench overlook",
];

const COLD_ANIMAL_SETTINGS = ["a snow field", "a highway rest stop", "a parking lot", "a farm field"];

export const ACTIONS = [
  "staring into the camera",
  "holding a flower",
  "sleeping",
  "running",
  "smiling",
  "looking confused",
  "watching the sunset",
  "eating grass",
  "wearing sunglasses",
  "standing in the rain",
  "sitting quietly",
  "jumping",
  "balancing on something",
  "standing slightly too close to the camera",
  "wandering through the scene",
  "resting in the open space",
  "looking off into the distance",
];

const ANIMAL_ACTIONS = [
  "staring into the camera",
  "holding a flower",
  "sleeping",
  "running",
  "smiling",
  "looking confused",
  "watching the sunset",
  "eating grass",
  "wearing sunglasses",
  "standing in the rain",
  "sitting quietly",
  "jumping",
  "balancing on something",
  "standing slightly too close to the camera",
  "wandering through the scene",
  "resting in the open space",
  "looking off into the distance",
];

const PEOPLE_ACTIONS = [
  "staring into the camera",
  "holding a flower",
  "sleeping",
  "running",
  "smiling",
  "looking confused",
  "watching the sunset",
  "wearing sunglasses",
  "standing in the rain",
  "sitting quietly",
  "jumping",
  "balancing on something",
  "standing slightly too close to the camera",
  "wandering through the scene",
  "resting in the open space",
  "looking off into the distance",
];

const SPECIAL_ACTIONS = {
  "a cyclist": ["riding a bicycle", "standing with a bicycle", "looking confused", "watching the sunset", "wearing sunglasses"],
  "a skateboarder": ["skateboarding", "balancing on a skateboard", "standing with a skateboard", "wearing sunglasses"],
  "a surfer": ["holding a surfboard", "sitting quietly", "watching the sunset", "looking off into the distance"],
  "an angler": ["holding a fishing rod", "sitting quietly", "watching the sunset", "looking confused"],
  "a hiker": ["standing slightly too close to the camera", "watching the sunset", "resting in the open space", "looking off into the distance"],
  "a farmer": ["standing slightly too close to the camera", "holding a flower", "smiling", "looking confused"],
  "a mail carrier": ["standing slightly too close to the camera", "holding a flower", "smiling", "looking confused"],
};

export const CAMERA_STYLES = [
  "fisheye lens photo",
  "disposable camera photo",
  "early digital camera photo",
  "2006 point and shoot photo",
  "camcorder screenshot",
  "old iPhone camera roll photo",
  "cheap compact camera flash photo",
  "wide-angle phone photo",
];

export const WEATHER = [
  "clear sky",
  "light rain",
  "fog",
  "mist",
  "snowfall",
  "overcast",
  "sunset glow",
  "golden hour",
  "blue hour",
  "windy day",
];

const SNOW_WEATHER = ["snowfall", "overcast", "fog", "mist", "blue hour"];
const RAIN_WEATHER = ["light rain", "overcast", "mist"];
const OUTDOOR_WEATHER = ["clear sky", "fog", "mist", "overcast", "sunset glow", "golden hour", "blue hour", "windy day"];
const INDOOR_WEATHER = ["clear sky", "overcast", "golden hour", "blue hour"];

export const TIME_OF_DAY = [
  "early morning",
  "late morning",
  "noon",
  "afternoon",
  "golden hour",
  "sunset",
  "blue hour",
  "night",
];

export const PROPS = [
  "nothing",
  "nothing",
  "nothing",
  "nothing",
  "nothing",
  "a flower",
  "sunglasses",
  "a birthday hat",
  "a blanket",
  "a soccer ball",
  "a paper crown",
];

export const CAMERA_ANGLES = [
  "looking up from the ground",
  "looking down from above",
  "camera placed in grass",
  "camera held low and close",
  "camera held at chest height",
  "camera held by a child",
  "accidental photo",
];

export const EMOTIONS = [
  "gentle",
  "funny",
  "momentum",
  "self-worth",
  "perspective",
];

export const COPY_FORMULAS = [
  "plain opener, then deadpan truth",
  "smile/stay/remember opener, then tiny sincere payoff",
  "small weather or feeling phrase, then clear mind / no rush / learning",
  "group-chat line, then iconic/gangsta/real payoff",
  "defiant small line, then dreams to chase / hate's lame af",
  "through thick & thin, then i got you bro/sis",
];

export const REFERENCE_COPY_PAIRS = [
  ["smile twin,", "it's gangsta"],
  ["smile bro,", "u're still in it"],
  ["smile homie,", "life's awesome"],
  ["quick reminder,", "u are awesome"],
  ["stay weird sis,", "it's iconic af"],
  ["stay goofy twin,", "it's iconic af"],
  ["spread love,", "hate's lame af"],
  ["unlearn the hate bro,", "it's lame af"],
  ["unlearn the hate sis,", "it's lame af"],
  ["through thick & thin,", "i got you bro"],
  ["through thick & thin,", "i got you sis"],
  ["life update:", "we're so back"],
  ["f*ck 'em,", "got dreams to chase"],
  ["i'm weird", "but i'm real tho."],
  ["breathe deep,", "reset slowly."],
  ["smile today,", "it helps."],
  ["take it slow,", "no rush."],
  ["cold air,", "clear mind."],
  ["stay calm,", "you're learning."],
  ["remember,", "you've come far."],
  ["keep moving,", "it adds up."],
  ["quick reminders,", "enjoy christmas bro."],
  ["remember to", "f*ck their opinion."],
  ["stay real,", "stay true twin."],
  ["smile twin,", "you're alive."],
  ["smile bro,", "u are on fire."],
  ["stay weird,", "it's gangsta."],
  ["remember,", "u've come far."],
  ["stay goofy twin,", "it's iconic."],
  ["stay weird,", "it's iconic."],
  ["quick reminder,", "u are awesome."],
  ["smile homie,", "life's awesome."],
  ["still here,", "that's everything."],
  ["rough day,", "still worthy."],
  ["you're enough,", "always were."],
];

export const QUOTE_BANK = REFERENCE_COPY_PAIRS;

const SCENE_PRESETS = [
  {
    subject: "a golden retriever",
    setting: "a grassy hill",
    action: "smiling into the camera",
    camera: "fisheye lens photo",
    weather: "clear sky",
    timeOfDay: "afternoon",
    prop: "nothing",
    cameraAngle: "looking up from the ground",
    emotion: "gentle",
  },
  {
    subject: "a golden retriever",
    setting: "a farm field",
    action: "carrying a flower",
    camera: "wide-angle phone photo",
    weather: "blue hour",
    timeOfDay: "blue hour",
    prop: "a flower",
    cameraAngle: "camera held low and close",
    emotion: "funny",
  },
  {
    subject: "a cow",
    setting: "a farm field",
    action: "standing slightly too close to the camera",
    camera: "fisheye lens photo",
    weather: "clear sky",
    timeOfDay: "noon",
    prop: "nothing",
    cameraAngle: "looking up from the ground",
    emotion: "funny",
  },
  {
    subject: "a highland cow",
    setting: "a grassy hill",
    action: "smiling with a confused goofy face",
    camera: "2006 point and shoot photo",
    weather: "overcast",
    timeOfDay: "late morning",
    prop: "nothing",
    cameraAngle: "camera held low and close",
    emotion: "self-worth",
  },
  {
    subject: "an orange cat",
    setting: "a sunny corner of a room",
    action: "sitting in sunlight with a happy squint",
    camera: "old iPhone camera roll photo",
    weather: "golden hour",
    timeOfDay: "golden hour",
    prop: "nothing",
    cameraAngle: "camera held low and close",
    emotion: "gentle",
  },
  {
    subject: "a black cat",
    setting: "a plain bedroom wall",
    action: "looking confused but oddly proud",
    camera: "early digital camera photo",
    weather: "overcast",
    timeOfDay: "afternoon",
    prop: "nothing",
    cameraAngle: "camera held at chest height",
    emotion: "funny",
  },
  {
    subject: "a little kid",
    setting: "an empty beach",
    action: "smiling while looking out at the ocean",
    camera: "disposable camera photo",
    weather: "overcast",
    timeOfDay: "late morning",
    prop: "nothing",
    cameraAngle: "camera held by a child",
    emotion: "momentum",
  },
  {
    subject: "an old man",
    setting: "a parking lot",
    action: "skateboarding",
    camera: "2006 point and shoot photo",
    weather: "clear sky",
    timeOfDay: "golden hour",
    prop: "nothing",
    cameraAngle: "camera held low and close",
    emotion: "funny",
  },
  {
    subject: "a polar bear",
    setting: "a snow field",
    action: "standing slightly too close to the camera with a goofy happy face",
    camera: "early digital camera photo",
    weather: "snowfall",
    timeOfDay: "blue hour",
    prop: "nothing",
    cameraAngle: "camera held low and close",
    emotion: "funny",
  },
  {
    subject: "a person in a winter coat",
    setting: "a snow field",
    action: "smiling while walking through snow",
    camera: "old iPhone camera roll photo",
    weather: "snowfall",
    timeOfDay: "late morning",
    prop: "sunglasses",
    cameraAngle: "camera held at chest height",
    emotion: "perspective",
  },
  {
    subject: "a surfer",
    setting: "an empty beach",
    action: "sitting calmly and smiling a little",
    camera: "disposable camera photo",
    weather: "overcast",
    timeOfDay: "late morning",
    prop: "nothing",
    cameraAngle: "camera held at chest height",
    emotion: "self-worth",
  },
  {
    subject: "a grandma",
    setting: "a front porch",
    action: "smiling",
    camera: "cheap compact camera flash photo",
    weather: "clear sky",
    timeOfDay: "afternoon",
    prop: "nothing",
    cameraAngle: "camera held low and close",
    emotion: "gentle",
  },
];

function pick(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

function sceneContext(brief) {
  return `${brief.subject} ${brief.setting} ${brief.action} ${brief.weather} ${brief.prop}`.toLowerCase();
}

function settingMatchesPool(setting, pool) {
  const s = setting.toLowerCase();
  return pool.some((candidate) => s === candidate.toLowerCase());
}

/** Keep `setting` as the single source of truth for WHERE; action is pose/behavior only. */
function reconcileActionAndSetting(brief, rng = Math.random) {
  const out = { ...brief };
  if (out.conceptId || out.source === "archetype" || out.source === "director") {
    return out;
  }

  const action = out.action.toLowerCase();

  for (const hint of ACTION_SETTING_HINTS) {
    if (!hint.pattern.test(action)) continue;
    if (!settingMatchesPool(out.setting, hint.settings)) {
      out.setting = pick(hint.settings, rng);
    }
    break;
  }

  return out;
}

function splitPersonSubject(subject) {
  const ethnicityMatch = String(subject).match(/\(([^)]+)\)\s*$/);
  const ethnicity = ethnicityMatch ? ethnicityMatch[1] : null;
  let base = String(subject).replace(/\s*\([^)]+\)\s*$/, "").trim();
  for (const role of PERSON_ROLES) {
    if (base.toLowerCase().includes(role)) {
      base = base.replace(new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "");
    }
  }
  return { base: base.replace(/\s+/g, " ").trim(), ethnicity };
}

function assignCoherentWardrobe(brief, rng = Math.random) {
  if (brief.subjectKind !== "person") return brief;
  const out = { ...brief };
  if (subjectIsMultiPerson(out.subject)) return out;
  const { base, ethnicity } = splitPersonSubject(out.subject);
  const ctx = sceneContext(out);
  const alreadyStyled =
    /\b(in a|in an|in oversized|in thrifted|in cheap|in red|in blue|in loose|in vintage|in sunglasses|wearing|holding)\b/i.test(
      base
    );
  if (alreadyStyled && !/cockpit|fighter jet/.test(ctx)) return out;
  let wardrobe = null;

  if (/cockpit|fighter jet|flight suit/.test(ctx)) {
    wardrobe = "in a flight suit";
  } else if (/fireworks|sparkler|clear night/.test(ctx) && /basketball/.test(ctx)) {
    wardrobe = pick(
      [
        "with a colorful blanket draped over the shoulders and loose sweatpants",
        "in a loose tank top and light sweatpants with a blanket draped around the shoulders",
      ],
      rng
    );
  } else if (/fireworks|sparkler|clear night/.test(ctx)) {
    wardrobe = pick(
      ["with a cozy blanket draped around the shoulders", "in an oversized hoodie", "in casual night-out clothes"],
      rng
    );
  } else if (/basketball/.test(ctx)) {
    wardrobe = pick(["in a cropped tank top and sweatpants", "in vintage athletic wear", "in a loose jersey and shorts"], rng);
  } else if (/beach|ocean|lake|dock|ferry|canoe/.test(ctx)) {
    wardrobe = pick(["in a linen shirt and rolled-up jeans", "in a sun-faded t-shirt and shorts", "barefoot in casual summer clothes"], rng);
  } else if (/snow|winter|snowfall/.test(ctx)) {
    wardrobe = pick(["in a puffy winter coat", "in a wool scarf and warm jacket"], rng);
  } else if (/rain/.test(ctx)) {
    wardrobe = "in a rain jacket";
  } else if (/bike|cycl/.test(ctx)) {
    wardrobe = "wearing a bike helmet and casual riding clothes";
  } else if (/skateboard|skating|roller skates|ramp/.test(ctx)) {
    wardrobe = pick(["in casual streetwear", "in a vintage track jacket", "in an oversized thrifted tee"], rng);
  } else if (/soccer/.test(ctx)) {
    wardrobe = "in a soccer jersey";
  } else if (/rest stop|grocery|road/.test(ctx)) {
    wardrobe = pick(["holding a grocery bag", "in a simple travel hoodie", "in everyday road-trip clothes"], rng);
  } else if (/bedroom|gaming|headphones|desk/.test(ctx)) {
    wardrobe = pick(["wearing oversized headphones", "in a cozy hoodie at a messy desk"], rng);
  } else if (/laundromat|kitchen|porch/.test(ctx)) {
    wardrobe = pick(["in everyday casual clothes", "in a simple oversized tee"], rng);
  } else {
    wardrobe = pick(
      ["in everyday casual clothes", "in a simple vintage tee", "in relaxed weekend clothes", null],
      rng
    );
  }

  const person = wardrobe ? `${base} ${wardrobe}` : base;
  out.subject = ethnicity ? `${person} (${ethnicity})` : person;
  return out;
}

function reconcileProps(brief, rng = Math.random) {
  const out = { ...brief };
  const ctx = sceneContext(out);

  if (/blanket/.test(out.subject) && out.prop === "a blanket") out.prop = "nothing";
  if (/sunglasses/.test(out.subject) && out.prop === "sunglasses") out.prop = "nothing";
  if (/grocery bag/.test(out.subject)) out.prop = "nothing";
  if (/skateboard/.test(out.subject)) out.prop = "nothing";
  if (/headphones/.test(out.subject)) out.prop = "nothing";

  if (out.prop === "sunglasses" && /night|fireworks|snow|rain|indoor|bedroom|laundromat/.test(ctx)) {
    out.prop = "nothing";
  }
  if (out.prop === "a birthday hat" && !/party|fireworks|celebration/.test(ctx)) {
    out.prop = "nothing";
  }
  if (out.prop === "a soccer ball" && !/soccer|field|school/.test(ctx)) {
    out.prop = "nothing";
  }
  if (out.prop !== "nothing" && rng() < 0.55) {
    out.prop = "nothing";
  }

  return out;
}

export function buildCreativeBrief(rng = Math.random) {
  const subjectKind = rng() < 0.52 ? "animal" : "person";
  const subject =
    subjectKind === "animal"
      ? `a ${pick(ANIMAL_IDEAS, rng)}`
      : `${pick(PERSON_AGES, rng)} (${pick(PERSON_ETHNICITIES, rng)})`;
  const action = pick(WILD_ACTIONS, rng);
  const setting = pick(MOODBOARD_SETTINGS, rng);
  const weather = pick(POSITIVE_WEATHER, rng);
  const camera = pick(CAMERA_TEXTURES, rng);
  const composition = pick(COMPOSITION_IDEAS, rng);
  const colorDirection = pick(COLOR_DIRECTIONS, rng);
  const prop = pick(PROPS, rng);
  const emotion = pick(EMOTIONS, rng);
  const copyFormula = pick(COPY_FORMULAS, rng);

  return harmonizeCreativeBrief(
    {
    subjectKind,
    subject,
    setting,
    action,
    camera,
    weather,
    timeOfDay: weather,
    prop,
    cameraAngle: composition,
    emotion,
    copyFormula,
    composition,
    colorDirection,
    },
    rng
  );
}

function harmonizeCreativeBrief(brief, rng = Math.random) {
  const out = { ...brief };
  const subject = out.subject.toLowerCase();
  const setting = out.setting.toLowerCase();
  const action = out.action.toLowerCase();

  if (/polar bear|penguin|seal/.test(subject)) {
    out.setting = pick(COLD_SETTINGS, rng);
    out.weather = pick(["gentle snowfall with a happy subject", "bright white winter light", "blue hour with a hopeful glow"], rng);
    out.timeOfDay = out.weather;
    out.colorDirection = "bright white negative space with black-text-friendly contrast";
  }

  if (/cat|hamster|ferret|guinea pig|hedgehog/.test(subject) && rng() < 0.35) {
    out.setting = pick(INDOOR_SETTINGS, rng);
    out.composition = pick(WALL_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
    out.weather = pick(["warm golden hour", "sun peeking through clouds", "bright midday sun"], rng);
    out.timeOfDay = out.weather;
    out.colorDirection = pick(["golden sunlight and soft shadows", "bright white negative space with black-text-friendly contrast"], rng);
  }

  if (/headphones|soda bottle|paw/.test(action)) {
    out.setting = pick(DESK_SETTINGS, rng);
    out.composition = pick(WALL_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
    out.weather = pick(["warm golden hour", "bright white winter light", "sun peeking through clouds"], rng);
    out.timeOfDay = out.weather;
    out.colorDirection = pick(["golden sunlight and soft shadows", "bright white negative space with black-text-friendly contrast"], rng);
  }

  if (/cow|alpaca|llama|horse|goat|sheep|donkey|capybara|rabbit|duck|goose|pony/.test(subject)) {
    out.setting = pick(FIELD_SETTINGS, rng);
    out.composition = pick(SKY_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
    out.colorDirection = pick(["saturated blue sky and green grass", "golden sunlight and soft shadows", "clean early-digital blue and green color"], rng);
  }

  if (/dog|retriever|collie|samoyed|chihuahua/.test(subject)) {
    out.setting = pick([...FIELD_SETTINGS, ...BEACH_WATER_SETTINGS], rng);
    out.composition = pick(SKY_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
    out.colorDirection = pick(["saturated blue sky and green grass", "washed-out pale beach colors", "pastel sunset colors"], rng);
  }

  if (/fighter jet|cockpit/.test(`${setting} ${action}`)) {
    out.subjectKind = "person";
    out.subject = pick(["a teenage girl in a flight suit", "a woman in her 20s in a flight suit", "a little kid wearing a toy pilot helmet"], rng);
    out.setting = "inside a fighter jet cockpit with sunset sky outside";
    out.action = "smiling through the cockpit glass while the sunset fills the sky";
    out.weather = "pastel sunset";
    out.timeOfDay = "pastel sunset";
    out.composition = "subject low in the frame inside the cockpit, huge sunset sky visible above";
    out.cameraAngle = out.composition;
    out.colorDirection = "pastel sunset colors";
  }

  if (out.subjectKind === "person" && /paw|soda bottle/.test(out.action)) {
    out.action = pick(
      ["smiling into the camera", "standing way too close to the camera", "looking proud at a rest stop", "walking through warm rain and smiling"],
      rng
    );
  }

  if (out.subjectKind === "animal" && /riding through/.test(out.action)) {
    out.action = pick(["running through the light", "walking through the sunset", "standing proudly in the sunset glow"], rng);
  }

  if (out.subjectKind === "animal" && /flower/.test(out.action)) {
    out.action = pick(["standing beside a tiny flower", "smiling near a tiny flower in the grass", "looking proudly at a tiny flower nearby"], rng);
  }

  if (/ferry deck|riding|running|skateboarding/.test(`${out.setting} ${out.action}`.toLowerCase())) {
    out.composition = "subject centered low in the frame, comfortably inside the edges, open negative space above";
    out.cameraAngle = out.composition;
  }

  if (/roller skates|ramp|skateboard/.test(`${subject} ${action}`)) {
    out.setting = pick(SKATE_SETTINGS, rng);
    out.weather = pick(["clear blue sky", "warm golden hour", "bright midday sun"], rng);
    out.timeOfDay = out.weather;
    out.composition = pick(SKY_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
  }

  if (/watching distant fireworks|chasing glowing sparklers/.test(action)) {
    out.setting = pick(FIREWORKS_SETTINGS, rng);
    out.weather = "clear night with distant fireworks";
    out.timeOfDay = out.weather;
    out.colorDirection = "flash-lit subject against dark simple background";
    out.composition = "subject huge in the lower third with dark open sky and distant fireworks above";
    out.cameraAngle = out.composition;
  }

  if (/bedroom|laundromat|plain wall|kitchen/.test(out.setting.toLowerCase())) {
    out.composition = pick(WALL_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
    if (/sky|grass|snow|ocean/.test(out.colorDirection)) {
      out.colorDirection = pick(["bright white negative space with black-text-friendly contrast", "golden sunlight and soft shadows"], rng);
    }
  }

  if (/beach|ocean|lake|dock|ferry|canoe/.test(out.setting.toLowerCase())) {
    out.colorDirection = pick(["washed-out pale beach colors", "clean early-digital blue and green color", "pastel sunset colors"], rng);
  }

  if (/desert|road/.test(out.setting.toLowerCase())) {
    out.colorDirection = pick(["pastel sunset colors", "golden sunlight and soft shadows"], rng);
    out.weather = pick(["soft sunrise", "pastel sunset", "warm golden hour"], rng);
    out.timeOfDay = out.weather;
  }

  if (/snow|winter/.test(out.colorDirection) && !/snow|winter|polar bear|penguin|seal/.test(`${out.setting} ${out.subject}`.toLowerCase())) {
    out.colorDirection = pick(["saturated blue sky and green grass", "golden sunlight and soft shadows", "clean early-digital blue and green color"], rng);
  }

  return finalizeBrief(out, rng);
}

/** Wardrobe + prop + action/setting reconciliation without subject-pool overrides. */
export function finalizeBrief(brief, rng = Math.random) {
  const reconciled = reconcileActionAndSetting(brief, rng);
  const harmonized = assignCoherentWardrobe(reconciled, rng);
  return reconcileProps(harmonized, rng);
}

function subjectHasExplicitEthnicity(subject) {
  return /\b(black|south asian|east asian|latino|middle eastern|southeast asian|pacific islander|indian|desi|mixed.?race)\b/i.test(
    String(subject)
  );
}

function subjectIsMultiPerson(subject) {
  return /\b(two|three|four|five|group|friends|couple|siblings|cousins|pair|trio|both)\b|\band\b/i.test(String(subject));
}

export function buildSceneFromArchetype(rng = Math.random, archetype = pick(POSTER_ARCHETYPES, rng)) {
  let subject = pick(archetype.subjects, rng);
  if (
    archetype.subjectKind === "person" &&
    !/\([^)]+\)/.test(subject) &&
    !subjectHasExplicitEthnicity(subject) &&
    !subjectIsMultiPerson(subject)
  ) {
    subject = `${subject} (${pick(PERSON_ETHNICITIES, rng)})`;
  } else if (archetype.subjectKind === "animal" && !subject.startsWith("a ")) {
    subject = /^(a|an)\s+/i.test(subject) ? subject : `a ${subject}`;
  }

  const weather = pick(archetype.weather, rng);
  const composition = pick(archetype.compositions, rng);

  return finalizeBrief(
    {
      conceptId: archetype.id,
      vibe: archetype.vibe,
      source: "archetype",
      subjectKind: archetype.subjectKind,
      subject,
      action: archetype.action,
      setting: pick(archetype.settings, rng),
      camera: pick(archetype.cameras, rng),
      weather,
      timeOfDay: weather,
      prop: pick(archetype.props, rng),
      cameraAngle: composition,
      composition,
      colorDirection: pick(archetype.colors, rng),
      emotion: pick(archetype.emotions, rng),
      copyFormula: pick(COPY_FORMULAS, rng),
    },
    rng
  );
}

export function buildIconicEnergyScene(rng = Math.random) {
  return buildSceneFromArchetype(rng, pick(ICONIC_ENERGY_ARCHETYPES, rng));
}

export function buildHighConceptScene(rng = Math.random) {
  return buildSceneFromArchetype(rng, pick(HIGH_CONCEPT_ARCHETYPES, rng));
}

export function buildSceneFromDirector(directorScene) {
  return finalizeBrief({ ...directorScene, source: "director" });
}

export { sceneSignature, settingFamily, sceneDedupKeys, isSceneBlocked };

export function buildPromptWriterPrompt(brief) {
  const propLine = brief.prop === "nothing" ? "No required prop." : `Optional prop to include naturally: ${brief.prop}.`;
  const composition = brief.composition || brief.cameraAngle || "subject close to the lens, low camera angle, open negative space above";
  const colorDirection = brief.colorDirection || "clean early-digital blue and green color";
  const sceneSpecific = sceneSpecificPromptNotes(brief);

  return `Write one image-generation prompt for a square Instagram lock-screen poster background.

You are not generating the image. You are writing the final prompt that will be sent to an image model.

The final image must feel like:
- a real forgotten camera-roll photo, not AI art
- early internet nostalgia: awkward, funny, slightly blown out, imperfect
- ugly-pretty and iconic because it feels found, not because it feels polished
- happy, positive, and slightly goofy in a believable way
- the situation may be surreal or staged, but every clothing item, prop, and setting detail must make visual sense together
- grainy early-2000s digital photography with enough resolution to look good

Core ingredients for this one unique image:
VIBE: ${brief.vibe || brief.emotion}
SUBJECT: ${brief.subject}
ACTION (pose/behavior only — no location words): ${brief.action}
SETTING (the only location — do not invent a second place): ${brief.setting}
WEATHER / LIGHT: ${brief.weather}
CAMERA TEXTURE: ${brief.camera}
COMPOSITION: ${composition}
COLOR: ${colorDirection}
${propLine}
${sceneSpecific}

Hard requirements:
- no text, no letters, no typography, no logo, no watermark
- do not include any poster quote inside the image
- the subject must look happy, goofy, peaceful, proud, or like it is making the most of the moment
- if the scene has fog, snow, rain, night, or unusual weather, the subject is still visibly happy and positive
- the subject must sit in the lower third or lower half with 60-85% clean negative space above it
- the subject should feel close to camera but not centered like a portrait; roughly 25-45% of image height is usually enough
- keep the subject's face and body comfortably inside the frame; do not crop the face at the edge
- keep the upper half extremely simple for later text: sky, blank wall, fog, snow, ocean, ceiling, or simple color field
- use natural light only unless the camera style is flash
- avoid corporate motivation, fantasy painting, 3D render, studio portrait, glossy ad, cinematic movie still, editorial fashion shoot, shallow-depth product photography, or lifestyle stock photo
- avoid clutter and avoid multiple competing subjects; if the scene is messy, keep the mess low in frame and leave the upper half clean
- avoid sickly green/yellow/cyan color casts; prefer natural early-digital blues, greens, warm sunlight, clean whites, or pastel sunset
- for people: clothing and accessories must fit the setting (no bike helmets unless cycling/skating, no life jackets away from water, no random safety gear)
- absurd animal behavior is allowed when it looks like a real internet snapshot: headphones, soda bottle, rude little paw pose, sunglasses, gaming desk, or prop comedy can be great
- if an animal uses a human-like prop or pose, make it look like a real internet meme photo, cheap edit, costume, forced perspective, or lucky candid snapshot, not glossy CGI
- prioritize aesthetic coherence over random joke props; the image should feel like something someone would save because it looks accidentally cool
- if any ingredients feel contradictory, reinterpret them into one coherent happy scene while preserving the core subject, action, and vibe

Style discipline:
- write the prompt as a direct photo brief, not poetic marketing copy
- use words like snapshot, cheap flash, fisheye, blown-out sky, heavy sensor noise, soft blur, dust, JPEG artifact, accidental framing
- make the nostalgia texture obvious: visible grain, compression, imperfect focus, old-camera color, slightly ugly digital softness
- do not use words like cinematic, premium, elegant, luxurious, editorial, professional, dreamy portrait, masterpiece, film still, or commercial
- avoid over-explaining emotions; describe the visible expression and the weird little camera-roll detail

Great outcome examples in spirit:
- a happy dog huge in the foreground on a blue-sky hill
- a smiling cow close to a fisheye lens in a field
- an orange cat wearing huge headphones at a messy gaming desk, drinking from a soda bottle
- a cat giving attitude with one paw raised in a blurry bedroom photo
- a kid in a life jacket looking at bright ocean water
- an old man skateboarding in a sunlit parking lot
- a grandma on roller skates jumping a tiny ramp
- a smiling skydiver in a sunset sky, shot like an old action-camera upload
- a flash-lit cool stranger on an empty subway platform, accidental album-cover energy
- someone in formalwear jumping off a diving board at a public pool
- friends dancing badly in a parking lot under cheap flash
- a girl in a fighter jet cockpit with sunset sky outside
- an elderly man skateboarding on a sunlit road with a vintage car behind him
- a fluffy cat with daisies on its head sitting on a wooden bench under a huge blue sky

Return only the final image prompt as plain text.`;
}

function sceneSpecificPromptNotes(brief) {
  const id = String(brief.conceptId || "");
  const notes = [];

  if (id === "skydiver-sunset-grin") {
    notes.push(
      "FREEFALL FRAMING: show the subject's face, torso, and both arms clearly, not an extreme selfie crop. Keep the subject in the lower third with the sunset sky dominating the frame and tiny earth far below. The face should be joyful and readable, but the body should not fill the whole image."
    );
  }

  if (id === "diving-board-suit") {
    notes.push(
      "POOL JUMP EXECUTION: the person must be visibly airborne above pool water, with both feet off the diving board. Include a hint of the diving board behind or below them so the action reads instantly. Do not show them crouching, sitting, standing still, or merely posing beside the pool."
    );
  }

  if (id === "roommates-couch-laugh") {
    notes.push(
      "COUCH CHAOS CONTROL: keep only one clear group of friends and one odd low-frame detail. The wall above them should stay mostly blank; do not fill the room with many objects, pets, posters, or competing focal points."
    );
  }

  if (/beach-race|empty-beach|boat|ocean|lake|ferry/.test(id)) {
    notes.push(
      "NOSTALGIA TEXTURE: make this feel like an old vacation photo upload: disposable-camera grain, slightly washed colors, mild motion blur, blown highlights, and JPEG softness. Avoid a clean modern travel photo."
    );
  }

  if (brief.subjectKind === "animal") {
    notes.push(
      "ANIMAL MEME ENERGY: keep the animal as the unmistakable hero, low in frame, with a funny expression or posture that feels like a real found internet photo. Avoid glossy wildlife photography."
    );
  }

  return notes.length ? `\nScene-specific direction:\n- ${notes.join("\n- ")}\n` : "";
}

export function cleanGeneratedPrompt(text) {
  return String(text || "")
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isIndoorSetting(setting) {
  return /bedroom|room|kitchen|laundromat/.test(setting);
}

function weatherForScene({ setting, action }, rng) {
  if (/rain/.test(action)) return pick(RAIN_WEATHER, rng);
  if (/snow/.test(setting)) return pick(SNOW_WEATHER, rng);
  if (isIndoorSetting(setting)) return pick(INDOOR_WEATHER, rng);
  return pick(OUTDOOR_WEATHER, rng);
}

function settingsForSubject(subject) {
  if (SPECIAL_SETTINGS[subject]) return SPECIAL_SETTINGS[subject];
  if (PEOPLE_SUBJECTS.has(subject)) return PEOPLE_SETTINGS;
  if (CAT_SUBJECTS.has(subject)) return CAT_SETTINGS;
  if (DOG_SUBJECTS.has(subject)) return DOG_SETTINGS;
  if (FARM_ANIMAL_SUBJECTS.has(subject)) return FARM_ANIMAL_SETTINGS;
  if (COLD_ANIMAL_SUBJECTS.has(subject)) return COLD_ANIMAL_SETTINGS;
  return SETTINGS;
}

function propsForSubject(subject) {
  const mostlyNothing = ["nothing", "nothing", "nothing", "nothing", "nothing", "a flower", "sunglasses"];
  if (PEOPLE_SUBJECTS.has(subject)) return [...mostlyNothing, "a birthday hat", "a blanket", "a soccer ball", "a paper crown"];
  if (CAT_SUBJECTS.has(subject)) return [...mostlyNothing, "a paper crown"];
  if (DOG_SUBJECTS.has(subject)) return [...mostlyNothing, "a soccer ball"];
  if (COLD_ANIMAL_SUBJECTS.has(subject)) return ["nothing", "nothing", "nothing", "sunglasses"];
  return mostlyNothing;
}

function timeForWeather(weather, rng) {
  if (weather === "sunset glow") return "sunset";
  if (weather === "golden hour") return "golden hour";
  if (weather === "blue hour") return "blue hour";
  return pick(TIME_OF_DAY, rng);
}

function actionsForSubject(subject) {
  if (SPECIAL_ACTIONS[subject]) return SPECIAL_ACTIONS[subject];
  if (PEOPLE_SUBJECTS.has(subject)) return PEOPLE_ACTIONS;
  return ANIMAL_ACTIONS;
}

export function buildScene(rng = Math.random, { avoidSignatures = new Set() } = {}) {
  for (let tries = 0; tries < 30; tries++) {
    const roll = rng();
    let scene;
    if (roll < 0.55) {
      scene = buildSceneFromArchetype(rng);
    } else if (roll < 0.9) {
      scene = buildCreativeBrief(rng);
    } else {
      const preset = pick(SCENE_PRESETS, rng);
      scene = harmonizeCreativeBrief(
        {
          subjectKind: PEOPLE_SUBJECTS.has(preset.subject) ? "person" : "animal",
          composition: preset.cameraAngle,
          colorDirection: pick(COLOR_DIRECTIONS, rng),
          ...preset,
          copyFormula: pick(COPY_FORMULAS, rng),
        },
        rng
      );
    }
    if (!isSceneBlocked(scene, avoidSignatures)) return scene;
  }
  return buildSceneFromArchetype(rng);
}

export function buildMotivationalPrompt(scene = buildScene()) {
  const propLine = scene.prop === "nothing" ? "No obvious prop." : `Include ${scene.prop} in a natural, unforced way.`;
  const badWeatherLine = /rain|snow|fog|mist|overcast|blue hour/.test(`${scene.weather} ${scene.timeOfDay}`)
    ? "Even though the weather is imperfect, the subject should look happy, positive, wholesome, and like it is making the most of the moment."
    : "The subject should look happy, positive, wholesome, and full of gentle goofy energy.";

  return `Create a square reference-style poster background that feels like a real forgotten photo from someone's camera roll.

IMPORTANT:
Do not add any text, lettering, caption, logo, watermark, or typography. Text will be added later.
Leave clean open negative space where poster text can float above the subject.

SCENE:
${scene.subject}, ${scene.action}, in ${scene.setting}.
${propLine}
${badWeatherLine}

ATMOSPHERE:
${scene.weather}.
${scene.timeOfDay}.
Emotional direction: ${scene.emotion}.

CAMERA:
Raw ${scene.camera}.
Angle: ${scene.cameraAngle}.

STYLE:
Raw early-2000s digital photography, like an old uploaded camera-roll image.
Visible sensor noise, JPEG texture, dust, soft blur, slight lens distortion.
Blown-out highlights or crushed shadows are okay if the image still reads clearly.
Natural lighting only unless it is a cheap flash snapshot.
No studio lighting, no commercial polish, no editorial fashion, no cinematic movie-still look.
Authentic, imperfect, funny, and accidentally beautiful.
High-quality square image with grainy early-digital texture, not low-resolution.

COMPOSITION:
Square 1:1 image.
Large negative space, 60-85% of the frame.
Subject positioned low in frame, lower third or lower half.
Subject should feel close to camera while leaving a huge clean upper field for text.
Subject should be the obvious focal point, not tiny or distant.
Simple composition.
Wide-angle or fisheye lens feeling.
Low camera angle.
Natural candid framing.
The subject should feel happy, wholesome, slightly goofy, and unintentionally beautiful.
The upper half should stay visually simple: sky, blank wall, fog, snow, ocean, or clean empty space.

FINAL LOOK:
Calm, hopeful, playful, gentle.
Life is weird but things are okay.
Early internet nostalgia.
Aesthetically cool and photographically believable.
Every outfit and prop should make sense in the scene.
Soft emotional impact.
Something someone would save because it feels oddly iconic, not because it is polished.
`;
}

export function captionSignature(caption) {
  return `${normalizeCaptionLine(caption?.smallText || "", MAX_SMALL_TEXT_LENGTH)}|${normalizeCaptionLine(caption?.bigText || "", MAX_BIG_TEXT_LENGTH)}`;
}

let approvedCaptionExamplesCache = null;

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function readApprovedCaptionExamples() {
  if (approvedCaptionExamplesCache) return approvedCaptionExamplesCache;

  try {
    const rows = parseCsvRows(readFileSync(APPROVED_CAPTION_EXAMPLES_CSV, "utf8"));
    const headers = rows[0] || [];
    const index = Object.fromEntries(headers.map((header, i) => [header, i]));

    approvedCaptionExamplesCache = rows.slice(1)
      .map((row) => {
        const path = row[index.path] || "";
        const smallText = normalizeCaptionLine(row[index.line_1] || "", MAX_SMALL_TEXT_LENGTH);
        const bigText = normalizeCaptionLine(row[index.line_2] || "", MAX_BIG_TEXT_LENGTH);
        return {
          path,
          text: normalizeCaptionLine(row[index.text] || `${smallText} ${bigText}`, MAX_SMALL_TEXT_LENGTH + MAX_BIG_TEXT_LENGTH + 1),
          smallText,
          bigText,
          isPosterGenerated: /(^|\/)poster_/i.test(path),
          source: row[index.source] || "approved-csv",
        };
      })
      .filter((example) => example.smallText && example.bigText);
  } catch {
    approvedCaptionExamplesCache = REFERENCE_COPY_PAIRS.map(([smallText, bigText]) => ({
      path: "fallback",
      text: `${smallText} ${bigText}`,
      smallText: normalizeCaptionLine(smallText, MAX_SMALL_TEXT_LENGTH),
      bigText: normalizeCaptionLine(bigText, MAX_BIG_TEXT_LENGTH),
      isPosterGenerated: false,
      source: "fallback",
    }));
  }

  return approvedCaptionExamplesCache;
}

export function loadApprovedCaptionExamples({ includePosterImages = false } = {}) {
  return readApprovedCaptionExamples().filter((example) =>
    includePosterImages ? true : !example.isPosterGenerated
  );
}

function approvedCaptionExamplesForPrompt() {
  const seen = new Set();
  return loadApprovedCaptionExamples()
    .filter((example) => {
      const key = captionSignature(example);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 120)
    .map((example) => `- "${example.smallText}" / "${example.bigText}"`)
    .join("\n");
}

function formatRecentCaptionsForPrompt(recentCaptions) {
  if (!recentCaptions.length) return "";
  return `\nAlready used in recent drafts — do not repeat or lightly remix these:\n${recentCaptions
    .map((caption) => `- "${caption.smallText} ${caption.bigText}"`)
    .join("\n")}\n`;
}

function captionMoodLane(scene) {
  const emotion = scene?.emotion || scene?.vibe || "goofy";
  const lanes = {
    gentle: "gentle, calm, loyal, quietly hopeful",
    funny: "goofy, iconic, unserious, group-chat confident",
    momentum: "defiant, moving forward, still in it",
    "self-worth": "warm, loyal, lightly affirming",
    perspective: "clear-headed, grateful, no-drama",
  };
  return lanes[emotion] || String(emotion);
}

export function buildCaptionPrompt(scene, {
  recentCaptions = [],
  attempt = 0,
  count = DEFAULT_CAPTION_OPTION_COUNT,
  hasImage = false,
} = {}) {
  const retryNote =
    attempt > 0
      ? "\nPrevious output was repeated, invalid, or off-tone. Keep the same taste library, but produce five fresh options.\n"
      : "";

  return `Write ${count} candidate two-line messages for a square Glance background image.

${hasImage ? "Use the attached background image only for broad emotional temperature." : "No image is attached in this call, so use only the mood lane below."} Do not personalize the message to the literal scene. Do not mention the subject, action, setting, season, weather, clothing, object, sport, animal, pose, or location. Translate the image only into an approved-message feeling like "stay goofy", "stay weird", "stay cold", "stay fresh", "it's iconic", "it's goated", "clear mind", or "we're so back".

This is a new message generator. Treat the approved examples below as the taste library. Match what they do:
- most options should look like a near-neighbor of the CSV examples, not like newly invented caption writing
- use tiny two-line internet-poster copy, not a polished quote
- lowercase, casual, human, a little imperfect
- friend voice: warm, sincere, defiant, funny, loyal, or gently reflective
- simple phrase architecture: opener/framing line, then tiny payoff
- prefer proven openers: stay, smile, remember, quick reminder, daily reminder, life update, keep, take it slow, breathe deep, spread love, heads up
- prefer proven payoffs: it's iconic, it's goated, it's gangsta, life's awesome, you're alive, no rush, clear mind, we're so back, hate's lame af, it gets better
- slang is good when it feels native to the examples: bro, twin, homie, sis, u, ur, im, af, fr, goated, gangsta, tho
- punctuation can be loose; commas/colons are common, but punctuation-free approved shapes are allowed

Do not do the stuff the rejected generated poster messages tended to do:
- no "no chill mode", "laughing through the chaos", "suit up", "slide down", "making winter ours", "cool fit", "like a boss", "good times rolling", or "rough day, still worthy"
- no "hey you", "look at you", "captain floof", "night owl", "big heart energy", "chill vibes", "making magic quietly", or image-specific nicknames
- no literal animal/place/outfit/weather captions
- no therapist voice, brand voice, corporate motivation, hustle language, or self-care jargon
- no "main character", "lowkey", "believe in yourself", "you got this", "so proud of you", "killing it", or "crushing it"
- no food metaphors, hashtags, emojis, question marks, exclamation marks, or em dashes
- no long paragraph sentence unless it resembles the few longer reflective approved examples

Line rules:
- smallText: usually 1-5 words, maximum ${MAX_SMALL_TEXT_LENGTH} characters
- bigText: usually 2-6 words, maximum ${MAX_BIG_TEXT_LENGTH} characters
- lowercase only
- return five meaningfully different options, but all five must feel like they came from the approved CSV

Mood lane only:
${captionMoodLane(scene)}
${formatRecentCaptionsForPrompt(recentCaptions)}${retryNote}
Approved examples from the CSV, excluding every poster_ image:
${approvedCaptionExamplesForPrompt()}

Return only JSON in this exact shape:
{"options":[{"smallText":"first line","bigText":"second line"},{"smallText":"first line","bigText":"second line"},{"smallText":"first line","bigText":"second line"},{"smallText":"first line","bigText":"second line"},{"smallText":"first line","bigText":"second line"}]}`;
}

const BANNED_CAPTION_PHRASES = [
  /even like that/i,
  /believe in yourself/i,
  /one day at a time/i,
  /main character/i,
  /wrong animal/i,
  /wrong place/i,
  /this is absurd/i,
  /salt air/i,
  /night court/i,
  /shoreline/i,
  /goofy king/i,
  /soft heart/i,
  /strong soul/i,
  /heart open/i,
  /^hey\b/i,
  /\bhey (you|legend|champ|twin|sis|bro|homie|night owl)\b/i,
  /banana/i,
  /bananas/i,
  /snack/i,
  /nailing it/i,
  /looks good/i,
  /on your side/i,
  /look easy/i,
  /making chaos/i,
  /\bchaos\b/i,
  /making magic/i,
  /no chill mode/i,
  /laughing through/i,
  /suit up/i,
  /slide down/i,
  /good times rolling/i,
  /making winter/i,
  /cool fit/i,
  /\bfit\b/i,
  /sledding/i,
  /like a boss/i,
  /\bboss\b/i,
  /rough day/i,
  /still worthy/i,
  /listen up/i,
  /pause here/i,
  /just so you know/i,
  /just wanted to/i,
  /friendly reminder/i,
  /so proud of you/i,
  /killing it/i,
  /crushing it/i,
  /great job/i,
  /awesome job/i,
  /well done/i,
  /hang in there/i,
  /you matter/i,
  /you deserve/i,
  /you got this/i,
  /stay strong/i,
  /believe in/i,
  /\?{2,}/,
  /!{3,}/,
  /quiet moments/i,
  /gentle moments/i,
  /in this moment/i,
  /you're enough today/i,
  /you are enough today/i,
  /enough today/i,
  /worthy today/i,
  /be kind to yourself/i,
  /hold space/i,
  /self-care/i,
  /mindful/i,
  /mindfulness/i,
  /\blowkey\b/i,
  /\bvibes?\b/i,
  /captain floof/i,
  /night owl/i,
  /hey legend/i,
  /hey champ/i,
  /real snack/i,
  /party-hat/i,
];

const IMAGE_DESC_WORDS =
  /\b(cat|cats|dog|dogs|cow|cows|bird|birds|floof|pup|pups|kitten|kitty|bunny|rabbit|horse|bear|swan|duck|goose|alpaca|llama|goat|sheep|donkey|capybara|penguin|seal|otter|frog|parrot|cockatoo|turtle|hedgehog|ferret|pony|hamster|retriever|chihuahua|tabby|siamese|animal|owl|waves|ocean|beach|campsite|skateboard|snow|snowy|winter|sled|sledding|suit|tie|hill|mountain|field|parking|sunset|sunrise|flowers|camera|music)\b/i;

const APPROVED_TONE_OPENERS = [
  /^(stay|smile|remember|keep|take|breathe|spread|unlearn|enjoy|choose|ignore|trust|hold|love|be)\b/i,
  /^quick reminder\b/i,
  /^daily reminder\b/i,
  /^daily reminder:/i,
  /^life update:/i,
  /^heads up\b/i,
  /^through thick/i,
  /^f\*ck 'em/i,
  /^we stay/i,
  /^i'?m weird/i,
  /^a weirdo/i,
  /^cold air/i,
  /^soft days/i,
  /^no time/i,
  /^haters hate/i,
  /^the world/i,
  /^still here/i,
  /^go outside/i,
  /^go out/i,
  /^smell the flowers/i,
];

const APPROVED_TONE_PAYOFFS = [
  /\bit'?s (iconic|goated|gangsta|cool af|magic|a flex|powerful)\b/i,
  /\b(life'?s awesome|life'?s beautiful|life gets better|it gets better|gets better)\b/i,
  /\b(you'?re alive|u'?re still in it|u are awesome|u woke up|you woke up|u are on fire)\b/i,
  /\b(no rush|clear mind|reset slowly|we'?re so back|hate'?s lame|stay true|stay real|forever twin|forever homie)\b/i,
  /\b(f\* their opinion|dreams to chase|things twin|things homie|enjoy ur life|enjoy life)\b/i,
];

const APPROVED_SLANG_WORDS =
  /\b(bro|twin|homie|sis|u|ur|im|tho|af|fr|goated|gangsta|gng)\b/i;

const LITERAL_SCENE_ALLOWLIST = new Set([
  "awesome", "better", "breathe", "bright", "clear", "cold", "cool", "dream",
  "dreams", "fire", "fresh", "funny", "gentle", "goated", "goofy", "grateful",
  "happy", "hard", "iconic", "kind", "life", "love", "magic", "real", "soft",
  "stay", "strong", "true", "weird",
]);

const VAGUE_SMALL_OPENERS = [
  /^quiet\b/i,
  /^gentle\b/i,
  /^peaceful\b/i,
  /^calm\b/i,
  /^sweet\b/i,
  /^dear\b/i,
  /^in this\b/i,
  /^take a\b/i,
  /^little\b/i,
  /^just\b/i,
  /\bmoments,/i,
  /\bmoment,/i,
  /^lowkey/i,
];

const AFFIRMATION_TODAY =
  /(you're|you are|u are|u're) (enough|worthy|loved|valid|ok|fine|doing ok) today/i;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sceneLiteralWords(scene) {
  if (!scene || typeof scene !== "object") return [];
  const raw = [
    scene.subject,
    scene.action,
    scene.setting,
    scene.weather,
    scene.timeOfDay,
    scene.prop,
    scene.camera,
    scene.cameraAngle,
  ].filter(Boolean).join(" ");
  const words = raw
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) || [];
  return [...new Set(words.map((word) => word.replace(/'s$/, "")))].filter((word) =>
    !LITERAL_SCENE_ALLOWLIST.has(word)
  );
}

function captionUsesSceneLiteralWords({ smallText, bigText }, scene) {
  const text = `${smallText} ${bigText}`.toLowerCase();
  return sceneLiteralWords(scene).some((word) =>
    new RegExp(`\\b${escapeRegex(word)}s?\\b`, "i").test(text)
  );
}

function looksLikeApprovedTone({ smallText, bigText }) {
  const text = `${smallText} ${bigText}`;
  const opener = APPROVED_TONE_OPENERS.some((pattern) => pattern.test(smallText));
  const payoff = APPROVED_TONE_PAYOFFS.some((pattern) => pattern.test(bigText) || pattern.test(text));
  const slang = APPROVED_SLANG_WORDS.test(text);
  const csvExact = loadApprovedCaptionExamples().some((example) =>
    captionSignature(example) === captionSignature({ smallText, bigText })
  );
  const smallWords = smallText.split(/\s+/).filter(Boolean).length;
  const bigWords = bigText.split(/\s+/).filter(Boolean).length;
  const compact = smallWords <= 5 && bigWords <= 6;

  if (csvExact) return true;
  if (opener && (payoff || slang || compact)) return true;
  if (payoff && slang && compact) return true;
  return false;
}

function captionDescribesImage({ smallText, bigText }, scene) {
  const text = `${smallText} ${bigText}`;
  if (IMAGE_DESC_WORDS.test(text)) return true;
  if (captionUsesSceneLiteralWords({ smallText, bigText }, scene)) return true;
  if (/\b\w+\s+vibes?\b/i.test(text) && !/\b(it'?s|good|bad|main)\s+vibes?\b/i.test(text)) return true;
  if (scene?.subject) {
    const subjectNoun = scene.subject
      .replace(/\([^)]*\)/g, "")
      .replace(/^a |^an /i, "")
      .trim()
      .split(/\s+/)
      .pop();
    if (subjectNoun && subjectNoun.length > 3 && new RegExp(`\\b${escapeRegex(subjectNoun)}s?\\b`, "i").test(text)) {
      return true;
    }
  }
  return false;
}

function isOffToneCaption({ smallText, bigText }, scene) {
  const text = `${smallText} ${bigText}`;
  if (BANNED_CAPTION_PHRASES.some((pattern) => pattern.test(text))) return true;
  if (VAGUE_SMALL_OPENERS.some((pattern) => pattern.test(smallText))) return true;
  if (!hasReferenceCaptionShape({ smallText, bigText })) return true;
  if (!looksLikeApprovedTone({ smallText, bigText })) return true;
  if (AFFIRMATION_TODAY.test(bigText) || AFFIRMATION_TODAY.test(text)) return true;
  if (/\benough\b/i.test(smallText) && /\benough\b/i.test(bigText)) return true;
  if (captionDescribesImage({ smallText, bigText }, scene)) return true;
  if (smallText.length > MAX_SMALL_TEXT_LENGTH || bigText.length > MAX_BIG_TEXT_LENGTH) return true;
  if (/[A-Z]/.test(text.replace(/\*/g, ""))) return true;
  return false;
}

function hasReferenceCaptionShape({ smallText, bigText }) {
  const smallWords = smallText.split(/\s+/).filter(Boolean).length;
  const bigWords = bigText.split(/\s+/).filter(Boolean).length;
  if (smallWords > 6 || bigWords > 8) return false;
  if (/[?!]/.test(`${smallText} ${bigText}`)) return false;
  if (smallWords + bigWords > 12) return false;
  return true;
}

export function finalizeCaption(caption, recentCaptions = [], scene = null) {
  const normalized = {
    smallText: normalizeCaptionLine(caption?.smallText || "", MAX_SMALL_TEXT_LENGTH),
    bigText: normalizeCaptionLine(caption?.bigText || "", MAX_BIG_TEXT_LENGTH),
  };

  if (!normalized.smallText || !normalized.bigText) return null;
  if (normalized.smallText.length < 2 || normalized.bigText.length < 2) return null;
  if (isOffToneCaption(normalized, scene)) return null;

  const sig = captionSignature(normalized);
  const recentSigs = new Set(recentCaptions.map((c) => captionSignature(c)));
  if (recentSigs.has(sig)) return null;

  return normalized;
}

export function finalizeCaptionOptions(captions, recentCaptions = [], scene = null, { count = DEFAULT_CAPTION_OPTION_COUNT } = {}) {
  const accepted = [];

  for (const candidate of Array.isArray(captions) ? captions : []) {
    const caption = finalizeCaption(candidate, [...recentCaptions, ...accepted], scene);
    if (!caption) continue;
    accepted.push(caption);
    if (accepted.length >= count) break;
  }

  return accepted;
}

const CURATED_APPROVED_NEIGHBORS = [
  ["stay cold,", "stay fresh."],
  ["stay cold twin,", "it's iconic."],
  ["stay fresh,", "it's goated twin."],
  ["stay fresh sis,", "it's iconic."],
  ["stay goofy,", "it's iconic sis"],
  ["stay goofy twin,", "it's goated."],
  ["stay weird,", "it's iconic."],
  ["stay weird sis,", "it's gangsta."],
  ["smile twin,", "we're so back."],
  ["smile bro,", "u woke up."],
  ["quick reminder:", "you're goated."],
  ["daily reminder:", "we're so back."],
  ["life update:", "still iconic."],
  ["heads up twin,", "it gets better."],
  ["keep going bro,", "it gets better."],
  ["keep moving,", "stay steady."],
  ["take it slow,", "no rush."],
  ["breathe deep,", "reset slowly."],
  ["cold air,", "clear mind."],
  ["spread love,", "hate's lame af."],
  ["remember to", "f* their opinion."],
  ["remember twin,", "stay real."],
  ["unlearn the hate sis,", "it's lame af."],
  ["through thick & thin,", "i got you sis"],
];

function approvedFallbackPool(scene, { broad = false } = {}) {
  const approved = loadApprovedCaptionExamples().map((example) => [example.smallText, example.bigText]);
  const emotionPool = {
    gentle: [
      ["breathe deep,", "reset slowly."],
      ["take it slow,", "no rush."],
      ["stay calm,", "you're learning."],
      ["through thick & thin,", "i got you sis"],
    ],
    funny: [
      ["stay goofy,", "it's iconic sis"],
      ["stay weird sis,", "it's gangsta."],
      ["stay fresh,", "it's goated twin."],
      ["smile twin,", "it's gangsta."],
    ],
    momentum: [
      ["life update:", "we're so back."],
      ["f*ck 'em,", "got dreams to chase"],
      ["keep moving,", "it adds up."],
      ["smile bro,", "u're still in it."],
    ],
    "self-worth": [
      ["quick reminder", "u are awesome"],
      ["stay real,", "stay true twin."],
      ["remember,", "you've come far."],
      ["smile twin,", "you're alive."],
    ],
    perspective: [
      ["cold air,", "clear mind."],
      ["spread love,", "hate's lame af."],
      ["ignore the noise &", "keep going bro."],
      ["trust the pace,", "not the noise."],
    ],
  };
  const priority = [
    ...(emotionPool[scene?.emotion] || []),
    ...CURATED_APPROVED_NEIGHBORS,
  ];
  return broad ? [...priority, ...approved] : priority;
}

export function variedFallbackCaption(scene, recentCaptions = [], rng = Math.random) {
  const recentSigs = new Set(recentCaptions.map((c) => captionSignature(c)));
  const priorityPool = approvedFallbackPool(scene)
    .map(([smallText, bigText]) => captionFromPair([smallText, bigText]))
    .filter((caption) => !recentSigs.has(captionSignature(caption)))
    .filter((caption) => finalizeCaption(caption, recentCaptions, scene));

  if (priorityPool.length) return pick(priorityPool, rng);

  const broadPool = approvedFallbackPool(scene, { broad: true })
    .map(([smallText, bigText]) => captionFromPair([smallText, bigText]))
    .filter((caption) => !recentSigs.has(captionSignature(caption)))
    .filter((caption) => finalizeCaption(caption, recentCaptions, scene));

  if (broadPool.length) return pick(broadPool, rng);
  return captionFromPair(pick(CURATED_APPROVED_NEIGHBORS, rng));
}

export function variedFallbackCaptionOptions(scene, recentCaptions = [], count = DEFAULT_CAPTION_OPTION_COUNT, rng = Math.random) {
  const options = [];
  const avoid = [...recentCaptions];

  for (let attempt = 0; options.length < count && attempt < 100; attempt++) {
    const candidate = variedFallbackCaption(scene, avoid, rng);
    const caption = finalizeCaption(candidate, avoid, scene);
    if (!caption) continue;
    options.push(caption);
    avoid.push(caption);
  }

  return options;
}

export function completeCaptionOptions(
  captions,
  scene,
  recentCaptions = [],
  count = DEFAULT_CAPTION_OPTION_COUNT,
  { requireSeed = false } = {}
) {
  const options = finalizeCaptionOptions(captions, recentCaptions, scene, { count });
  if (requireSeed && !options.length) return [];
  if (options.length >= count) return options;

  const fallbackOptions = variedFallbackCaptionOptions(
    scene,
    [...recentCaptions, ...options],
    count - options.length
  );
  return [...options, ...fallbackOptions].slice(0, count);
}

function captionFromPair([smallText, bigText]) {
  return { smallText, bigText };
}

function parseJsonCandidate(cleaned) {
  const candidates = [cleaned];
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(cleaned.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function optionFromUnknown(value) {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 2) {
    return { smallText: value[0], bigText: value[1] };
  }

  if (typeof value === "string") {
    const [smallText, bigText] = value.split(/\s+\/\s+|\s+\|\s+|\n/);
    if (smallText && bigText) return { smallText, bigText };
    return null;
  }

  if (typeof value === "object") {
    const smallText = value.smallText ?? value.small_text ?? value.line_1 ?? value.line1 ?? value.small;
    const bigText = value.bigText ?? value.big_text ?? value.line_2 ?? value.line2 ?? value.big;
    if (typeof smallText === "string" && typeof bigText === "string") {
      return { smallText, bigText };
    }
  }

  return null;
}

export function parseCaptionOptions(text) {
  const cleaned = String(text || "").trim();
  const parsed = parseJsonCandidate(cleaned);

  if (parsed) {
    const rawOptions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.options)
        ? parsed.options
        : Array.isArray(parsed.captions)
          ? parsed.captions
          : Array.isArray(parsed.messages)
            ? parsed.messages
            : [parsed];
    return rawOptions
      .map(optionFromUnknown)
      .filter(Boolean)
      .map((option) => ({
        smallText: normalizeCaptionLine(option.smallText, MAX_SMALL_TEXT_LENGTH),
        bigText: normalizeCaptionLine(option.bigText, MAX_BIG_TEXT_LENGTH),
      }));
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^["'\s-]+|["'\s]+$/g, "").trim())
    .filter(Boolean);
  const options = [];
  for (const line of lines) {
    const option = optionFromUnknown(line);
    if (option) options.push(option);
  }
  if (options.length) {
    return options.map((option) => ({
      smallText: normalizeCaptionLine(option.smallText, MAX_SMALL_TEXT_LENGTH),
      bigText: normalizeCaptionLine(option.bigText, MAX_BIG_TEXT_LENGTH),
    }));
  }

  return [];
}

function normalizeCaptionLine(line, maxLength) {
  return String(line)
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[—–]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const DEFAULT_CAPTION_LAYOUT = {
  xRatio: 0.5,
  yRatio: 0.3,
  textColor: null,
  fontScale: 1,
};

export const DEFAULT_MEDIUM_CAPTION_LAYOUT = {
  ...DEFAULT_CAPTION_LAYOUT,
  yRatio: 0.26,
  cropXRatio: 0.5,
  cropYRatio: 0.5,
};

export function normalizeCaptionLayout(layout = {}) {
  const xRatio = Number(layout.xRatio);
  const yRatio = Number(layout.yRatio);
  const fontScale = Number(layout.fontScale);
  const textColor = layout.textColor === "#ffffff" || layout.textColor === "#050505" ? layout.textColor : null;
  return {
    xRatio: Number.isFinite(xRatio) ? Math.min(0.92, Math.max(0.08, xRatio)) : DEFAULT_CAPTION_LAYOUT.xRatio,
    yRatio: Number.isFinite(yRatio) ? Math.min(0.88, Math.max(0.08, yRatio)) : DEFAULT_CAPTION_LAYOUT.yRatio,
    textColor,
    fontScale: Number.isFinite(fontScale) ? Math.min(1.45, Math.max(0.7, fontScale)) : DEFAULT_CAPTION_LAYOUT.fontScale,
  };
}

export function normalizeMediumCaptionLayout(layout = {}, fallback = DEFAULT_MEDIUM_CAPTION_LAYOUT) {
  const normalizedText = normalizeCaptionLayout({ ...fallback, ...layout });
  const cropXRatio = Number(layout.cropXRatio);
  const cropYRatio = Number(layout.cropYRatio);
  return {
    ...normalizedText,
    cropXRatio: Number.isFinite(cropXRatio) ? Math.min(1, Math.max(0, cropXRatio)) : DEFAULT_MEDIUM_CAPTION_LAYOUT.cropXRatio,
    cropYRatio: Number.isFinite(cropYRatio) ? Math.min(1, Math.max(0, cropYRatio)) : DEFAULT_MEDIUM_CAPTION_LAYOUT.cropYRatio,
  };
}

export function captionFontSizes(width, caption, fontScale = 1) {
  const maxTextWidth = width * 0.66;
  return {
    smallSize: fitTextSize(caption.smallText, Math.round(width * CAPTION_SMALL_FONT_RATIO * fontScale), maxTextWidth),
    bigSize: fitTextSize(caption.bigText, Math.round(width * CAPTION_BIG_FONT_RATIO * fontScale), maxTextWidth),
  };
}

export async function overlayCaption(imageBytes, caption, layout = {}) {
  const normalizedLayout = normalizeCaptionLayout(layout);
  const { basePng, width, height } = await squareBaseImage(imageBytes);
  return overlayCaptionOnFrame(basePng, width, height, caption, normalizedLayout);
}

export async function overlayMediumCaption(imageBytes, caption, layout = {}) {
  const normalizedLayout = normalizeMediumCaptionLayout(layout);
  const { basePng, width: baseSize } = await squareBaseImage(imageBytes);
  const scale = Math.max(MEDIUM_WIDGET_WIDTH / baseSize, MEDIUM_WIDGET_HEIGHT / baseSize);
  const scaledSize = Math.ceil(baseSize * scale);
  const overflowX = Math.max(0, scaledSize - MEDIUM_WIDGET_WIDTH);
  const overflowY = Math.max(0, scaledSize - MEDIUM_WIDGET_HEIGHT);
  const left = Math.min(overflowX, Math.max(0, Math.round(overflowX * normalizedLayout.cropXRatio)));
  const top = Math.min(overflowY, Math.max(0, Math.round(overflowY * normalizedLayout.cropYRatio)));
  const mediumBase = await sharp(basePng)
    .resize(scaledSize, scaledSize, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .extract({ left, top, width: MEDIUM_WIDGET_WIDTH, height: MEDIUM_WIDGET_HEIGHT })
    .png()
    .toBuffer();

  return overlayCaptionOnFrame(
    mediumBase,
    MEDIUM_WIDGET_WIDTH,
    MEDIUM_WIDGET_HEIGHT,
    caption,
    normalizedLayout
  );
}

async function squareBaseImage(imageBytes) {
  const metadata = await sharp(imageBytes).metadata();
  const baseSize = Math.min(metadata.width || 1024, metadata.height || 1024);
  const image = sharp(imageBytes)
    .resize(baseSize, baseSize, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 1.06, brightness: 1.01 })
    .sharpen({ sigma: 0.35, m1: 0.4, m2: 0.2 });
  const width = baseSize;
  const height = baseSize;
  return {
    basePng: await image.png().toBuffer(),
    width,
    height,
  };
}

async function overlayCaptionOnFrame(basePng, width, height, caption, normalizedLayout) {
  const { smallSize, bigSize } = captionFontSizes(width, caption, normalizedLayout.fontScale);
  const x = Math.round(width * normalizedLayout.xRatio);
  const yTop = Math.round(height * normalizedLayout.yRatio);
  const lineGap = Math.round(bigSize * CAPTION_LINE_GAP_RATIO);
  // Sharp/librsvg ignores dominant-baseline:hanging — use alphabetic baseline + ascent
  // so baked text matches the dashboard editor (yRatio = top of small line).
  const SMALL_ASCENT = 0.88;
  const BIG_ASCENT = 0.88;
  const ySmall = yTop + Math.round(smallSize * SMALL_ASCENT);
  const yBig = yTop + smallSize + lineGap + Math.round(bigSize * BIG_ASCENT);
  const textColor =
    normalizedLayout.textColor ?? (await pickTextColor(basePng, width, height, x, yTop + Math.round(smallSize * 0.5)));

  const svg = Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: Arial, Helvetica, sans-serif;
      text-anchor: middle;
      fill: ${textColor};
    }
    .small { font-size: ${smallSize}px; font-weight: 800; letter-spacing: 0; }
    .big { font-size: ${bigSize}px; font-weight: 800; letter-spacing: 0; }
  </style>
  <text class="small" x="${x}" y="${ySmall}">${escapeXml(caption.smallText)}</text>
  <text class="big" x="${x}" y="${yBig}">${escapeXml(caption.bigText)}</text>
</svg>`);

  const composited = await sharp(basePng).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
  return addFilmGrain(composited, width, height);
}

function fitTextSize(text, targetSize, maxWidth) {
  const length = Math.max(1, String(text).length);
  const estimatedWidth = length * targetSize * 0.56;
  if (estimatedWidth <= maxWidth) return targetSize;
  return Math.max(Math.round(maxWidth * 0.036), Math.floor(targetSize * (maxWidth / estimatedWidth)));
}

async function pickTextColor(imageBytes, width, height, x, y) {
  const sampleWidth = Math.round(width * 0.7);
  const sampleHeight = Math.round(height * 0.18);
  const left = Math.max(0, Math.round(x - sampleWidth / 2));
  const top = Math.max(0, Math.round(y - sampleHeight * 0.65));
  const region = await sharp(imageBytes)
    .extract({
      left,
      top,
      width: Math.min(sampleWidth, width - left),
      height: Math.min(sampleHeight, height - top),
    })
    .resize(1, 1)
    .raw()
    .toBuffer();
  const [r = 255, g = 255, b = 255] = region;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const blueDominant = b > r * 1.12 && b > g * 0.9;
  if (blueDominant && saturation > 0.22 && luminance < 0.64) return "#ffffff";
  return luminance < 0.46 ? "#ffffff" : "#050505";
}

async function addFilmGrain(imageBytes, width, height) {
  const grain = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const value = Math.floor(112 + Math.random() * 64);
    const offset = i * 4;
    grain[offset] = value;
    grain[offset + 1] = value;
    grain[offset + 2] = value;
    grain[offset + 3] = 12;
  }

  return sharp(imageBytes)
    .composite([
      {
        input: grain,
        raw: { width, height, channels: 4 },
        blend: "overlay",
      },
    ])
    .png()
    .toBuffer();
}

export function makeBackgroundName(index, date = new Date()) {
  const stamp = date.toISOString().replace(/\D/g, "").slice(0, 14);
  return `background_${stamp}_${String(index).padStart(3, "0")}`;
}

export async function saveGeneratedAsset({ outputDir, backgroundDir, metaDir, name, imageBytes, rawImageBytes, prompt, metadata }) {
  const imgDir = outputDir;
  const bgDir = backgroundDir ?? outputDir;
  const mdDir = metaDir ?? outputDir;

  await mkdir(imgDir, { recursive: true });
  if (rawImageBytes) await mkdir(bgDir, { recursive: true });
  await mkdir(mdDir, { recursive: true });

  const imagePath = join(imgDir, `${name}.png`);
  const rawImagePath = rawImageBytes ? join(bgDir, `${name}.png`) : null;
  const promptPath = join(mdDir, `${name}.txt`);
  const metadataPath = join(mdDir, `${name}.json`);

  await writeFile(imagePath, imageBytes);
  if (rawImageBytes && rawImagePath) await writeFile(rawImagePath, rawImageBytes);
  await writeFile(promptPath, prompt);
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        filename: `${name}.png`,
        prompt,
        ...metadata,
      },
      null,
      2
    )
  );

  return { imagePath, rawImagePath, promptPath, metadataPath };
}

export async function savePromptAsset({ outputDir, name, prompt, metadata }) {
  await mkdir(outputDir, { recursive: true });
  const promptPath = join(outputDir, `${name}.image-prompt.txt`);
  const metadataPath = join(outputDir, `${name}.json`);

  await writeFile(promptPath, prompt);
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        filename: `${name}.image-prompt.txt`,
        prompt,
        ...metadata,
      },
      null,
      2
    )
  );

  return { promptPath, metadataPath };
}
