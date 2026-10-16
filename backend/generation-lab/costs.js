// Estimates from published standard rates, not an account balance or billing ledger.
export const pricingSource='https://developers.openai.com/api/docs/models/gpt-image-1.5';
export function estimateCost(run){
 if(run.model!=='gpt-image-1.5'||!run.usage)return null;
 const i=run.usage.input_tokens_details,o=run.usage.output_tokens_details;
 if(!i||!o||![i.text_tokens,i.image_tokens,o.text_tokens,o.image_tokens].every(Number.isFinite))return null;
 return (i.text_tokens*5+i.image_tokens*8+o.text_tokens*10+o.image_tokens*32)/1e6;
}
export function costSummary(runs){const completed=runs.filter(r=>r.status==='ready');const known=completed.map(estimateCost).filter(v=>v!==null);return {estimatedUSD:known.reduce((s,v)=>s+v,0),estimatedImages:known.length,unpricedImages:completed.length-known.length,pricingSource,billingVerified:false};}
