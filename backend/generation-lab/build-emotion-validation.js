import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const directory=fileURLToPath(new URL('../content/generation-lab',import.meta.url));
const round=process.argv[2]||'emotion-transfer-009';
const cases=[
  {
    slug:'donkey-trust',referenceId:'a5c59ff2-b256-469d-9513-cb04e57d517f',referenceIds:['a5c59ff2-b256-469d-9513-cb04e57d517f','546c5422-5796-4f82-b19c-d7ecf6e442df','f3008948-c8b8-4325-b452-cfbbcd6938b3'],
    scene:'A scruffy little donkey presses its forehead into an older caretaker’s chest while the caretaker scratches behind its ears. Cluster them low and to the left beside one fence post; a broad pale overcast sky fills the upper half. The feeling is complete trust and uncomplicated affection.',
  },
  {
    slug:'lamb-pool-pride',referenceId:'db8c55bf-cfe8-4026-9793-09f12880b352',referenceIds:['db8c55bf-cfe8-4026-9793-09f12880b352','0acb62e2-69ee-4da7-82f2-8c3618ad117c'],
    scene:'A damp young lamb stands squarely in a shallow blue plastic paddling pool on a lawn, chin lifted as if it chose the best seat in the yard. Keep the lamb and pool in the lower third with only short grass and a plain pale fence behind. The feeling is absurd pride and summer relief.',
  },
  {
    slug:'parking-lot-dance',referenceId:'846e953a-974c-41fd-bb7c-1349ef8bda03',referenceIds:['846e953a-974c-41fd-bb7c-1349ef8bda03','bb513263-a7a3-4bd0-8fc6-53aaecb483c4','0dbe52d9-c899-4f82-b601-d4cf992a595c'],
    scene:'An older couple in ordinary loose clothes dance badly together in an almost empty coastal parking lot, both laughing and slightly off balance. Keep them small and low in frame; a wide peach-and-blue evening sky fills most of the image. The feeling is choosing joy together.',
  },
  {
    slug:'one-raincoat',referenceId:'09f67f69-29b2-4691-8efe-9b04a42b36a9',referenceIds:['09f67f69-29b2-4691-8efe-9b04a42b36a9','0dbe52d9-c899-4f82-b601-d4cf992a595c'],
    scene:'Two adult sisters squeeze shoulder to shoulder under one oversized raincoat while crossing an empty wet road in heavy rain, laughing because neither is staying dry. Place them in the lower right; grey rain and empty road form a large simple field around them. The feeling is loyalty and shared trouble.',
  },
  {
    slug:'tiny-sandwich-pride',referenceId:'7d72bd96-a49c-4d4a-b0d0-1f05a3de9a0c',referenceIds:['7d72bd96-a49c-4d4a-b0d0-1f05a3de9a0c','b363ae9a-0e44-40c5-84e1-e888022e7cca'],
    scene:'A small child wearing enormous adult gardening gloves proudly offers the camera a comically tiny sandwich from a plain kitchen table. Keep the child and table low in frame against a broad faded blue wall with one light switch. The feeling is serious competence and family amusement.',
  },
  {
    slug:'grandpa-nails',referenceId:'21cc71c1-b328-46e6-8685-92685e12da5e',referenceIds:['21cc71c1-b328-46e6-8685-92685e12da5e','bc7a8272-4734-44a8-b4ed-c6d45bef0d2e'],
    scene:'An elderly man in pajamas sits on the edge of a bed concentrating as he carefully paints a little child’s fingernails; the child watches his hand with total trust. Keep both figures in the lower half with a rumpled plain bedspread and bare warm wall above. The feeling is quiet devotion.',
  },
  {
    slug:'sleeping-dog-person',referenceId:'d5bd3fe2-bc91-415a-a5e9-af0f3c787051',referenceIds:['d5bd3fe2-bc91-415a-a5e9-af0f3c787051','c771f130-2436-4084-8a8a-d1629584c69b'],
    scene:'A tiny old dog has fallen asleep sitting upright against one large sofa cushion, head tipped sideways and a plain blanket tucked loosely over its belly like a tired relative. Place the dog low and to one side; the single broad cushion fills the rest of the image. The feeling is tenderness and familiar comfort.',
  },
  {
    slug:'cats-under-blanket',referenceId:'c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c',referenceIds:['c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c','d5bd3fe2-bc91-415a-a5e9-af0f3c787051'],
    scene:'Two house cats press cheek to cheek while peeking over the same rumpled blanket, one alert and one half asleep. Shoot close with a cheap compact-camera flash. Keep their heads together in the lower third while the plain dark blanket fills most of the frame. The feeling is inseparable companionship.',
  },
  {
    slug:'friend-pile',referenceId:'684c0db5-b21f-4a76-a396-4cf8cfc0abee',referenceIds:['684c0db5-b21f-4a76-a396-4cf8cfc0abee','74d0f352-f91c-4d73-ab58-45e2d9a5f158'],
    scene:'Four adult friends collapse into a laughing shoulder-to-shoulder pile at the bottom of the frame after someone tries to fit everyone into one flash photograph. Keep their overlapping faces and hands low; the upper half falls to uninterrupted night. The feeling is being completely at home with your people.',
  },
  {
    slug:'dance-floor-fries',referenceId:'74d0f352-f91c-4d73-ab58-45e2d9a5f158',referenceIds:['74d0f352-f91c-4d73-ab58-45e2d9a5f158','684c0db5-b21f-4a76-a396-4cf8cfc0abee'],
    scene:'Two adult friends in rumpled formal clothes sit barefoot on an empty dance floor after a party, leaning against each other and sharing french fries from one plain paper tray. Cluster them in the lower right under blunt flash; darkness and a plain wall fill the rest. The feeling is the friendship that remains after the big moment.',
  },
];

const runs=cases.flatMap(value=>[
  {referenceId:value.referenceId,referenceIds:[value.referenceId],recipeId:'bank-text-v6',model:'gpt-image-2.5-flare',quality:'medium',phase:'validation',scene:value.scene,requestId:`${round}-${value.slug}-text`},
  {referenceId:value.referenceId,referenceIds:value.referenceIds,recipeId:'bank-reference-v6',model:'gpt-image-2.5-flare',quality:'medium',phase:'validation',scene:value.scene,requestId:`${round}-${value.slug}-ref`},
]);
const path=join(directory,`${round}.json`);
await writeFile(path,`${JSON.stringify({round,runs},null,2)}\n`);
console.log(path);
