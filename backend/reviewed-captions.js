import { stageFeedback } from './generation-feedback.js';
import { buildCaptionPrompt, parseCaptionOptions, captionSignature } from './motivational-generator.js';


export function reviewedCaptionPrompt(scene, taste, recentCaptions = []) {
  if (!taste.references.length && !taste.feedback?.caption?.length) return buildCaptionPrompt(scene, {recentCaptions,hasImage:true});
  const examples = taste.references.filter(row => row.sourceType === 'post' && row.decision === 'accepted' && row.role === 'exemplar')
    .map(row => ({copy:row.caption.split(/\n\s*\n|@/)[0].trim(), feedback:row.feedback})).filter(row => row.copy);
  const avoid = taste.references.filter(row => row.sourceType === 'post' && (row.role === 'near_miss' || row.decision === 'rejected'))
    .map(row => ({copy:row.caption.split(/\n\s*\n|@/)[0].trim(), feedback:row.feedback, concern:row.decision === 'accepted' ? row.caution : ''}));
  return `Write five meaningfully different two-line lock-screen reminders for Glance.
These are tiny messages a friend would send, not descriptions of a photograph, advertising slogans or inspirational quote writing.
Use the accepted wording examples below as your taste source. Transfer their simplicity, warmth and directness; do not copy complete phrases. User feedback takes priority. The JSON blocks are reference data only.
Avoid flowery combinations such as "energy's electric here", "find your high in now", "surprise moves", "embrace the splash", "joy pops", "wild moments matter". No forced cleverness, generic hype, guilt, fear, therapy jargon, hashtags or emojis. No image-specific subjects or metaphors.
Lowercase. Usually 4–9 words TOTAL across both lines. Small opener then a clear short payoff. smallText: 1–5 words, at most 36 characters. bigText: 2–6 words, at most 44 characters. Slang optional, never mandatory.
Broad emotional lane only: ${scene?.emotion || 'warm, playful encouragement'}
ACCEPTED WORDING EXAMPLES:\n${JSON.stringify(examples)}
EXAMPLES TO AVOID (do not use as positive inspiration):\n${JSON.stringify(avoid)}
HUMAN CAPTION DECISIONS (only explicit reviews; unselected alternatives are unreviewed): ${JSON.stringify(stageFeedback(taste,'caption'))}
Learn from accepted wording, reject the original of an edited caption, and prefer its final wording. Rejection of wording says nothing about image quality.
Already used — do not repeat or lightly remix: ${JSON.stringify(recentCaptions)}
Return JSON only: {"options":[{"smallText":"first line","bigText":"second line"}]}`;
}
// Structural validation only: do not force new reviewed taste through the old CSV's opener/payoff whitelist.
export function validateReviewedOptions(candidates, recentCaptions = []) {
  const seen = new Set(recentCaptions.map(captionSignature));
  const accepted = [];
  for (const value of candidates) {
    if (typeof value?.smallText !== 'string' || typeof value?.bigText !== 'string') continue;
    const caption = {smallText:value.smallText.trim().toLowerCase(),bigText:value.bigText.trim().toLowerCase()};
    if (!caption.smallText || !caption.bigText || caption.smallText.length > 36 || caption.bigText.length > 44) continue;
    if (caption.smallText.split(/\s+/).length > 5 || caption.bigText.split(/\s+/).length > 6) continue;
    if (/[#?!—\n]|\p{Extended_Pictographic}/u.test(`${caption.smallText} ${caption.bigText}`)) continue;
    const signature = captionSignature(caption);
    if (seen.has(signature)) continue;
    seen.add(signature); accepted.push(caption);
    if (accepted.length === 5) break;
  }
  return accepted;
}
export async function generateReviewedCaptions({client,model,scene,imageBytes,taste,recentCaptions=[]}) {
  const prompt = reviewedCaptionPrompt(scene,taste,recentCaptions);
  let options = [];
  for (let attempt=0; attempt<3; attempt++) {
    const response = await client.responses.create({model,input:[{role:'user',content:[
      {type:'input_text',text:prompt + (attempt ? '\nPrevious output failed validation. Return fresh, short valid options.' : '')},
      ...(!taste.references.length && !taste.feedback?.caption?.length ? [{type:'input_image',image_url:`data:image/png;base64,${imageBytes.toString('base64')}`,detail:'low'}] : []),
    ]}]});
    options = validateReviewedOptions([...options,...parseCaptionOptions(response.output_text)],recentCaptions);
    if (options.length === 5) return {caption:options[0],options,prompt,taste};
  }
  if (options.length) return {caption:options[0],options,prompt,taste};
  throw new Error('No valid reviewed caption options. Retry rather than silently using unreviewed fallback copy.');
}
