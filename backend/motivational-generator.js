import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

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

const WILD_ACTIONS = [
  "smiling into the camera",
  "standing way too close to the camera",
  "jumping over a tiny ramp",
  "riding through a sunset",
  "looking out at the ocean",
  "running through a field",
  "sitting peacefully in sunlight",
  "standing proudly on something ordinary",
  "standing next to a tiny flower like it matters",
  "wearing oversized headphones at a messy computer desk",
  "sipping from a soda bottle like a tiny menace",
  "raising one paw like it has attitude",
  "leaning toward the camera with a ridiculous grin",
  "walking through warm rain and smiling",
  "making the most of a snowy day",
  "posing like it owns the place",
  "wearing sunglasses with complete confidence",
  "standing beside a weirdly parked car",
  "peeking over a fence",
  "standing under fireworks in the far background",
  "chasing glowing sparklers in a safe open field",
  "floating in a canoe on calm water",
  "standing inside a fighter jet cockpit at sunset",
  "sitting on a skateboard in an empty parking lot",
  "holding an ice cream cone on a windy day",
  "running down a grassy hill",
  "standing in a kiddie pool",
  "looking proud at a rest stop",
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
  "a field under fireworks far in the background",
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
  "clear night with distant fireworks",
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

const INDOOR_SETTINGS = [
  "a sunny bedroom corner with a plain wall",
  "a laundromat with a blank wall",
  "a front porch with blank siding behind it",
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
  "a field under fireworks far in the background",
  "a backyard with harsh afternoon sun",
];

const BEACH_WATER_SETTINGS = [
  "an empty beach with soft blue water",
  "a boat dock on a calm lake",
  "a ferry deck with ocean behind it",
  "a canoe in a quiet lake",
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
  "small phrase comma, then a bigger truth",
  "remember, then a sincere thing",
  "smile twin, then a grounded observation",
  "quick reminder:, then a reassuring truth",
  "two short punchy fragments",
];

export const REFERENCE_COPY_PAIRS = [
  ["smile twin,", "you're alive."],
  ["smile bro,", "u are on fire."],
  ["remember,", "you've come far."],
  ["keep moving,", "it adds up."],
  ["take it slow,", "no rush."],
  ["breathe deep,", "reset slowly."],
  ["stay calm,", "you're learning."],
  ["stay goofy twin,", "it's iconic."],
  ["stay weird,", "it's gangsta."],
  ["stay real,", "stay true twin."],
  ["smile today,", "it helps."],
  ["hey twin,", "proud of you."],
  ["you're enough,", "always were."],
  ["still here,", "that's everything."],
  ["small wins,", "count them."],
  ["you're loved,", "remember that."],
  ["rough day,", "still worthy."],
  ["keep showing up,", "it matters."],
  ["soft heart,", "strong soul."],
  ["head up,", "heart open."],
  ["you made it,", "through today."],
  ["breathe twin,", "you're okay."],
  ["good days,", "bad days."],
  ["still growing,", "still going."],
  ["you got this,", "lowkey twin."],
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

  if (/cat|hamster|ferret|guinea pig|hedgehog/.test(subject) && rng() < 0.72) {
    out.setting = pick(INDOOR_SETTINGS, rng);
    out.composition = pick(WALL_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
    out.weather = pick(["warm golden hour", "sun peeking through clouds", "bright midday sun"], rng);
    out.timeOfDay = out.weather;
    out.colorDirection = pick(["golden sunlight and soft shadows", "bright white negative space with black-text-friendly contrast"], rng);
  }

  if (/headphones|soda bottle|paw/.test(action)) {
    out.setting = pick(["a messy bedroom gaming desk with a blank wall above", "a cluttered desk under a plain wall", "a sunny bedroom corner with a plain wall"], rng);
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

  if (/roller skates|ramp/.test(`${subject} ${action}`)) {
    out.setting = pick(["an empty basketball court", "a parking lot at golden hour", "a school field on a sunny day"], rng);
    out.weather = pick(["clear blue sky", "warm golden hour", "bright midday sun"], rng);
    out.timeOfDay = out.weather;
    out.composition = pick(SKY_COMPOSITIONS, rng);
    out.cameraAngle = out.composition;
  }

  if (/fireworks|sparklers/.test(action)) {
    out.setting = pick(
      [
        "an empty outdoor basketball court at night with fireworks in the distance",
        "a field under fireworks far in the background",
        "a rooftop with open sky and distant fireworks",
      ],
      rng
    );
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

  const harmonized = assignCoherentWardrobe(out, rng);
  return reconcileProps(harmonized, rng);
}

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
SUBJECT: ${brief.subject}
ACTION: ${brief.action}
SETTING: ${brief.setting}
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
- a young woman on an outdoor basketball court at night, blanket over her shoulders, fireworks in the distance
- a dog joyfully running under distant fireworks in an open field

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

export function buildScene(rng = Math.random) {
  if (rng() < 0.03) {
    const preset = pick(SCENE_PRESETS, rng);
    return harmonizeCreativeBrief(
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

  if (rng() < 0.92) return buildCreativeBrief(rng);

  const subject = pick(SUBJECTS, rng);
  const setting = pick(settingsForSubject(subject), rng);
  const action = pick(actionsForSubject(subject), rng);
  const camera = pick(CAMERA_STYLES, rng);
  const weather = weatherForScene({ setting, action }, rng);
  const timeOfDay = timeForWeather(weather, rng);
  const prop = pick(propsForSubject(subject), rng);
  const cameraAngle = pick(CAMERA_ANGLES, rng);
  const emotion = pick(EMOTIONS, rng);
  const copyFormula = pick(COPY_FORMULAS, rng);

  return harmonizeCreativeBrief(
    {
      subjectKind: PEOPLE_SUBJECTS.has(subject) ? "person" : "animal",
      subject,
      setting,
      action,
      camera,
      weather,
      timeOfDay,
      prop,
      cameraAngle,
      emotion,
      copyFormula,
      composition: cameraAngle,
      colorDirection: pick(COLOR_DIRECTIONS, rng),
    },
    rng
  );
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

export function buildCaptionPrompt(scene, { recentCaptions = [], attempt = 0 } = {}) {
  const toneExamples = QUOTE_BANK.slice(0, 10)
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

  return `Write one short positive poster quote for a motivational moodboard.

Voice:
- supportive internet friend
- lowercase
- warm, uplifting, slightly funny but sincere
- sounds like a text from someone who believes in you

Structure (${scene.copyFormula}):
- smallText: 2-4 words, usually ends with a comma or colon
- bigText: 2-6 words, the uplifting punchline

Important:
- does NOT need to describe any image, animal, place, outfit, or weather
- should work as a universal feel-good line anyone would want on their lock screen
- original wording — not a famous quote, not corporate, not therapy-speak, not hustle culture
- no em dashes, no long sentences, no explaining a scene

Mood hint: ${scene.emotion}
${avoidBlock}${retryNote}
Tone examples (style only, do not copy):
${toneExamples}

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
];

export function finalizeCaption(caption, recentCaptions = []) {
  const normalized = {
    smallText: normalizeCaptionLine(caption?.smallText || "", 34),
    bigText: normalizeCaptionLine(caption?.bigText || "", 28),
  };

  if (!normalized.smallText || !normalized.bigText) return null;
  if (normalized.smallText.length < 2 || normalized.bigText.length < 2) return null;

  const text = `${normalized.smallText} ${normalized.bigText}`;
  if (BANNED_CAPTION_PHRASES.some((pattern) => pattern.test(text))) return null;

  const sig = captionSignature(normalized);
  const recentSigs = new Set(recentCaptions.map((c) => captionSignature(c)));
  if (recentSigs.has(sig)) return null;

  return normalized;
}

export function variedFallbackCaption(scene, recentCaptions = [], rng = Math.random) {
  const recentSigs = new Set(recentCaptions.map((c) => captionSignature(c)));
  const emotionPool = {
    gentle: [["take it slow,", "no rush."], ["soft day,", "stay gentle."], ["breathe twin,", "you're okay."]],
    funny: [["stay goofy twin,", "it's iconic."], ["stay weird,", "it's gangsta."], ["smile bro,", "u are on fire."]],
    momentum: [["keep moving,", "it adds up."], ["keep showing up,", "it matters."], ["still growing,", "still going."]],
    "self-worth": [["you're enough,", "always were."], ["remember,", "you've come far."], ["you're loved,", "remember that."]],
    perspective: [["head up,", "heart open."], ["look around,", "life is here."], ["good days,", "bad days."]],
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
    return captionFromPair(["cold air,", "clear mind."]);
  }
  if (/sunglasses|skateboard|skateboarding|birthday hat/.test(`${scene.prop} ${action}`)) {
    return captionFromPair(["stay goofy twin,", "it's iconic."]);
  }
  if (/smiling|standing slightly too close|golden retriever|cow|cat|highland cow/.test(`${action} ${subject}`)) {
    return captionFromPair(["smile twin,", "you're alive."]);
  }
  if (emotion === "momentum") return captionFromPair(["keep moving,", "it adds up."]);
  if (emotion === "self-worth") return captionFromPair(["remember,", "you've come far."]);
  if (emotion === "gentle") return captionFromPair(["take it slow,", "no rush."]);
  if (emotion === "perspective") return captionFromPair(["look around,", "life is here."]);
  return captionFromPair(["stay weird,", "it's gangsta."]);
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
  return {
    smallText: normalizeCaptionLine(lines[0] || "quick reminder:", 34),
    bigText: normalizeCaptionLine(lines[1] || "you're doing fine.", 28),
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

export async function overlayCaption(imageBytes, caption) {
  const metadata = await sharp(imageBytes).metadata();
  const baseSize = Math.min(metadata.width || 1024, metadata.height || 1024);
  const image = sharp(imageBytes)
    .resize(baseSize, baseSize, { fit: "cover", kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 1.06, brightness: 1.01 })
    .sharpen({ sigma: 0.35, m1: 0.4, m2: 0.2 });
  const width = baseSize;
  const height = baseSize;
  const maxTextWidth = width * 0.76;
  const smallSize = fitTextSize(caption.smallText, Math.round(width * 0.034), maxTextWidth);
  const bigSize = fitTextSize(caption.bigText, Math.round(width * 0.079), maxTextWidth);
  const y = Math.round(height * 0.245);
  const x = Math.round(width * 0.5);
  const basePng = await image.png().toBuffer();
  const textColor = await pickTextColor(basePng, width, height, x, y);

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
  <text class="small" x="${x}" y="${y}">${escapeXml(caption.smallText)}</text>
  <text class="big" x="${x}" y="${y + Math.round(bigSize * 1.02)}">${escapeXml(caption.bigText)}</text>
</svg>`);

  const composited = await sharp(basePng).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
  return addFilmGrain(composited, width, height);
}

function fitTextSize(text, targetSize, maxWidth) {
  const length = Math.max(1, String(text).length);
  const estimatedWidth = length * targetSize * 0.56;
  if (estimatedWidth <= maxWidth) return targetSize;
  return Math.max(28, Math.floor(targetSize * (maxWidth / estimatedWidth)));
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
