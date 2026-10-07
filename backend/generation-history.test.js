import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGenerationHistory,rememberGeneration,generationHistoryInstructions} from './generation-history.js';
import {tasteInstructions} from './generation-taste.js';
test('rolling memory includes the new output once and retains exactly the latest twenty',()=>{
 const history=Array.from({length:20},(_,i)=>({name:`image-${i}`,scene:{subject:`subject-${i}`}}));
 const updated=rememberGeneration(history,{name:'new',scene:{subject:'new'}});
 assert.equal(updated.length,20);assert.equal(updated[0].name,'new');assert.equal(updated.at(-1).name,'image-18');
 assert.equal(rememberGeneration(updated,updated[0]).length,20);
});
test('memory remains avoidance context even without positive references',()=>{
 const prompt=tasteInstructions({references:[],recentGenerations:[{name:'one',scene:{subject:'mongoose at a fair'}}]});
 assert.match(prompt,/mongoose at a fair/);assert.match(prompt,/not positive inspiration/);assert.match(prompt,/rejected and unreviewed/);
 assert.equal(generationHistoryInstructions([]),'');
});
test('history loader orders newest first, bounds reads, and surfaces database failure',async()=>{
 const calls=[];const query={select:()=>query,order:(...args)=>{calls.push(args);return query;},limit:async n=>{assert.equal(n,20);return {data:[{name:'one'}]};}};
 assert.deepEqual(await loadGenerationHistory({from:name=>{assert.equal(name,'generation_history');return query;}}),[{name:'one'}]);
 assert.deepEqual(calls,[['created_at',{ascending:false}],['name',{ascending:true}]]);
 query.limit=async()=>({error:{message:'offline'}});
 await assert.rejects(()=>loadGenerationHistory({from:()=>query}),/offline/);
});
