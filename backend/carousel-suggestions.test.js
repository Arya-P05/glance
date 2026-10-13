import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSuggestions } from './carousel-suggestions.js';
const candidates=Array.from({length:10},(_,i)=>({id:String(i)}));
const suggestion={title:'A little joy',reason:'Varied scenes with a shared mood',postIds:['0','1','2','3','4']};
test('keeps curated slide order',()=>assert.deepEqual(validateSuggestions([suggestion],candidates)[0].post_ids,suggestion.postIds));
test('rejects unknown or repeated images',()=>{
 for(const postIds of [['0','1','2','3','missing'],['0','1','2','3','3']])assert.throws(()=>validateSuggestions([{...suggestion,postIds}],candidates));
});
test('rejects reuse across suggestions',()=>assert.throws(()=>validateSuggestions([suggestion,suggestion],candidates)));
test('does not repeat dismissed grouping in different order',()=>assert.throws(()=>validateSuggestions([suggestion],candidates,[{post_ids:[...suggestion.postIds].reverse()}])));
test('previous covers cannot lead but can appear later',()=>{
 assert.throws(()=>validateSuggestions([suggestion],candidates,[],['0']));
 assert.equal(validateSuggestions([{...suggestion,postIds:['1','0','2','3','4']}],candidates,[],['0']).length,1);
});

const { buildCarouselSuggestions, suggestCarousels } = await import('./carousel-suggestions.js');
const library = Array.from({length:60}, (_, i) => ({id:String(i),storage_path:`image-${i}.png`,caption:`reminder ${i}`}));
function seededRandom(seed = 42) {
 return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}
test('each click adds exactly five fresh groups even with pending suggestions',()=>{
 const random=seededRandom();let history=[];
 for(let click=0;click<8;click++) {
  const result=buildCarouselSuggestions(library,[],history,[],random);
  assert.equal(result.length,5);
  assert.ok(result.every(s=>s.post_ids.length===5));
  assert.equal(new Set(result.flatMap(s=>s.post_ids)).size,25);
  const oldSets=new Set(history.map(s=>[...s.post_ids].sort().join(',')));
  assert.ok(result.every(s=>!oldSets.has([...s.post_ids].sort().join(','))));
  history.push(...result.map(s=>({...s,status:'pending'})));
 }
});
test('excludes queued and recently posted slides, reserves five unused covers',()=>{
 const carousels=[{status:'ready',instagram_carousel_items:[{post_id:'0'}]},
 {status:'posting',instagram_carousel_items:[{post_id:'1'}]},
 ...Array.from({length:21},(_,i)=>({status:'posted',posted_at:String(100-i),instagram_carousel_items:[{post_id:String(i+2)}]}))];
 // ISO dates ensure lexical chronological sorting, including the 21st older post.
 carousels.slice(2).forEach((c,i)=>{c.posted_at=new Date(Date.UTC(2026,9,30-i)).toISOString()});
 const covers=library.filter(p=>Number(p.id)<55).map(p=>({post_id:p.id,storage_path:p.storage_path}));
 const result=buildCarouselSuggestions(library,carousels,[],covers,seededRandom());
 const ids=result.flatMap(s=>s.post_ids);
 assert.ok(ids.every(id=>Number(id)>=22));
 assert.deepEqual(result.map(s=>s.post_ids[0]).sort(),['55','56','57','58','59']);
});
test('cover storage-path aliases are blocked and duplicate images cannot fill a batch',()=>{
 const covers=[{post_id:'deleted',storage_path:'image-0.png'}];
 const result=buildCarouselSuggestions(library,[],[],covers,seededRandom());
 assert.ok(result.every(s=>s.post_ids[0]!=='0'));
 const aliases=Array.from({length:25},(_,i)=>({id:String(i),storage_path:'same.png'}));
 assert.throws(()=>buildCarouselSuggestions(aliases),/25 eligible.*1 available/);
});
test('reports shortages rather than returning partial suggestions',()=>{
 assert.throws(()=>buildCarouselSuggestions(library.slice(0,24)),/25 eligible.*24 available/);
 assert.throws(()=>buildCarouselSuggestions(library,[],[],library.slice(0,56).map(p=>({post_id:p.id}))),/five unused first slides/);
});
test('works with exactly 25 images and five eligible covers across repeated batches',()=>{
 const posts=library.slice(0,25),covers=posts.slice(0,20).map(p=>({post_id:p.id}));
 const random=seededRandom();const history=[];
 for(let i=0;i<4;i++)history.push(...buildCarouselSuggestions(posts,[],history,covers,random));
 assert.equal(new Set(history.map(s=>[...s.post_ids].sort().join(','))).size,20);
});
test('database workflow needs no AI client and pages full history before one batch insert',async()=>{
 const rows={posts:library,instagram_carousels:[],instagram_cover_history:[],carousel_suggestions:
  Array.from({length:501},()=>({post_ids:['old1','old2','old3','old4','old5'],status:'pending'}))};
 const ranges=[];const writes=[];
 const db={from(table){const query={
  select(){return query},eq(){return query},in(){return query},order(){return query},
  async range(start,end){ranges.push([table,start]);return {data:rows[table].slice(start,end+1)}},
  async insert(value){writes.push(value);return {}},
 };return query}};
 await suggestCarousels(db, { responses: { create() { throw new Error('Carousel suggestions must not call AI'); } } });
 assert.ok(ranges.some(([table,start])=>table==='carousel_suggestions'&&start===500));
 assert.equal(writes.length,1);assert.equal(writes[0].length,5);
});
