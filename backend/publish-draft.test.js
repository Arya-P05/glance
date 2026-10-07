import test from 'node:test';
import assert from 'node:assert/strict';
import {publishDraftFromDb} from './publish-draft.js';
test('wide rejection publishes square only even with a stale wide asset',async()=>{
 const copies=[];let post;
 const db={storage:{from:()=>({copy:async(...args)=>{copies.push(args);return {error:null};}})},from:table=>({upsert:async row=>{post=row;return {error:null};},update:()=>({eq:async()=>({error:null})})})};
 await publishDraftFromDb(db,{id:'id',name:'square-only',storage_path:'drafts/square.png',caption:{smallText:'a',bigText:'b'},metadata:{mediumRejected:true,mediumStoragePath:'drafts/wide.png'}});
 assert.equal(copies.length,1);
 assert.equal(post.medium_storage_path,null);
 assert.equal(post.medium_eligible,false);
 assert.equal(post.storage_path,'posts/square-only.png');
});
