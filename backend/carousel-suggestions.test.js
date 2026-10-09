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
