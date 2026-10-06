import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReferencePatch, addReferences } from './creative-references.js';
test('rejecting or reopening removes benchmark membership', () => {
  assert.deepEqual(validateReferencePatch({review_status:'rejected'}),{review_status:'rejected',benchmark:false});
  assert.deepEqual(validateReferencePatch({review_status:'pending'}),{review_status:'pending',benchmark:false});
  assert.throws(()=>validateReferencePatch({review_status:'pending',benchmark:true}),/accepted/);
});
test('feedback cannot overwrite assistant provenance or source',()=>{
  for(const field of ['rationale','suggested_by','source_id','storage_path']) assert.throws(()=>validateReferencePatch({[field]:'changed'}),/Invalid/);
  assert.throws(()=>validateReferencePatch({user_notes:'x'.repeat(3001)}),/at most/);
});
test('adding references deduplicates and preserves existing reviews',async()=>{
  const id='00000000-0000-4000-8000-000000000001';let inserted;
  const db={from(name){if(name==='posts')return{select(){return{async in(key,ids){assert.deepEqual(ids,[id]);return{data:[{id,storage_path:'posts/a.jpg',caption:'hello'}]}}}}};
    return{upsert(rows,options){inserted=rows;assert.equal(options.ignoreDuplicates,true);return{async select(){return{data:[]}}}}};}};
  assert.deepEqual(await addReferences(db,'post',[id,id]),{added:0,existing:1});
  assert.equal(inserted[0].review_status,'pending');assert.equal(inserted[0].benchmark,false);
});
test('missing or invalid source fails before insert',async()=>{
  await assert.rejects(addReferences({},'post',['bad']),/valid/);
  const db={from(){return{select(){return{async in(){return{data:[]}}}}}}};
  await assert.rejects(addReferences(db,'post',['00000000-0000-4000-8000-000000000001']),/no longer exist/);
});
