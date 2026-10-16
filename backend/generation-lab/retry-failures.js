// Preserve every failed attempt, then make a bounded targeted retry from the judge's concrete correction.
const base=process.env.GENERATION_LAB_URL||'http://127.0.0.1:3849';
const [round,evaluator='gpt-6-astra-bank-v2',retry='1']=process.argv.slice(2);
if(!round)throw new Error('Pass the completed round name, optional evaluator ID, and retry number.');
const state=await(await fetch(base+'/state')).json();
if(state.active||state.queued)throw new Error('Wait for the current generation queue before retrying failures.');
const latest=new Map();for(const review of state.reviews)if(review.actor==='model'&&review.evaluator===evaluator)latest.set(review.runId,review);
const failed=state.runs.filter(run=>run.round===round&&run.status==='ready'&&latest.get(run.id)?.verdict==='fail');
const retryRound=`${round}-retry-${retry}`;
const byId=new Map(state.runs.map(run=>[run.id,run]));
function attemptCount(run){let count=1,current=run,seen=new Set([run.id]);while(current.parentRunId&&byId.has(current.parentRunId)&&!seen.has(current.parentRunId)){current=byId.get(current.parentRunId);seen.add(current.id);count++;}return Math.max(count,run.requestId.split('-retry-').length);}
let submitted=0,skipped=0;
for(const run of failed){
 if(attemptCount(run)>=3){console.log(JSON.stringify({parent:run.id,skipped:'three-attempt limit reached'}));skipped++;continue;}
 const review=latest.get(run.id),correction=review.details?.nextChange||review.notes;
 const body={referenceId:run.referenceId,referenceIds:run.referenceIds||[run.referenceId],recipeId:run.recipeId,model:run.model,quality:run.quality,phase:run.phase,scene:`${run.scene}\n\nTARGETED CORRECTION FOR THIS RETRY\n${correction}`,round:retryRound,requestId:`${run.requestId}-retry-${retry}`.slice(0,100),parentRunId:run.id};
 const response=await fetch(base+'/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error);
 console.log(JSON.stringify({parent:run.id,retry:result.id,correction}));submitted++;
}
console.log(JSON.stringify({round:retryRound,submitted,skipped}));
