import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReviewedCaptions, validateReviewedOptions, captionVoice, reviewedCaptionPrompt } from './reviewed-captions.js';
const examples = [
 {smallText:'If not us,',bigText:'then who?'},
 {smallText:'remember to',bigText:'f*ck their opinion.'},
 {smallText:'relax gng,',bigText:'life is not a race.'},
 {smallText:'one life,',bigText:'make it fun.'},
 {smallText:'life update:',bigText:'we’re so back.'},
];
test('authored questions and censored profanity survive validation',()=>{
 assert.equal(captionVoice.examples.length,25);
 const result=validateReviewedOptions(examples);
 assert.equal(result.length,5);
 assert.equal(result[0].bigText,'then who?');
 assert.equal(result[1].bigText,'f*ck their opinion.');
 assert.match(reviewedCaptionPrompt({}, {references:[]}),/Relax gng, life is not a race/);
});
test('deduplicates complete wording across splits and punctuation and repeated payoffs',()=>{
 assert.deepEqual(validateReviewedOptions([
  {smallText:'one life',bigText:'make it fun'},
  {smallText:'one',bigText:'life, make it fun.'},
  {smallText:'hey bro',bigText:'make it fun.'},
 ]),[{smallText:'one life',bigText:'make it fun'}]);
 assert.equal(validateReviewedOptions([{smallText:'one',bigText:'life, make it fun.'}],[{smallText:'one life',bigText:'make it fun'}]).length,0);
});
test('always includes image with reviewed references and records recipe provenance',async()=>{
 let request;
 const result=await generateReviewedCaptions({client:{responses:{create:async r=>{request=r;return {id:'response-test',output_text:JSON.stringify({options:examples})};}}},model:'test',imageBytes:Buffer.from('image'),taste:{references:[{sourceType:'post',decision:'accepted',role:'exemplar',caption:'approved'}]}});
 assert.equal(request.input[0].content[1].type,'input_image');
 assert.equal(result.taste.captionRecipeVersion,'authored-voice-v1');
 assert.equal(result.attempts[0].responseId,'response-test');
});
test('oversized provider outputs are rejected, never silently truncated',async()=>{
 let calls=0;
 await assert.rejects(generateReviewedCaptions({client:{responses:{create:async()=>{calls++;return {output_text:JSON.stringify({options:[{smallText:'x'.repeat(37),bigText:'y'}]})};}}},model:'test'}),/No valid/);
 assert.equal(calls,3);
});
