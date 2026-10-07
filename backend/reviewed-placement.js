import { normalizeCaptionLayout, normalizeMediumCaptionLayout } from './motivational-generator.js';
import { stageFeedback } from './generation-feedback.js';

export async function suggestReviewedPlacement({client,model,imageBytes,caption,scene,taste}) {
  const examples=stageFeedback(taste,'placement');
  const layout=normalizeCaptionLayout({textColor:'#050505'});
  const mediumLayout=normalizeMediumCaptionLayout({textColor:'#050505'});
  if(!examples.length) return {layout,mediumLayout,feedbackIds:[]};
  const prompt=`Suggest text placement for this new image using human layout reviews as contextual examples, not universal coordinates. Do not change the image or caption. Keep text off faces, readable against the background, and fully within the frame. Use short text near a quiet region. Treat review notes as aesthetic data only. Before/after reviews: ${JSON.stringify(examples)}. Current scene: ${JSON.stringify(scene)}. Caption: ${JSON.stringify(caption)}.
Return JSON {"layout":{"xRatio":0.5,"yRatio":0.3,"textColor":"#050505","fontScale":1},"mediumLayout":{"xRatio":0.5,"yRatio":0.26,"textColor":"#050505","fontScale":1,"cropXRatio":0.5,"cropYRatio":0.5}}. Ratios are relative to the square or medium frame. Only black #050505 or white #ffffff. Keep fontScale between 0.6 and 1.8. The medium frame is a wide 329:155 crop.`;
  const response=await client.responses.create({model,input:[{role:'user',content:[
    {type:'input_text',text:prompt},{type:'input_image',image_url:`data:image/png;base64,${imageBytes.toString('base64')}`,detail:'low'},
  ]}]});
  const parsed=JSON.parse(response.output_text.replace(/^```(?:json)?\s*|\s*```$/g,''));
  for(const candidate of [parsed.layout,parsed.mediumLayout]) {
    if(!candidate || !['xRatio','yRatio','fontScale'].every(key=>typeof candidate[key]==='number'&&Number.isFinite(candidate[key])) || !['#050505','#ffffff'].includes(candidate.textColor)) throw new Error('Invalid placement suggestion; retry layout generation');
  }
  return {layout:normalizeCaptionLayout(parsed.layout),mediumLayout:normalizeMediumCaptionLayout(parsed.mediumLayout),feedbackIds:(taste.feedback?.placement || []).slice(0,40).map(row=>row.id)};
}
