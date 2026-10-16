import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {config} from 'dotenv';
import OpenAI from 'openai';
import {createClient} from '@supabase/supabase-js';
import {Store,summarize} from './store.js';
import {Lab} from './core.js';
import {costSummary} from './costs.js';
import {recipes,models,productionGeneration} from './recipes.js';
import {persistGeneratedBackground} from '../generated-backgrounds.js';
import {supabaseUrl,supabaseServiceRoleKey} from '../supabase-env.js';
config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
export const defaultDirectory=fileURLToPath(new URL('../content/generation-lab',import.meta.url));
export async function createLabServer({directory=defaultDirectory,client,concurrency=2,promote}={}) {
 const store=await new Store(directory).init(),lab=new Lab(store,client,{concurrency});

 const server=createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||''))return send(403,{error:'Local studio only.'});
  const origin=req.headers.origin;
  if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return send(403,{error:'Local studio only.'});
  if(req.headers['sec-fetch-site']==='cross-site'&&!origin)return send(403,{error:'Local studio only.'});
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url,'http://127.0.0.1');
  try {
   if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(await readFile(new URL('./studio.html',import.meta.url)));}
   if(req.method==='GET'&&url.pathname==='/production'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(await readFile(new URL('./production.html',import.meta.url)));}
   if(req.method==='GET'&&url.pathname==='/state')return send(200,{ready:Boolean(client),promotionReady:Boolean(promote),production:productionGeneration,costs:costSummary([...store.runs.values()]),providerBlocked:lab.providerBlocked,active:lab.active,queued:lab.queue.length,references:store.references,recipes,models,runs:[...store.runs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),reviews:store.reviews,summaries:{human:summarize([...store.runs.values()],store.reviews,'human'),assistant:summarize([...store.runs.values()],store.reviews,'assistant'),model:summarize([...store.runs.values()],store.reviews,'model')}});
   const image=url.pathname.match(/^\/(references|images)\/([a-f0-9-]{36})\.(jpg|png)$/);
   if(req.method==='GET'&&image){const kind=image[1],id=image[2];let path;
    if(kind==='references'){const ref=store.references.find(r=>r.id===id);if(!ref)return send(404,{error:'Reference not found.'});path=join(directory,'references',ref.file);}
    else {if(store.runs.get(id)?.status!=='ready')return send(404,{error:'Image not ready.'});path=join(directory,'runs',`${id}.png`);}
    res.writeHead(200,{'Content-Type':kind==='references'?'image/jpeg':'image/png','Cache-Control':'private, max-age=31536000, immutable',...(url.searchParams.has('download')?{'Content-Disposition':`attachment; filename="glance-${id}.png"`}:{})});return res.end(await readFile(path));
   }
   if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Send JSON.'});let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>64000)return send(413,{error:'Request is too large.'});}
    let value;try{value=JSON.parse(raw);}catch{return send(400,{error:'Invalid JSON.'});}
    if(url.pathname==='/pause'){lab.providerBlocked='Generation paused at your request. No further paid calls will be dispatched.';await store.setControl({reason:lab.providerBlocked,updatedAt:new Date().toISOString()});for(const waiting of lab.queue.splice(0)){waiting.status='blocked';waiting.error=lab.providerBlocked;await store.save(waiting);}return send(200,{paused:true});}
    if(url.pathname==='/resume'){await store.setControl({reason:null,updatedAt:new Date().toISOString()});lab.providerBlocked=null;return send(200,{resumed:true,message:'New requests are enabled. Failed or blocked attempts will not be retried automatically.'});}
    if(url.pathname==='/runs'){try{return send(202,await lab.submit(value));}catch(e){return send(400,{error:e.message});}}
    if(url.pathname==='/production-runs'){
     try{
      const family=String(value.family||'');
      const familyReferences=store.references.filter(reference=>reference.family===family);
      if(!familyReferences.length)return send(400,{error:'Choose a production style.'});
      const primary=familyReferences.find(reference=>reference.id===value.referenceId)||familyReferences[0];
      const useReferences=value.useReferences!==false;
      let referenceIds=useReferences
       ? (Array.isArray(value.referenceIds)&&value.referenceIds.length?value.referenceIds:[primary.id,...familyReferences.filter(reference=>reference.id!==primary.id).slice(0,2).map(reference=>reference.id)])
       : [primary.id];
      referenceIds=[...new Set(referenceIds)];
      if(referenceIds.length<1||referenceIds.length>4||referenceIds.some(id=>!familyReferences.some(reference=>reference.id===id)))return send(400,{error:'Choose one to four references from the selected style.'});
      const requestId=typeof value.requestId==='string'?value.requestId:`production-${randomUUID()}`;
      const run=await lab.submit({
       referenceId:referenceIds[0],referenceIds,
       recipeId:useReferences?productionGeneration.referenceRecipeId:productionGeneration.textRecipeId,
       model:productionGeneration.model,quality:value.quality==='high'?'high':productionGeneration.quality,
       phase:'production',scene:value.scene,requestId,
       round:`production-${new Date().toISOString().slice(0,10)}`,
      });
      return send(202,run);
     }catch(e){return send(400,{error:e.message});}
    }
    if(url.pathname==='/promote'){
     const run=store.runs.get(value.runId);if(!run||run.status!=='ready')return send(400,{error:'Choose a completed image.'});
     if(run.promotedAt)return send(200,{promoted:true,storagePath:run.promotedStoragePath,alreadyPromoted:true});
     if(!promote)return send(503,{error:'Background promotion is not configured.'});
     const result=await promote(run,await readFile(join(directory,'runs',`${run.id}.png`)));
     run.promotedAt=new Date().toISOString();run.promotedStoragePath=result.storagePath;await store.save(run);
     return send(201,{promoted:true,...result});
    }
    if(url.pathname==='/reviews'){
     const run=store.runs.get(value.runId);if(!run||run.status!=='ready')return send(400,{error:'Review a completed image.'});
     if(!['human','assistant','model'].includes(value.actor)||!['pass','fail','unsure'].includes(value.verdict))return send(400,{error:'Invalid review.'});
     if(typeof value.notes!=='string'||value.notes.length>12000)return send(400,{error:'Notes must be text under 12,000 characters.'});
     return send(201,await store.review({runId:run.id,actor:value.actor,verdict:value.verdict,notes:value.notes,...(value.actor!=='human'?{evaluator:typeof value.evaluator==='string'?value.evaluator.slice(0,100):null,details:value.details||null}:{})}));
    }
   }
   send(404,{error:'Not found.'});
  }catch(e){console.error('Lab request failed',e.message);if(!res.headersSent)send(500,{error:'Local studio request failed.'});else res.end();}
 });return {server,store,lab};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const client=process.env.OPENAI_IMAGE_API_KEY?new OpenAI({apiKey:process.env.OPENAI_IMAGE_API_KEY,maxRetries:0,timeout:360000}):undefined;
 let promote;
 if((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const db=createClient(supabaseUrl(),supabaseServiceRoleKey());
  promote=async(run,imageBytes)=>{
   const metadata={source:'generation-lab',scene:run.scene,scenePrompt:run.prompt,imageModel:run.model,promptModel:null,generationLab:{runId:run.id,round:run.round,recipeId:run.recipeId,recipeHash:run.recipeHash,conditioning:run.conditioning,referenceIds:run.referenceIds,referenceHashes:run.referenceHashes,imageHash:run.imageHash,parentRunId:run.parentRunId||null}};
   const storagePath=await persistGeneratedBackground(db,{name:`generation-lab-${run.id}`,imageBytes,metadata});return {storagePath};
  };
 }
 const {server}=await createLabServer({client,concurrency:2,promote});server.listen(Number(process.env.GENERATION_LAB_PORT||3849),'127.0.0.1',()=>console.log(`Generation lab: http://127.0.0.1:${server.address().port}`));
}
