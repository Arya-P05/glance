import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const base=process.env.GENERATION_LAB_URL||'http://127.0.0.1:3849';
const [round,evaluator='gpt-6-astra-bank-v2']=process.argv.slice(2);
if(!round)throw new Error('Pass the frozen validation round and optional evaluator ID.');
const response=await fetch(base+'/state');
if(!response.ok)throw new Error(`Could not read lab state (${response.status}).`);
const state=await response.json();
const latest=new Map();
for(const review of state.reviews)if(review.actor==='model'&&review.evaluator===evaluator)latest.set(review.runId,review);
const roots=state.runs.filter(run=>run.round===round);
if(!roots.length)throw new Error(`No runs found for ${round}.`);
const chains=roots.map(root=>{
 const attempts=state.runs.filter(run=>run.id===root.id||run.parentRunId===root.id||run.requestId.startsWith(`${root.requestId}-retry-`)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const scored=attempts.map(run=>({runId:run.id,parentRunId:run.parentRunId||null,round:run.round,status:run.status,verdict:latest.get(run.id)?.verdict||null}));
 return {rootRunId:root.id,requestId:root.requestId,family:root.family,mode:root.mode,firstPass:latest.get(root.id)?.verdict||null,accepted:scored.some(item=>item.verdict==='pass'),attempts:scored};
});
const firstPassPasses=chains.filter(chain=>chain.firstPass==='pass').length;
const accepted=chains.filter(chain=>chain.accepted).length;
const report={round,evaluator,createdAt:new Date().toISOString(),total:chains.length,firstPassPasses,firstPassRate:firstPassPasses/chains.length,accepted,gatedRate:accepted/chains.length,maxAttemptsUsed:Math.max(...chains.map(chain=>chain.attempts.length)),chains};
const directory=join(process.cwd(),'content','generation-lab','evaluations');
await mkdir(directory,{recursive:true});
const path=join(directory,`${round}-quality-gate.json`);
await writeFile(path,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({...report,chains:undefined,path},null,2));
