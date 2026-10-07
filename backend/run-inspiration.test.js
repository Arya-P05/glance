import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInspirationIds,loadRunInspiration,runInspirationImages,isDistinctFromInspiration} from './run-inspiration.js';
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
 assert.match(tasteInstructions(taste),/different subject/);
 assert.equal(taste.references.length,0);
 assert.equal(items[0].id,id);
});
test('originality gate retries similar concepts, accepts distinct ones and fails on invalid output',async()=>{
 let output='{"distinct":false}';
 const client={responses:{create:async()=>({output_text:output})}};
 const args={client,model:'test',scene:{subject:'person on a coaster'},items:[{id,imageUrl:'https://example.com/image.png'}]};
 assert.equal(await isDistinctFromInspiration(args),false);
 output='{"distinct":true}';assert.equal(await isDistinctFromInspiration(args),true);
 output='{}';await assert.rejects(()=>isDistinctFromInspiration(args),/Invalid/);
 assert.equal(await isDistinctFromInspiration({...args,items:[]}),true);
});
