import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInspirationIds,loadRunInspiration,runInspirationImages} from './run-inspiration.js';
import {tasteInstructions,referenceImages} from './generation-taste.js';
const id='11111111-1111-4111-8111-111111111111';
test('run selection validates IDs, caps references and rejects unavailable posts',async()=>{
 assert.deepEqual(validateInspirationIds([id,id]),[id]);
 assert.throws(()=>validateInspirationIds(['--bad']));
 assert.throws(()=>validateInspirationIds(Array(6).fill(id)));
 await assert.rejects(()=>loadRunInspiration({from:()=>({select:()=>({in:async()=>({data:[]})})})},[id],p=>p),/unavailable/);
});
test('run images override global visual examples without mutating permanent taste',async()=>{
 const db={from:()=>({select:()=>({in:async()=>({data:[{id,storage_path:'posts/one.png'}]})})})};
 const items=await loadRunInspiration(db,[id],p=>'https://example.com/'+p);
 const taste={references:[],runInspiration:items};
 assert.deepEqual(referenceImages(taste,p=>p),runInspirationImages(items));
 assert.match(tasteInstructions(taste),/shared subject/);
 assert.equal(taste.references.length,0);
 assert.equal(items[0].id,id);
});
test('reference brief extracts semantic direction and rejects incomplete analysis',async()=>{
 const {analyzeInspiration,inspirationDirectorPrompt,inspirationWriterPrompt,reviewInspirationFit}=await import('./run-inspiration.js');
 let output=JSON.stringify({summary:'Friends exploring outdoors',preserve:'Group relationships, expansive scenery, candid photography',vary:'Activities and locations',avoid:'Exact scene reconstructions'});
 const client={responses:{create:async()=>({output_text:output})}};
 const items=[{id,imageUrl:'https://example.com/image.png'}];
 const brief=await analyzeInspiration({client,model:'test',items});
 assert.match(inspirationDirectorPrompt(brief),/Friends exploring outdoors/);
 assert.match(inspirationWriterPrompt({subject:'friends'},brief),/image generator receives text only/);
 output=JSON.stringify({distinct:true,aligned:false,reason:'Solo dog loses the friendship direction'});
 assert.equal((await reviewInspirationFit({client,model:'test',items,brief,scene:{subject:'solo dog'}})).aligned,false);
 output=JSON.stringify({distinct:true,aligned:true,reason:'New group adventure'});
 assert.equal((await reviewInspirationFit({client,model:'test',items,brief,scene:{subject:'friends'}})).aligned,true);
 output=JSON.stringify({distinct:false,aligned:true,reason:'Copies exact pose and location'});
 assert.equal((await reviewInspirationFit({client,model:'test',items,brief,scene:{subject:'friends'}})).distinct,false);
 output='{}';await assert.rejects(()=>analyzeInspiration({client,model:'test',items}),/Invalid/);
 await assert.rejects(()=>reviewInspirationFit({client,model:'test',items,brief,scene:{}}),/Invalid/);
});
test('run-specific direction excludes unrelated global taste text',()=>{
 const text=tasteInstructions({references:[{subject:'UNRELATED_GLOBAL_GAG'}],runInspiration:[{id}],inspirationBrief:{summary:'Friendship and landscape'}});
 assert.ok(!text.includes('UNRELATED_GLOBAL_GAG'));
 assert.match(text,/Friendship and landscape/);
});
