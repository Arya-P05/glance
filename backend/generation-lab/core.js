import { randomUUID,createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toFile } from 'openai';
import { models,recipes,buildPrompt } from './recipes.js';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function validateRun(input,references) {
  if(!input||typeof input!=='object')throw new Error('A generation request is required.');
  const referenceIds=input.referenceIds??[input.referenceId];
  if(!Array.isArray(referenceIds)||referenceIds.length<1||referenceIds.length>4||new Set(referenceIds).size!==referenceIds.length)throw new Error('Choose one to four distinct references from this bank.');
  const selected=referenceIds.map(id=>references.find(r=>r.id===id));if(selected.some(ref=>!ref))throw new Error('Choose references from this bank.');
  const ref=selected[0];
  const recipe=recipes.find(r=>r.id===input.recipeId);if(!recipe)throw new Error('Unknown recipe.');
  if(!models.includes(input.model))throw new Error('Unsupported model.');
  if(!['medium','high'].includes(input.quality))throw new Error('Choose medium or high quality.');
  if(!['calibration','development','validation','production'].includes(input.phase))throw new Error('Choose a generation phase.');
  if(typeof input.scene!=='string'||input.scene.trim().length<20||input.scene.length>4000)throw new Error('Scene must be 20–4,000 characters.');
  if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))throw new Error('A stable request ID is required.');
  if(typeof input.round!=='string'||input.round.length<1||input.round.length>120)throw new Error('Name the round.');
  if(input.parentRunId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.parentRunId))throw new Error('Parent run ID must be a UUID.');
  const conditioning=recipe.mode==='reference'?`${selected.length}-reference`:'text';
  return {referenceId:ref.id,referenceIds:selected.map(r=>r.id),referenceNumber:ref.number,referenceNumbers:selected.map(r=>r.number),referenceHash:ref.sha256,referenceHashes:selected.map(r=>r.sha256),family:ref.family,conditioning,recipeId:recipe.id,recipeHash:hash({mode:recipe.mode,treatment:recipe.treatment,template:buildPrompt(recipe,'SCENE',ref.family)}),mode:recipe.mode,model:input.model,quality:input.quality,phase:input.phase,scene:input.scene.trim(),prompt:buildPrompt(recipe,input.scene.trim(),ref.family),requestId:input.requestId,round:input.round,...(input.parentRunId?{parentRunId:input.parentRunId}:{}),size:'1024x1024',output_format:'png'};
}
export async function render(client,run,referenceBytes=[]) {
  const args={model:run.model,prompt:run.prompt,quality:run.quality,size:run.size,n:1,output_format:'png'};
  const response=run.mode==='reference'
    ? await client.images.edit({...args,image:await Promise.all(referenceBytes.map((bytes,index)=>toFile(bytes,`reference-${index+1}.jpg`,{type:'image/jpeg'}))),...(run.model==='gpt-image-1.5'?{input_fidelity:'high'}:{})})
    : await client.images.generate(args);
  if(!response.data?.[0]?.b64_json)throw new Error('Provider returned no image.');
  return {bytes:Buffer.from(response.data[0].b64_json,'base64'),usage:response.usage||null,requestId:response._request_id||null,revisedPrompt:response.data[0].revised_prompt||null};
}
export class Lab {
  constructor(store,client,{concurrency=2}={}) {this.store=store;this.client=client;this.concurrency=concurrency;this.active=0;this.queue=[];this.providerBlocked=store.control?.reason||null;this.serial=Promise.resolve();}
  async submit(input) {
    const job=this.serial.then(async()=>{
      const value=validateRun(input,this.store.references);
      const existing=[...this.store.runs.values()].find(r=>r.requestId===value.requestId);
      if(existing) {
        if(hash(Object.fromEntries(Object.entries(value).filter(([k])=>k!=='referenceHash')))!==hash(Object.fromEntries(Object.entries(existing.spec).filter(([k])=>k!=='referenceHash'))))throw new Error('Request ID already belongs to another experiment.');
        return existing;
      }
      if(!this.client)throw new Error('OPENAI_IMAGE_API_KEY is missing.');
      if(this.providerBlocked)throw new Error(this.providerBlocked);
      if(this.queue.length>=48)throw new Error('Queue is full; wait for this round.');
      const run={...value,spec:value,id:randomUUID(),status:'queued',createdAt:new Date().toISOString()};
      await this.store.save(run);this.queue.push(run);this.pump();return run;
    });this.serial=job.catch(()=>{});return job;
  }
  pump() {while(!this.providerBlocked&&this.active<this.concurrency&&this.queue.length){const run=this.queue.shift();this.active++;void this.execute(run).finally(()=>{this.active--;this.pump();});}}
  async execute(run) {
    try {
      run.status='generating';run.startedAt=new Date().toISOString();await this.store.save(run);
      const selected=(run.referenceIds||[run.referenceId]).map(id=>this.store.references.find(r=>r.id===id));
      const bytes=run.mode==='reference'?await Promise.all(selected.map(ref=>readFile(join(this.store.directory,'references',ref.file)))):[];
      const hashes=run.referenceHashes||[run.referenceHash];
      if(bytes.some((value,index)=>hash(value)!==hashes[index]))throw new Error('Reference snapshot changed; generation stopped.');
      const result=await render(this.client,run,bytes);
      await writeFile(join(this.store.directory,'runs',`${run.id}.png`),result.bytes);
      run.status='ready';run.usage=result.usage;run.providerRequestId=result.requestId;run.revisedPrompt=result.revisedPrompt;run.imageHash=hash(result.bytes);
    }catch(error){run.status='failed';run.error=String(error.message).slice(0,1000);run.providerStatus=error.status||null;run.providerCode=error.code||null;
      if(error.code==='insufficient_quota'||/no credits remaining|insufficient_quota|exceeded your current quota/i.test(error.message)){
        this.providerBlocked='Generation paused after an API quota/credit rejection. Account balance has not been verified.';
        await this.store.setControl({reason:this.providerBlocked,updatedAt:new Date().toISOString()});
        for(const waiting of this.queue.splice(0)){waiting.status='blocked';waiting.error='Not dispatched: generation paused after an API rejection.';await this.store.save(waiting);}
      }
    }
    run.completedAt=new Date().toISOString();run.elapsedMs=Date.parse(run.completedAt)-Date.parse(run.startedAt);
    try{await this.store.save(run);}catch(e){console.error('Could not persist generation outcome',run.id,e.message);}
  }
}
