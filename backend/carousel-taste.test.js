import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTasteExamples, carouselTasteContent, loadCarouselTaste } from './carousel-taste.js';
const posts = Array.from({length:5}, (_,i)=>({id:String(i),storage_path:`image-${i}.jpg`,caption:`caption ${i}`}));
const review = (id,status='accepted')=>({id,status,post_ids:['4','2','0','3','1'],title:'MODEL TITLE',reason:'MODEL RATIONALE'});

test('uses explicit decisions and preserves the five-slide order',()=>{
 const examples=selectTasteExamples([review('pending','pending'),review('yes'),review('no','dismissed')],posts);
 assert.deepEqual(examples.map(e=>e.decision),['accepted','dismissed']);
 assert.deepEqual(examples[0].slides.map(p=>p.id),['4','2','0','3','1']);
 const content=JSON.stringify(carouselTasteContent(examples,p=>`https://assets/${p}`));
 assert.ok(content.includes('dismissed'));
 assert.ok(!content.includes('MODEL TITLE'));
 assert.ok(!content.includes('MODEL RATIONALE'));
 assert.equal(carouselTasteContent(examples,p=>p).filter(c=>c.type==='input_image').length,10);
});
test('balances feedback and skips incomplete examples',()=>{
 const reviews=[{...review('missing'),post_ids:['4','2','0','3','missing']},...Array.from({length:8},(_,i)=>review(String(i))),review('no','dismissed')];
 const examples=selectTasteExamples(reviews,posts);
 assert.equal(examples.filter(e=>e.decision==='accepted').length,3);
 assert.equal(examples.filter(e=>e.decision==='dismissed').length,1);
 assert.ok(!examples.some(e=>e.id==='missing'));
});
test('empty feedback does not invent learned preferences',()=>{
 assert.match(carouselTasteContent([],p=>p)[0].text,/without claiming learned user preferences/);
});
test('reloads current decisions and fails on unavailable feedback',async()=>{
 let decision='accepted';
 const db={from(table){return {select(){return this;},eq(key,value){this.status=value;return this;},order(){return this;},limit(){return Promise.resolve({data:this.status===decision?[review('one',decision)]:[],error:null});},in(){return Promise.resolve({data:posts,error:null});}};}};
 assert.equal((await loadCarouselTaste(db))[0].decision,'accepted');
 decision='dismissed';
 assert.equal((await loadCarouselTaste(db))[0].decision,'dismissed');
 const failed={from(){return {select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({error:new Error('database unavailable')});}};}};
 await assert.rejects(()=>loadCarouselTaste(failed),/database unavailable/);
});
test('reference-only images remain invalid selectable suggestions',async()=>{
 const {validateSuggestions}=await import('./carousel-suggestions.js');
 assert.throws(()=>validateSuggestions([{title:'test',reason:'test',postIds:['reference-only','1','2','3','4']}],posts));
});
test('suggestion generation actually receives review images and decisions',async()=>{
 const {suggestCarousels}=await import('./carousel-suggestions.js');
 const candidates=Array.from({length:15},(_,i)=>({id:`new-${i}`,storage_path:`new-${i}.jpg`,caption:'new'}));
 let saved;
 const db={from(table){return {select(){return this;},eq(key,value){this.status=value;return this;},in(key,values){this.ids=values;return this;},order(){return this;},limit(){return this;},then(resolve){
  let data=[];
  if(table==='posts')data=this.ids?posts:candidates;
  if(table==='carousel_suggestions')data=this.status==='accepted'?[review('yes')]:this.status==='dismissed'?[review('no','dismissed')]:[review('yes'),review('no','dismissed')];
  return Promise.resolve({data,error:null}).then(resolve);
 },insert(value){saved=value;return Promise.resolve({error:null});}};}};
 const client={responses:{async create(request){
  const content=request.input[0].content;
  assert.equal(content.filter(c=>c.type==='input_image').length,25);
  assert.ok(content.some(c=>c.text?.includes('"userDecision":"accepted"')));
  assert.ok(content.some(c=>c.text?.includes('"userDecision":"dismissed"')));
  assert.ok(!JSON.stringify(content).includes('MODEL RATIONALE'));
  return {output_text:JSON.stringify({suggestions:Array.from({length:3},(_,i)=>({title:'theme',reason:'variety',postIds:candidates.slice(i*5,i*5+5).map(p=>p.id)}))})};
 }}};
 await suggestCarousels(db,client,p=>`https://assets/${p}`,'test-model');
 assert.equal(saved.length,3);
});
