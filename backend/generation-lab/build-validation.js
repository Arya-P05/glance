import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory=fileURLToPath(new URL('../content/generation-lab',import.meta.url));
const round=process.argv[2]||'unseen-validation-006';
const cases=[
  {
    slug:'alpaca-fence',referenceId:'546c5422-5796-4f82-b19c-d7ecf6e442df',
    referenceIds:['546c5422-5796-4f82-b19c-d7ecf6e442df','5dd54816-e951-4850-a82d-fe06043b4d29','db8c55bf-cfe8-4026-9793-09f12880b352','f3008948-c8b8-4325-b452-cfbbcd6938b3'],
    scene:'A small alpaca at a county-fair fence has bits of hay stuck to its muzzle and turns toward a nearby friend just after sneezing, under a flat cloudy sky.'
  },
  {
    slug:'wet-sheepdog',referenceId:'5dd54816-e951-4850-a82d-fe06043b4d29',
    referenceIds:['5dd54816-e951-4850-a82d-fe06043b4d29','546c5422-5796-4f82-b19c-d7ecf6e442df','db8c55bf-cfe8-4026-9793-09f12880b352','f3008948-c8b8-4325-b452-cfbbcd6938b3'],
    scene:'A soaked sheepdog shakes water beside a cheap blue kiddie pool in an ordinary backyard, one ear flying upward and a garden hose lying in the grass.'
  },
  {
    slug:'rabbit-laundry',referenceId:'d5bd3fe2-bc91-415a-a5e9-af0f3c787051',
    referenceIds:['d5bd3fe2-bc91-415a-a5e9-af0f3c787051','c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c','c771f130-2436-4084-8a8a-d1629584c69b','c69fdd13-95fc-44fe-84c6-f630f2df58cd'],
    scene:'A small house rabbit peers around a plastic laundry basket in a dim utility room with one plain sock fallen loosely over an ear, photographed from floor level.'
  },
  {
    slug:'parrot-lamp',referenceId:'c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c',
    referenceIds:['c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c','d5bd3fe2-bc91-415a-a5e9-af0f3c787051','c771f130-2436-4084-8a8a-d1629584c69b','c69fdd13-95fc-44fe-84c6-f630f2df58cd'],
    scene:'A sleepy green parrot balances on the edge of an old lampshade in a cluttered den while someone reaches into the edge of frame to steady the lamp.'
  },
  {
    slug:'grandmother-cake',referenceId:'67fe1402-37ba-4525-b982-6e5eb1d81640',
    referenceIds:['67fe1402-37ba-4525-b982-6e5eb1d81640','bc7a8272-4734-44a8-b4ed-c6d45bef0d2e','b363ae9a-0e44-40c5-84e1-e888022e7cca','21cc71c1-b328-46e6-8685-92685e12da5e'],
    scene:'An elderly woman in a housecoat carries a small homemade birthday cake with one badly leaning candle through a cluttered dining room, looking sideways at a family member.'
  },
  {
    slug:'box-helmet',referenceId:'7d72bd96-a49c-4d4a-b0d0-1f05a3de9a0c',
    referenceIds:['7d72bd96-a49c-4d4a-b0d0-1f05a3de9a0c','bc7a8272-4734-44a8-b4ed-c6d45bef0d2e','b363ae9a-0e44-40c5-84e1-e888022e7cca','67fe1402-37ba-4525-b982-6e5eb1d81640'],
    scene:'A child wearing a plain cardboard box as a helmet concentrates on tying one shoe in a narrow hallway while an untied lace trails across the floor.'
  },
  {
    slug:'driveway-spill',referenceId:'684c0db5-b21f-4a76-a396-4cf8cfc0abee',
    referenceIds:['684c0db5-b21f-4a76-a396-4cf8cfc0abee','74d0f352-f91c-4d73-ab58-45e2d9a5f158'],
    scene:'Three adult friends huddle in a dark driveway under direct compact-camera flash just as one accidentally tips an unmarked paper cup and the others react.'
  },
  {
    slug:'parking-lot-shoe',referenceId:'74d0f352-f91c-4d73-ab58-45e2d9a5f158',
    referenceIds:['74d0f352-f91c-4d73-ab58-45e2d9a5f158','684c0db5-b21f-4a76-a396-4cf8cfc0abee'],
    scene:'Two adult friends laugh beside an ordinary laundromat parking lot at night while one balances on a curb with a loose shoe in one hand, direct camera flash.'
  },
  {
    slug:'map-sunhat',referenceId:'846e953a-974c-41fd-bb7c-1349ef8bda03',
    referenceIds:['846e953a-974c-41fd-bb7c-1349ef8bda03','bb513263-a7a3-4bd0-8fc6-53aaecb483c4','8ecae7dd-cde0-41f0-821f-5072c4830bb2','0dbe52d9-c899-4f82-b601-d4cf992a595c'],
    scene:'An adult friend at a windy rural gas station uses a folded blank road map as a makeshift sunhat while another person reaches in to keep it from blowing away.'
  },
  {
    slug:'pedal-boat',referenceId:'0dbe52d9-c899-4f82-b601-d4cf992a595c',
    referenceIds:['0dbe52d9-c899-4f82-b601-d4cf992a595c','bb513263-a7a3-4bd0-8fc6-53aaecb483c4','846e953a-974c-41fd-bb7c-1349ef8bda03','8ecae7dd-cde0-41f0-821f-5072c4830bb2'],
    scene:'Two adult friends drag a faded pedal boat onto a muddy lakeshore, one slipping slightly while both laugh toward a friend photographing from the dock.'
  }
];
const runs=cases.flatMap(value=>[
  {referenceId:value.referenceId,referenceIds:[value.referenceId],recipeId:'bank-text-v4',model:'gpt-image-2.5-flare',quality:'medium',phase:'validation',scene:value.scene,requestId:`${round}-${value.slug}-text`},
  {referenceId:value.referenceId,referenceIds:value.referenceIds,recipeId:'bank-reference-v4',model:'gpt-image-2.5-flare',quality:'medium',phase:'validation',scene:value.scene,requestId:`${round}-${value.slug}-ref`}
]);
const path=join(directory,`${round}.json`);await writeFile(path,JSON.stringify({round,runs},null,2));console.log(path);
