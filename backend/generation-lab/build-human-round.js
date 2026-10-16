import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const directory=fileURLToPath(new URL('../content/generation-lab',import.meta.url));
const round=process.argv[2]||'human-calibrated-007';
const cases=[
 {slug:'goat-fence',referenceId:'546c5422-5796-4f82-b19c-d7ecf6e442df',referenceIds:['546c5422-5796-4f82-b19c-d7ecf6e442df','5dd54816-e951-4850-a82d-fe06043b4d29','db8c55bf-cfe8-4026-9793-09f12880b352'],scene:'A friendly goat rests its chin crookedly on a weathered fence rail and looks into a nearby friend’s camera; ordinary pasture, weeds and a utility shed remain visible behind it.'},
 {slug:'bike-chain',referenceId:'846e953a-974c-41fd-bb7c-1349ef8bda03',referenceIds:['846e953a-974c-41fd-bb7c-1349ef8bda03','bb513263-a7a3-4bd0-8fc6-53aaecb483c4','8ecae7dd-cde0-41f0-821f-5072c4830bb2','0dbe52d9-c899-4f82-b601-d4cf992a595c'],scene:'Two adult friends pause beside their bicycles at an ordinary rural turnout; one sits on the curb looking at a loose bike chain while the other stands nearby eating from a small paper bag.'},
 {slug:'camping-chair',referenceId:'67fe1402-37ba-4525-b982-6e5eb1d81640',referenceIds:['67fe1402-37ba-4525-b982-6e5eb1d81640','bc7a8272-4734-44a8-b4ed-c6d45bef0d2e','b363ae9a-0e44-40c5-84e1-e888022e7cca'],scene:'An older man in plaid pajama trousers stands in a lived-in kitchen holding a half-folded camping chair, glancing sideways at a relative while deciding how it closes.'},
 {slug:'cat-chair',referenceId:'d5bd3fe2-bc91-415a-a5e9-af0f3c787051',referenceIds:['d5bd3fe2-bc91-415a-a5e9-af0f3c787051','c9aaf749-ce05-475c-bf1a-cdc4d8c0ff4c','c771f130-2436-4084-8a8a-d1629584c69b'],scene:'A large house cat sprawls along the top of a worn desk chair beside a small fan and cluttered side table, looking sleepily toward its owner’s nearby knee at the edge of frame.'},
 {slug:'porch-laugh',referenceId:'684c0db5-b21f-4a76-a396-4cf8cfc0abee',referenceIds:['684c0db5-b21f-4a76-a396-4cf8cfc0abee','74d0f352-f91c-4d73-ab58-45e2d9a5f158'],scene:'Three adult friends sit close together on a back porch after dark under blunt compact-camera flash; one has just said something funny and the others laugh naturally, with plastic chairs and the dark yard behind them.'},
];
const runs=cases.flatMap(value=>[
 {referenceId:value.referenceId,referenceIds:[value.referenceId],recipeId:'bank-text-v5',model:'gpt-image-2.5-flare',quality:'medium',phase:'development',scene:value.scene,requestId:`${round}-${value.slug}-text`},
 {referenceId:value.referenceId,referenceIds:value.referenceIds,recipeId:'bank-reference-v5',model:'gpt-image-2.5-flare',quality:'medium',phase:'development',scene:value.scene,requestId:`${round}-${value.slug}-ref`},
]);
const path=join(directory,`${round}.json`);await writeFile(path,`${JSON.stringify({round,runs},null,2)}\n`);console.log(path);
