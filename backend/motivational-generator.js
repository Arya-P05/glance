import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  POSTER_ARCHETYPES,
  isSceneBlocked,
  sceneDedupKeys,
  sceneSignature,
  settingFamily,
} from "./poster-concepts.js";

export const DEFAULT_OUTPUT_DIR = "motivational_assets";
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
  "smile twin/bro/sis/homie, then a punchy truth",
  "quick reminder, then hype or reassurance",
  "stay weird/goofy/real, then it's iconic/gangsta/valid af",
  "life update:, then we're so back / still in it",
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
  ["smile twin,", "you're alive."],
  ["smile bro,", "u are on fire."],
  ["stay weird,", "it's gangsta."],
  ["hey twin,", "proud of u."],
  ["you got this,", "lowkey twin."],
  ["keep showing up,", "it matters."],
  ["still here,", "that's everything."],
  ["rough day,", "still worthy."],
  ["take it slow,", "no rush."],
  ["keep moving,", "it adds up."],
  ["remember,", "u've come far."],
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
  const { base, ethnicity } = splitPersonSubject(out.subject);
  const ctx = sceneContext(out);
  let wardrobe = null;

  if (/cockpit|fighter jet|flight suit/.test(ctx)) {
    wardrobe = "in a flight suit";
  } else if (/fireworks|sparkler|clear night/.test(ctx) && /basketball/.test(ctx)) {
    wardrobe = pick(
      [
        "wrapped in a colorful blanket over their shoulders, wearing a casual crop top and sweatpants",
        "in a cropped tank top and light sweatpants with a blanket draped over their shoulders",
      ],
      rng
    );
  } else if (/fireworks|sparkler|clear night/.test(ctx)) {
    wardrobe = pick(
      ["wrapped in a cozy blanket over their shoulders", "in an oversized hoodie", "in casual night-out clothes"],
      rng
    );
  } else if (/basketball/.test(ctx)) {
    wardrobe = pick(["in a cropped tank top and sweatpants", "in vintage athletic wear", "in a loose jersey and shorts"], rng);
  } else if (/beach|ocean|lake|dock|ferry|canoe/.test(ctx)) {
    wardrobe = pick(["in a linen shirt and rolled-up jeans", "in a swimsuit cover-up", "barefoot in casual summer clothes"], rng);
  } else if (/snow|winter|snowfall/.test(ctx)) {
    wardrobe = pick(["in a puffy winter coat", "in a wool scarf and warm jacket"], rng);
  } else if (/rain/.test(ctx)) {
    wardrobe = "in a rain jacket";
  } else if (/bike|cycl/.test(ctx)) {
    wardrobe = "wearing a bike helmet and casual riding clothes";
  } else if (/skateboard|skating|roller skates|ramp/.test(ctx)) {
    wardrobe = pick(["in casual streetwear", "wearing a helmet and knee pads"], rng);
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
  return /\b(two|three|four|five|group|friends|couple|siblings|cousins|pair|trio|both)\b/i.test(String(subject));
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
    subject = `a ${subject}`;
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

export function buildSceneFromDirector(directorScene) {
  return finalizeBrief({ ...directorScene, source: "director" });
}

export { sceneSignature, settingFamily, sceneDedupKeys, isSceneBlocked };

export function buildPromptWriterPrompt(brief) {
  const propLine = brief.prop === "nothing" ? "No required prop." : `Optional prop to include naturally: ${brief.prop}.`;
  const composition = brief.composition || brief.cameraAngle || "subject close to the lens, low camera angle, open negative space above";
  const colorDirection = brief.colorDirection || "clean early-digital blue and green color";

  return `Write one extremely detailed image-generation prompt for a square Instagram moodboard poster background.

You are not generating the image. You are writing the final prompt that will be sent to an image model.

The final image must feel like:
- a forgotten photo from someone's camera roll
- dreamy internet nostalgia
- aesthetically cool, cinematic, and emotionally warm
- happy, positive, and slightly goofy in a believable way
- the situation may be surreal or staged, but every clothing item, prop, and setting detail must make visual sense together
- high-quality grainy early-2000s digital photography, not low-resolution

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

Hard requirements:
- no text, no letters, no typography, no logo, no watermark
- the subject must look happy, joyful, goofy, peaceful, or like it is making the most of the moment
- if the scene has fog, snow, rain, night, or unusual weather, the subject is still visibly happy and positive
- the subject must be large and close to camera, roughly 35-55% of image height
- the subject must sit low in the frame with 50-80% clean negative space above it
- keep the subject's face and body comfortably inside the frame; do not crop the face at the edge
- keep the upper half simple enough for poster text: sky, blank wall, fog, snow, ocean, ceiling, or simple color field
- use natural light only unless the camera style is flash
- avoid corporate motivation, fantasy painting, 3D render, studio portrait, glossy ad, cinematic movie still, or editorial fashion shoot
- avoid clutter and avoid multiple competing subjects
- avoid sickly green/yellow/cyan color casts; prefer natural early-digital blues, greens, warm sunlight, clean whites, or pastel sunset
- for people: clothing and accessories must fit the setting (no bike helmets unless cycling/skating, no life jackets away from water, no random safety gear)
- absurd animal behavior is allowed: headphones, soda bottle, rude little paw pose, sunglasses, gaming desk, or prop comedy can be great
- if an animal uses a human-like prop or pose, make it look like a real internet meme photo, cheap edit, costume, forced perspective, or lucky candid snapshot, not glossy CGI
- prioritize aesthetic coherence over random joke props; the image should feel like something someone would actually post because it looks cool
- if any ingredients feel contradictory, reinterpret them into one coherent happy scene while preserving the core subject, action, and vibe

Use a fresh, specific, non-template description. Add concrete visual details that make this exact image feel unique: pose, lens distortion, background shapes, color, texture, accidental framing, and why the subject feels happy.

Great outcome examples in spirit:
- a happy dog huge in the foreground on a blue-sky hill
- a smiling cow close to a fisheye lens in a field
- an orange cat wearing huge headphones at a messy gaming desk, drinking from a soda bottle
- a cat giving attitude with one paw raised in a blurry bedroom photo
- a kid in a life jacket looking at bright ocean water
- an old man skateboarding in a sunlit parking lot
- a grandma on roller skates jumping a tiny ramp
- a girl in a fighter jet cockpit with sunset sky outside
- an elderly man skateboarding on a sunlit road with a vintage car behind him
- a fluffy cat with daisies on its head sitting on a wooden bench under a huge blue sky

Return only the final image prompt as plain text.`;
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

  return `Create a square motivational poster background that feels like a forgotten photo from someone's camera roll.

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
Raw early-2000s digital photography.
Heavy film grain.
Visible sensor noise.
Slight motion blur.
Soft focus.
Overexposed highlights.
Natural lighting only.
No studio lighting.
No commercial polish.
Authentic and imperfect.
Dreamy internet nostalgia.
High-quality square image with a grainy early-digital look, not low-resolution.

COMPOSITION:
Square 1:1 image.
Large negative space, 50-80% of the frame.
Subject positioned low in frame.
Subject should be large and close to camera, occupying roughly 35-55% of the image height.
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
Dreamy internet nostalgia.
Aesthetically cool and photographically believable.
Every outfit and prop should make sense in the scene.
Soft emotional impact.
Highly shareable Instagram moodboard aesthetic.
`;
}

export function captionSignature(caption) {
  return `${normalizeCaptionLine(caption?.smallText || "", 34)}|${normalizeCaptionLine(caption?.bigText || "", 28)}`;
}

const EMOTION_CAPTION_EXAMPLES = {
  gentle: [
    ["smile homie,", "life's awesome"],
    ["take it slow,", "no rush."],
    ["through thick & thin,", "i got you bro"],
    ["you're enough,", "always were."],
  ],
  funny: [
    ["stay weird sis,", "it's iconic af"],
    ["smile twin,", "it's gangsta"],
    ["i'm weird", "but i'm real tho."],
  ],
  momentum: [
    ["f*ck 'em,", "got dreams to chase"],
    ["life update:", "we're so back"],
    ["keep showing up,", "it matters."],
  ],
  "self-worth": [
    ["quick reminder,", "u are awesome"],
    ["smile bro,", "u're still in it"],
    ["unlearn the hate bro,", "it's lame af"],
    ["you're enough,", "always were."],
  ],
  perspective: [
    ["spread love,", "hate's lame af"],
    ["remember,", "u've come far."],
    ["still here,", "that's everything."],
  ],
};

export function buildCaptionPrompt(scene, { recentCaptions = [], attempt = 0 } = {}) {
  const moodExamples = (EMOTION_CAPTION_EXAMPLES[scene.emotion] || EMOTION_CAPTION_EXAMPLES.gentle)
    .map(([smallText, bigText]) => `- "${smallText} ${bigText}"`)
    .join("\n");

  const avoidBlock =
    recentCaptions.length > 0
      ? `\nAlready used — do NOT repeat or closely imitate:\n${recentCaptions
          .map((c) => `- "${c.smallText} ${c.bigText}"`)
          .join("\n")}\n`
      : "";

  const retryNote =
    attempt > 0
      ? "\nLast attempt was repeated or off-tone. Write a fresh original quote.\n"
      : "";

  return `Write one short poster quote for a motivational moodboard.

Voice — text like a real friend, NOT a therapist or brand:
- lowercase always
- use: twin, bro, sis, homie, u, ur, u're, tho, af, lowkey
- casual internet slang is good ("it's gangsta", "iconic af", "lame af", "we're so back")
- warm, defiant, funny, sincere — group chat hype OR quiet sincere (e.g. "you're enough, always were.")
- mild edge ok (e.g. "f*ck 'em," "hate's lame af") but never cruel or mean-spirited
- NEVER: corporate speak, therapy clichés, hustle culture, "believe in yourself", "main character", explaining the photo
- NEVER: "hey you", "heads up", "you're doing great/bananas/amazing", "just wanted to say", "friendly reminder", random food metaphors, multiple ??? or !!!
- NEVER: vague wellness fragments ("quiet moments", "gentle reminder", "in this moment", "you're enough today") — both lines must connect like a real text

Structure (${scene.copyFormula}):
- smallText: 2-5 words — opener with comma or colon (e.g. "smile twin," / "life update:" / "quick reminder,")
- bigText: 2-7 words — punchy payoff (e.g. "it's gangsta" / "u are awesome" / "got dreams to chase")

Gold-standard examples (match this exact energy):
- "smile twin," / "it's gangsta"
- "quick reminder," / "u are awesome"
- "stay weird sis," / "it's iconic af"
- "spread love," / "hate's lame af"
- "through thick & thin," / "i got you bro"
- "life update:" / "we're so back"
- "f*ck 'em," / "got dreams to chase"
- "you're enough," / "always were."

Important:
- does NOT describe the image (no animals, places, outfits, weather)
- original wording only — not a famous quote
- no em dashes, no long sentences

Poster vibe: ${scene.vibe || scene.emotion}
Mood: ${scene.emotion}
${avoidBlock}${retryNote}
More examples for this mood (style only, do not copy verbatim):
${moodExamples}

Return only JSON:
{"smallText":"first line","bigText":"second line"}`;
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
  /breathe deep/i,
  /reset slowly/i,
  /heads up/i,
  /^hey you\b/i,
  /\bhey you,/i,
  /banana/i,
  /you're doing/i,
  /ur doing/i,
  /u are doing/i,
  /doing (great|good|amazing|well|fantastic|incredible|awesome)/i,
  /just wanted to/i,
  /friendly reminder/i,
  /don't forget/i,
  /so proud of you/i,
  /killing it/i,
  /crushing it/i,
  /great job/i,
  /awesome job/i,
  /well done/i,
  /hang in there/i,
  /you matter/i,
  /you deserve/i,
  /keep going/i,
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
];

const VAGUE_SMALL_OPENERS = [
  /^quiet\b/i,
  /^gentle\b/i,
  /^soft\b/i,
  /^peaceful\b/i,
  /^calm\b/i,
  /^sweet\b/i,
  /^dear\b/i,
  /^in this\b/i,
  /^take a\b/i,
  /^breathe\b/i,
  /\bmoments,/i,
  /\bmoment,/i,
];

const AFFIRMATION_TODAY =
  /(you're|you are|u are|u're) (enough|worthy|loved|valid|ok|fine|doing ok) today/i;

function isOffToneCaption({ smallText, bigText }) {
  const text = `${smallText} ${bigText}`;
  if (BANNED_CAPTION_PHRASES.some((pattern) => pattern.test(text))) return true;
  if (VAGUE_SMALL_OPENERS.some((pattern) => pattern.test(smallText))) return true;
  if (AFFIRMATION_TODAY.test(bigText) || AFFIRMATION_TODAY.test(text)) return true;
  if (/\benough\b/i.test(smallText) && /\benough\b/i.test(bigText)) return true;
  if (smallText.length > 30 || bigText.length > 34) return true;
  if (/[A-Z]/.test(text.replace(/\*/g, ""))) return true;
  return false;
}

export function finalizeCaption(caption, recentCaptions = []) {
  const normalized = {
    smallText: normalizeCaptionLine(caption?.smallText || "", 34),
    bigText: normalizeCaptionLine(caption?.bigText || "", 28),
  };

  if (!normalized.smallText || !normalized.bigText) return null;
  if (normalized.smallText.length < 2 || normalized.bigText.length < 2) return null;
  if (isOffToneCaption(normalized)) return null;

  const sig = captionSignature(normalized);
  const recentSigs = new Set(recentCaptions.map((c) => captionSignature(c)));
  if (recentSigs.has(sig)) return null;

  return normalized;
}

export function variedFallbackCaption(scene, recentCaptions = [], rng = Math.random) {
  const recentSigs = new Set(recentCaptions.map((c) => captionSignature(c)));
  const emotionPool = {
    gentle: [
      ["smile homie,", "life's awesome"],
      ["take it slow,", "no rush."],
      ["through thick & thin,", "i got you sis"],
    ],
    funny: [
      ["stay weird sis,", "it's iconic af"],
      ["smile twin,", "it's gangsta"],
      ["i'm weird", "but i'm real tho."],
    ],
    momentum: [
      ["f*ck 'em,", "got dreams to chase"],
      ["life update:", "we're so back"],
      ["keep moving,", "it adds up."],
    ],
    "self-worth": [
      ["quick reminder,", "u are awesome"],
      ["smile bro,", "u're still in it"],
      ["unlearn the hate sis,", "it's lame af"],
    ],
    perspective: [
      ["spread love,", "hate's lame af"],
      ["remember,", "u've come far."],
      ["still here,", "that's everything."],
    ],
  };

  const pool = [...(emotionPool[scene.emotion] || []), ...QUOTE_BANK].filter(
    ([smallText, bigText]) => !recentSigs.has(captionSignature({ smallText, bigText }))
  );

  if (pool.length === 0) return captionFromPair(pick(QUOTE_BANK, rng));
  return captionFromPair(pick(pool, rng));
}

export function referenceCaptionForScene(scene) {
  const subject = scene.subject;
  const weather = scene.weather;
  const action = scene.action;
  const emotion = scene.emotion;

  if (/snow|fog|mist|blue hour/.test(`${weather} ${scene.setting}`)) {
    return captionFromPair(["smile homie,", "life's awesome"]);
  }
  if (/sunglasses|skateboard|skateboarding|birthday hat/.test(`${scene.prop} ${action}`)) {
    return captionFromPair(["stay goofy twin,", "it's iconic af"]);
  }
  if (/smiling|standing slightly too close|golden retriever|cow|cat|highland cow/.test(`${action} ${subject}`)) {
    return captionFromPair(["smile twin,", "it's gangsta"]);
  }
  if (emotion === "momentum") return captionFromPair(["life update:", "we're so back"]);
  if (emotion === "self-worth") return captionFromPair(["quick reminder,", "u are awesome"]);
  if (emotion === "gentle") return captionFromPair(["through thick & thin,", "i got you bro"]);
  if (emotion === "perspective") return captionFromPair(["spread love,", "hate's lame af"]);
  return captionFromPair(["stay weird sis,", "it's iconic af"]);
}

/** @deprecated Use finalizeCaption instead — kept for older scripts */
export function coerceReferenceCaption(caption, scene, recentCaptions = []) {
  return finalizeCaption(caption, recentCaptions) ?? variedFallbackCaption(scene, recentCaptions);
}

function captionFromPair([smallText, bigText]) {
  return { smallText, bigText };
}

export function parseCaption(text) {
  const cleaned = String(text || "").trim();
  try {
    const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.smallText === "string" && typeof parsed.bigText === "string") {
      return {
        smallText: normalizeCaptionLine(parsed.smallText, 34),
        bigText: normalizeCaptionLine(parsed.bigText, 28),
      };
    }
  } catch (_) {
    // Fall through to line parsing.
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^["'\s-]+|["'\s]+$/g, "").trim())
    .filter(Boolean);
  const fallback = pick(QUOTE_BANK);
  return {
    smallText: normalizeCaptionLine(lines[0] || fallback[0], 34),
    bigText: normalizeCaptionLine(lines[1] || fallback[1], 28),
  };
}

function normalizeCaptionLine(line, maxLength) {
  return String(line)
    .trim()
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
  yRatio: 0.36,
  textColor: null,
};

export function normalizeCaptionLayout(layout = {}) {
  const xRatio = Number(layout.xRatio);
  const yRatio = Number(layout.yRatio);
  const textColor = layout.textColor === "#ffffff" || layout.textColor === "#050505" ? layout.textColor : null;
  return {
    xRatio: Number.isFinite(xRatio) ? Math.min(0.92, Math.max(0.08, xRatio)) : DEFAULT_CAPTION_LAYOUT.xRatio,
    yRatio: Number.isFinite(yRatio) ? Math.min(0.88, Math.max(0.08, yRatio)) : DEFAULT_CAPTION_LAYOUT.yRatio,
    textColor,
  };
}

export function captionFontSizes(width, caption) {
  const maxTextWidth = width * 0.76;
  return {
    smallSize: fitTextSize(caption.smallText, Math.round(width * 0.034), maxTextWidth),
    bigSize: fitTextSize(caption.bigText, Math.round(width * 0.079), maxTextWidth),
  };
}

export async function overlayCaption(imageBytes, caption, layout = {}) {
  const normalizedLayout = normalizeCaptionLayout(layout);
  const metadata = await sharp(imageBytes).metadata();
  const baseSize = Math.min(metadata.width || 1024, metadata.height || 1024);
  const image = sharp(imageBytes)
    .resize(baseSize, baseSize, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 1.06, brightness: 1.01 })
    .sharpen({ sigma: 0.35, m1: 0.4, m2: 0.2 });
  const width = baseSize;
  const height = baseSize;
  const { smallSize, bigSize } = captionFontSizes(width, caption);
  const x = Math.round(width * normalizedLayout.xRatio);
  const yTop = Math.round(height * normalizedLayout.yRatio);
  const lineGap = Math.round(bigSize * 0.02);
  // Sharp/librsvg ignores dominant-baseline:hanging — use alphabetic baseline + ascent
  // so baked text matches the dashboard editor (yRatio = top of small line).
  const SMALL_ASCENT = 0.88;
  const BIG_ASCENT = 0.88;
  const ySmall = yTop + Math.round(smallSize * SMALL_ASCENT);
  const yBig = yTop + smallSize + lineGap + Math.round(bigSize * BIG_ASCENT);
  const basePng = await image.png().toBuffer();
  const textColor =
    normalizedLayout.textColor ?? (await pickTextColor(basePng, width, height, x, yTop + Math.round(smallSize * 0.5)));

  const svg = Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: "Arial Black", Arial, Helvetica, sans-serif;
      text-anchor: middle;
      fill: ${textColor};
    }
    .small { font-size: ${smallSize}px; font-weight: 900; letter-spacing: -0.018em; }
    .big { font-size: ${bigSize}px; font-weight: 900; letter-spacing: -0.032em; }
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

export function buildLegacyPromptForMetadata(scene, caption) {
  const smallText = caption?.smallText || "";
  const bigText = caption?.bigText || "";
  return `Create a square motivational poster that feels like a forgotten photo from someone's camera roll.

SCENE:
${scene.subject}, ${scene.action}, in ${scene.setting}.

STYLE:
Raw ${scene.camera}.
Heavy film grain.
Visible sensor noise.
Slight motion blur.
Soft focus.
Overexposed highlights.
Natural lighting only.
No studio lighting.
No commercial polish.
Authentic and imperfect.
Dreamy internet nostalgia.

COMPOSITION:
Square 1:1 image.
Large negative space, 50-80% of the frame.
Subject positioned low in the frame.
Text floating in the open space above the subject.
Simple candid composition.
Low camera angle.
Wide-angle or fisheye feeling.
The subject should feel wholesome, slightly goofy, and unintentionally beautiful.

TYPOGRAPHY:
Minimal bold sans-serif.
Lowercase.
Modern grotesk font.
Text centered or slightly left-weighted in the negative space.

Small top line:
"${smallText}"

Large bold line below:
"${bigText}"

COPY FEEL:
Supportive internet friend.
Funny but sincere.
Anti-hustle.
No corporate motivation.
No LinkedIn energy.

FINAL LOOK:
Calm, hopeful, playful, gentle.
Life is weird but things are okay.
`;
}

export function makeAssetName(index, date = new Date()) {
  const stamp = date.toISOString().replace(/\D/g, "").slice(0, 14);
  return `poster_${stamp}_${String(index).padStart(3, "0")}`;
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
