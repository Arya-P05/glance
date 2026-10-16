// Reproducible experiment manifests go through the same persistent service as the UI.
import {readFile,writeFile} from 'node:fs/promises';
const base=process.env.GENERATION_LAB_URL||'http://127.0.0.1:3849';
const [command,path]=process.argv.slice(2);
if(command==='submit'){
 const manifest=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(manifest.runs)||manifest.runs.length>48)throw new Error('Use a bounded manifest of up to 48 runs.');
 for(let i=0;i<manifest.runs.length;i++){const v=manifest.runs[i];const result=await fetch(base+'/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...v,round:manifest.round,requestId:v.requestId||`${manifest.round}-${i}`})});const body=await result.json();if(!result.ok)throw new Error(body.error);console.log(JSON.stringify({id:body.id,status:body.status,reference:body.referenceNumber,recipe:body.recipeId,model:body.model}));}
}else if(command==='status'){
 const state=await(await fetch(base+'/state')).json();const runs=path?state.runs.filter(r=>r.round===path):state.runs;
 console.log(JSON.stringify({active:state.active,queued:state.queued,runs:runs.map(r=>({id:r.id,round:r.round,ref:r.referenceNumber,recipe:r.recipeId,model:r.model,status:r.status,error:r.error})),summaries:state.summaries},null,2));
}else if(command==='export'){const state=await(await fetch(base+'/state')).json();await writeFile(path,JSON.stringify(state,null,2));}
else throw new Error('Usage: node generation-lab/experiment.js submit manifest.json | status [round] | export path.json');
