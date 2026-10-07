import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTaste, tasteInstructions, positiveReferences, referenceImages, loadTaste } from './generation-taste.js';
import { reviewedCaptionPrompt, generateReviewedCaptions } from './reviewed-captions.js';
const row = (id,more={}) => ({id,review_status:'accepted',role:'exemplar',storage_path:`posts/${id}.png`,...more});
test('pending and benchmark content never enters generation context or visual references',()=>{
 const taste=compileTaste([row('a'),row('b',{benchmark:true,user_notes:'secret benchmark'}),row('c',{review_status:'pending',user_notes:'unreviewed'})]);
 assert.deepEqual(taste.references.map(r=>r.id),['a']);
 assert.doesNotMatch(tasteInstructions(taste),/secret benchmark|unreviewed/);
 assert.equal(referenceImages(taste,p=>p).length,2);
});
test('current role and explicit corrections survive stale assistant analysis',()=>{
 const taste=compileTaste([row('goat',{title:'Repetition watch',user_notes:'this is a positive'}),row('meal',{role:'near_miss',user_notes:'bad caption'}),row('tiny',{review_status:'rejected',user_notes:'hard to see subject'})]);
 assert.deepEqual(positiveReferences(taste).map(r=>r.id),['goat']);
 assert.match(tasteInstructions(taste),/bad caption/);
 assert.match(tasteInstructions(taste),/decision and role override/);
 assert.equal(referenceImages(taste,p=>p)[1].image_url,'posts/goat.png');
});
test('snapshot hash is order-independent and changes when feedback changes',()=>{
 assert.equal(compileTaste([row('a'),row('b')]).hash,compileTaste([row('b'),row('a')]).hash);
 assert.notEqual(compileTaste([row('a')]).hash,compileTaste([row('a',{user_notes:'different'})]).hash);
});
test('reviewed caption generation avoids the legacy CSV and fails instead of fallback copy',async()=>{
 const taste=compileTaste([row('a')]);
 assert.doesNotMatch(reviewedCaptionPrompt({},taste),/Approved examples from the CSV/);
 let calls=0;
 await assert.rejects(generateReviewedCaptions({client:{responses:{async create(){calls++;return{output_text:'invalid'}}}},model:'test',scene:{},imageBytes:Buffer.from('test'),taste}),/No valid/);
 assert.equal(calls,3);
});
test('database errors do not silently discard reviews',async()=>{
 await assert.rejects(loadTaste({from(){return{async select(){return{error:{message:'offline'}}}}}}),/Cannot load reviewed/);
});
test('reviewed copy ignores scene details and uses accepted wording without stale warnings',()=>{
 const taste=compileTaste([row('a',{source_type:'post',source_caption:'take it slow, no rush',title:'old negative title'}),row('b',{source_type:'post',role:'near_miss',source_caption:'bad copy',user_notes:'bad caption'})]);
 const prompt=reviewedCaptionPrompt({subject:'rollercoaster teenager',setting:'neon mall',emotion:'gentle'},taste);
 assert.match(prompt,/take it slow, no rush/);
 assert.doesNotMatch(prompt,/rollercoaster teenager|neon mall|old negative title/);
 assert.match(prompt,/EXAMPLES TO AVOID/);
});
