import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const directory=fileURLToPath(new URL('../content/generation-lab',import.meta.url));
const round=process.argv[2]||'emotion-first-008';
const cases=[
  {
    slug:'muddy-dog-throne',
    referenceId:'546c5422-5796-4f82-b19c-d7ecf6e442df',
    referenceIds:['546c5422-5796-4f82-b19c-d7ecf6e442df','f3008948-c8b8-4325-b452-cfbbcd6938b3'],
    scene:'A muddy shaggy dog sits upright and immensely pleased on a single white plastic patio chair after rain, as if it owns the yard. Photograph at eye level. Cluster the dog and chair in the lower right; behind them is only a low fence and a broad pale sky filling the top half. The feeling is ridiculous dignity and self-confidence.',
  },
  {
    slug:'roller-skate-courage',
    referenceId:'846e953a-974c-41fd-bb7c-1349ef8bda03',
    referenceIds:['846e953a-974c-41fd-bb7c-1349ef8bda03','bb513263-a7a3-4bd0-8fc6-53aaecb483c4'],
    scene:'An older woman in loose everyday clothes tries roller skates in an almost empty seaside parking lot, knees bent and arms spread, grinning at the friend taking the picture. Keep her full body small and low in frame against a huge simple blue sky occupying the top half. The feeling is freedom and being game for anything.',
  },
  {
    slug:'vacuum-helmet',
    referenceId:'67fe1402-37ba-4525-b982-6e5eb1d81640',
    referenceIds:['67fe1402-37ba-4525-b982-6e5eb1d81640','7d72bd96-a49c-4d4a-b0d0-1f05a3de9a0c'],
    scene:'An elderly woman in a plain housecoat and slippers wears an oversized motorcycle helmet while vacuuming, pausing to stare deadpan at a relative with the camera. Place her and the vacuum low and to one side against a mostly bare faded yellow wall filling over half the frame. The feeling is fearless silliness and total commitment to the bit.',
  },
  {
    slug:'box-king-cat',
    referenceId:'c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c',
    referenceIds:['c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c','c771f130-2436-4084-8a8a-d1629584c69b','d5bd3fe2-bc91-415a-a5e9-af0f3c787051'],
    scene:'A large serious house cat has squeezed into a plain cardboard box much too small for it, chest upright and paws spilling over the edge as if the fit is perfect. Put the cat and box in the lower third and shoot close with direct compact flash; a plain dim wall fills the upper half. The feeling is stubborn satisfaction.',
  },
  {
    slug:'curb-cake-friends',
    referenceId:'684c0db5-b21f-4a76-a396-4cf8cfc0abee',
    referenceIds:['684c0db5-b21f-4a76-a396-4cf8cfc0abee','74d0f352-f91c-4d73-ab58-45e2d9a5f158'],
    scene:'Three adult friends in slightly rumpled party clothes sit shoulder to shoulder on a curb at night sharing a small birthday cake directly from the plate and laughing at each other. Cluster them across the lower third under blunt close flash; the top half is almost entirely uninterrupted darkness. The feeling is belonging after the party is over.',
  },
];
const runs=cases.flatMap(value=>[
  {referenceId:value.referenceId,referenceIds:[value.referenceId],recipeId:'bank-text-v6',model:'gpt-image-2.5-flare',quality:'medium',phase:'development',scene:value.scene,requestId:`${round}-${value.slug}-text`},
  {referenceId:value.referenceId,referenceIds:value.referenceIds,recipeId:'bank-reference-v6',model:'gpt-image-2.5-flare',quality:'medium',phase:'development',scene:value.scene,requestId:`${round}-${value.slug}-ref`},
]);
const path=join(directory,`${round}.json`);
await writeFile(path,`${JSON.stringify({round,runs},null,2)}\n`);
console.log(path);
