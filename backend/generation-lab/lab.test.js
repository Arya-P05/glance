import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,atomicJSON,summarize,wilson} from './store.js';
import {Lab,hash,render} from './core.js';
import {createLabServer} from './server.js';
const ref={id:'11111111-1111-1111-1111-111111111111',number:11,family:'outdoor-candid',file:'ref.jpg',sha256:hash(Buffer.from('reference'))};
const input={referenceId:ref.id,recipeId:'summer-text-v1',model:'gpt-image-1.5',quality:'medium',phase:'calibration',scene:'A man tries a skateboard beside an ordinary parked car.',requestId:'test-request-001',round:'test'};
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'glance-lab-'));t.after(()=>rm(directory,{recursive:true,force:true}));const store=await new Store(directory).init();store.references=[ref];await atomicJSON(join(directory,'references.json'),[ref]);await writeFile(join(directory,'references','ref.jpg'),'reference');return store;}
async function finished(lab){for(let i=0;i<100&&lab.active;i++)await new Promise(r=>setTimeout(r,10));assert.equal(lab.active,0);}
test('text and reference arms use identical prompts/settings; image bytes only go to reference arm',async()=>{
 const calls=[];const client={images:{generate:async v=>(calls.push(['generate',v]),{data:[{b64_json:'cGlj'}],usage:{total_tokens:10}}),edit:async v=>(calls.push(['edit',v]),{data:[{b64_json:'cGlj'}]})}};
 const base={model:'gpt-image-1.5',prompt:'same prompt',quality:'medium',size:'1024x1024'};
 await render(client,{...base,mode:'text'});await render(client,{...base,mode:'reference'},[Buffer.from('ref')]);
 assert.equal(calls[0][1].prompt,calls[1][1].prompt);assert.equal(calls[0][1].image,undefined);assert.equal(calls[1][1].input_fidelity,'high');assert.equal(await calls[1][1].image[0].text(),'ref');
 await render(client,{...base,model:'gpt-image-2',mode:'reference'},[Buffer.from('ref')]);assert.equal(calls[2][1].input_fidelity,undefined);
});
test('reference runs accept a bounded ordered set of bank images',async t=>{
 const store=await setup(t);const second={...ref,id:'22222222-2222-2222-2222-222222222222',number:12,file:'ref-2.jpg'};store.references.push(second);await writeFile(join(store.directory,'references','ref-2.jpg'),'reference');
 let names=[];const lab=new Lab(store,{images:{edit:async({image})=>{names=image.map(file=>file.name);return {data:[{b64_json:'cGlj'}]};}}});
 const run=await lab.submit({...input,referenceIds:[ref.id,second.id],recipeId:'summer-reference-v1'});await finished(lab);
 assert.equal(run.status,'ready');assert.deepEqual(run.referenceNumbers,[11,12]);assert.deepEqual(names,['reference-1.jpg','reference-2.jpg']);
 await assert.rejects(lab.submit({...input,requestId:'too-many-refs',referenceIds:[ref.id,second.id,ref.id]}),/distinct references/);
});
test('targeted retries preserve valid parent lineage',async t=>{
 const store=await setup(t);const lab=new Lab(store,{images:{generate:async()=>({data:[{b64_json:'cGlj'}]})}});const parentRunId='33333333-3333-4333-8333-333333333333';
 const run=await lab.submit({...input,requestId:'lineage-request-001',parentRunId});await finished(lab);assert.equal(run.parentRunId,parentRunId);
 await assert.rejects(lab.submit({...input,requestId:'lineage-request-002',parentRunId:'not-a-run'}),/Parent run ID/);
});
test('concurrent repeated requests dispatch once and persist exact recipe and bytes',async t=>{
 const store=await setup(t);let calls=0;const lab=new Lab(store,{images:{generate:async()=>{calls++;await new Promise(r=>setTimeout(r,20));return {data:[{b64_json:Buffer.from('image').toString('base64')}],_request_id:'provider-id'};}}});
 const [a,b]=await Promise.all([lab.submit(input),lab.submit(input)]);assert.equal(a.id,b.id);await finished(lab);assert.equal(calls,1);assert.equal(a.status,'ready');assert.equal(a.providerRequestId,'provider-id');assert.equal(await readFile(join(store.directory,'runs',`${a.id}.png`),'utf8'),'image');
 await assert.rejects(lab.submit({...input,scene:'A different scene with different subject matter.'}),/another experiment/);
});
test('provider failure stays recorded and never automatically retries; restart marks unknown attempts interrupted',async t=>{
 const store=await setup(t);let calls=0;const lab=new Lab(store,{images:{generate:async()=>{calls++;throw new Error('provider timeout');}}});const run=await lab.submit(input);await finished(lab);assert.equal(run.status,'failed');await lab.submit(input);assert.equal(calls,1);
 run.status='generating';await store.save(run);const recovered=await new Store(store.directory).init();assert.equal(recovered.runs.get(run.id).status,'interrupted');assert.match(recovered.runs.get(run.id).error,/not automatically retried/);
});
test('tampered reference fails before provider dispatch',async t=>{
 const store=await setup(t);await writeFile(join(store.directory,'references','ref.jpg'),'changed');let called=false;
 const lab=new Lab(store,{images:{edit:async()=>{called=true;}}});const run=await lab.submit({...input,recipeId:'summer-reference-v1'});await finished(lab);assert.equal(called,false);assert.equal(run.status,'failed');assert.match(run.error,/snapshot changed/);
});
test('metrics separate actors, versions and phases; failures remain in observed yield',()=>{
 const base={recipeId:'r',recipeHash:'h',model:'m',quality:'medium',phase:'development',family:'f'};
 const runs=[{...base,id:'a',status:'ready'},{...base,id:'b',status:'failed'},{...base,id:'c',status:'ready'},{...base,id:'d',phase:'calibration',status:'ready'}];
 const reviews=[{actor:'model',runId:'a',verdict:'pass'},{actor:'human',runId:'a',verdict:'fail'},{actor:'human',runId:'a',verdict:'pass'},{actor:'human',runId:'c',verdict:'unsure'}];
 const g=summarize(runs,reviews,'human')[0];assert.equal(g.attempts,3);assert.equal(g.reviewed,1);assert.equal(g.passed,1);assert.equal(g.unreviewed,1);assert.equal(g.observedYield,1/3);assert.equal(summarize(runs,reviews,'assistant')[0].reviewed,0);assert.ok(wilson(19,20).low<.95);
});
test('HTTP rejects foreign origins, serves state and persists human review across reload',async t=>{
 const store=await setup(t);let promotions=0;const {server}=await createLabServer({directory:store.directory,client:{images:{generate:async()=>({data:[{b64_json:'cGlj'}]})}},promote:async()=>{promotions++;return{storagePath:'drafts/backgrounds/test.png'}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(url+'/state',{headers:{Origin:'https://evil.example'}})).status,403);
 const post=async(path,v)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
 const run=await(await post('/runs',input)).json();for(let i=0;i<100;i++){const s=await(await fetch(url+'/state')).json();if(s.runs[0].status==='ready')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal((await post('/reviews',{runId:run.id,actor:'human',verdict:'pass',notes:'This fits.'})).status,201);
 const promoted=await post('/promote',{runId:run.id});assert.equal(promoted.status,201);assert.equal(promotions,1);assert.equal((await post('/promote',{runId:run.id})).status,200);assert.equal(promotions,1);
 const reloaded=await new Store(store.directory).init();assert.equal(reloaded.reviews[0].actor,'human');assert.equal(reloaded.reviews[0].notes,'This fits.');
 assert.equal(reloaded.runs.get(run.id).promotedStoragePath,'drafts/backgrounds/test.png');
});
test('production endpoint locks the validated recipe, model and reference family',async t=>{
 const store=await setup(t);const other={...ref,id:'22222222-2222-4222-8222-222222222222',number:22,family:'indoor-pets',file:'other.jpg',sha256:hash(Buffer.from('other'))};
 store.references.push(other);await atomicJSON(join(store.directory,'references.json'),store.references);await writeFile(join(store.directory,'references','other.jpg'),'other');
 const calls=[];const client={images:{generate:async value=>(calls.push(['generate',value]),{data:[{b64_json:'cGlj'}]}),edit:async value=>(calls.push(['edit',value]),{data:[{b64_json:'cGlj'}]})}};
 const {server}=await createLabServer({directory:store.directory,client});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const url=`http://127.0.0.1:${server.address().port}`;
 const post=async value=>fetch(url+'/production-runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 const scene='A friend laughs alone beneath a broad quiet sky after missing a skateboard trick.';
 const textResponse=await post({family:'outdoor-candid',useReferences:false,scene,requestId:'production-text-001'});assert.equal(textResponse.status,202);const textRun=await textResponse.json();assert.equal(textRun.recipeId,'bank-text-v6');assert.equal(textRun.model,'gpt-image-2.5-flare');assert.equal(textRun.quality,'medium');assert.equal(textRun.phase,'production');
 const referenceResponse=await post({family:'outdoor-candid',useReferences:true,referenceIds:[ref.id],quality:'high',scene,requestId:'production-reference-001'});assert.equal(referenceResponse.status,202);const referenceRun=await referenceResponse.json();assert.equal(referenceRun.recipeId,'bank-reference-v6');assert.equal(referenceRun.conditioning,'1-reference');assert.equal(referenceRun.quality,'high');
 assert.equal((await post({family:'outdoor-candid',referenceIds:[other.id],scene,requestId:'production-wrong-family-001'})).status,400);
 for(let index=0;index<100&&calls.length<2;index++)await new Promise(resolve=>setTimeout(resolve,10));assert.deepEqual(calls.map(call=>call[0]).sort(),['edit','generate']);
 const page=await fetch(url+'/production');assert.equal(page.status,200);assert.match(await page.text(),/THE PRODUCTION GENERATOR/);
 const state=await(await fetch(url+'/state')).json();assert.equal(state.production.validatedPasses,19);assert.equal(state.production.validatedTotal,20);
});
test('same prompt text with different conditioning stays in different summary groups',()=>{
 const base={recipeHash:'same',model:'m',quality:'medium',phase:'calibration',family:'f',status:'ready'};
 const result=summarize([{...base,id:'a',recipeId:'text',mode:'text'},{...base,id:'b',recipeId:'ref',mode:'reference'}],[]);
 assert.equal(result.length,2);assert.equal(result[0].attempts,1);assert.equal(result[1].attempts,1);
});
test('quota rejection stops queued paid dispatch and persists pause across restart',async t=>{
 const store=await setup(t);let calls=0;const lab=new Lab(store,{images:{generate:async()=>{calls++;await new Promise(r=>setTimeout(r,20));throw Object.assign(new Error('You have no credits remaining'),{status:429,code:'insufficient_quota'});}}},{concurrency:1});
 const one=await lab.submit(input),two=await lab.submit({...input,requestId:'test-request-002'});await finished(lab);
 assert.equal(calls,1);assert.equal(one.status,'failed');assert.equal(two.status,'blocked');assert.equal(two.startedAt,undefined);assert.ok(lab.providerBlocked);
 const reloaded=await new Store(store.directory).init();assert.ok(reloaded.control.reason);await assert.rejects(lab.submit({...input,requestId:'test-request-003'}),/paused/);
});
test('cost estimate uses recorded text and image tokens, never calls itself actual billing',async()=>{
 const {estimateCost,costSummary}=await import('./costs.js');const run={model:'gpt-image-1.5',status:'ready',usage:{input_tokens_details:{text_tokens:332,image_tokens:4354},output_tokens_details:{image_tokens:1056,text_tokens:343}}};
 assert.equal(estimateCost(run),.073714);assert.equal(costSummary([run]).billingVerified,false);assert.equal(estimateCost({...run,model:'unknown'}),null);
});
