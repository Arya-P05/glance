import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function atomicJSON(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value,null,2)); await rename(temp,path);
}
export class Store {
  constructor(directory) { this.directory=directory; this.runs=new Map(); this.reviews=[]; this.serial=Promise.resolve(); }
  async init() {
    await mkdir(join(this.directory,'runs'),{recursive:true}); await mkdir(join(this.directory,'references'),{recursive:true});
    for(const f of await readdir(join(this.directory,'runs'))) {
      if(!/^[a-f0-9-]{36}\.json$/.test(f))continue;
      const run=JSON.parse(await readFile(join(this.directory,'runs',f),'utf8'));
      if(['queued','generating'].includes(run.status)) {
        run.status='interrupted';run.error='Service stopped. Provider completion is unknown; this request was not automatically retried.';await this.save(run);
      }
      this.runs.set(run.id,run);
    }
    try {this.references=JSON.parse(await readFile(join(this.directory,'references.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.references=[];}
    try {this.control=JSON.parse(await readFile(join(this.directory,'control.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.control=null;}
    try {this.reviews=JSON.parse(await readFile(join(this.directory,'reviews.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    return this;
  }
  async setControl(control) {await atomicJSON(join(this.directory,'control.json'),control);this.control=control;}
  async save(run) { await atomicJSON(join(this.directory,'runs',`${run.id}.json`),run);this.runs.set(run.id,run); }
  async review(value) {
    const job=this.serial.then(async()=>{const review={...value,id:randomUUID(),createdAt:new Date().toISOString()}; const next=[...this.reviews,review];await atomicJSON(join(this.directory,'reviews.json'),next);this.reviews=next;return review;});
    this.serial=job.catch(()=>{});return job;
  }
}
export function wilson(passes,total) {
  if(!total)return null;
  const z=1.96,p=passes/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt((p*(1-p)+z*z/(4*total))/total)/d;
  return {low:Math.max(0,c-h),high:Math.min(1,c+h)};
}
export function summarize(runs,reviews,actor='human') {
  const latest=new Map();for(const r of reviews)if(r.actor===actor)latest.set(r.runId,r);
  const groups=new Map();
  for(const r of runs) {
    const conditioning=r.conditioning||(r.mode==='reference'?`${r.referenceIds?.length||1}-reference`:'text');
    const key=[r.recipeId,r.mode,conditioning,r.recipeHash,r.model,r.quality,r.phase,r.family].join('|');
    const g=groups.get(key)||{recipeId:r.recipeId,recipeHash:r.recipeHash,conditioning,model:r.model,quality:r.quality,phase:r.phase,family:r.family,attempts:0,ready:0,failed:0,reviewed:0,passed:0};
    g.attempts++;if(r.status==='ready')g.ready++;if(['failed','interrupted'].includes(r.status))g.failed++;
    const review=latest.get(r.id);if(r.status==='ready'&&review&&review.verdict!=='unsure'){g.reviewed++;if(review.verdict==='pass')g.passed++;}
    groups.set(key,g);
  }
  return [...groups.values()].map(g=>({...g,actor,unreviewed:g.ready-g.reviewed,reviewedPassRate:g.reviewed?g.passed/g.reviewed:null,observedYield:g.attempts?g.passed/g.attempts:null,interval:wilson(g.passed,g.reviewed)}));
}
