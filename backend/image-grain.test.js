import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {applyGrain,prepareGrain} from './image-grain.js';
test('grain is repeatable, monochrome, and preserves size and transparency',async()=>{
 const original=await sharp({create:{width:32,height:24,channels:4,background:{r:120,g:120,b:120,alpha:0.5}}}).png().toBuffer();
 const first=await applyGrain(original);
 assert.deepEqual(first,await applyGrain(original));
 const {data,info}=await sharp(first).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,32);assert.equal(info.height,24);
 assert.ok(data.some((v,i)=>i%4!==3 && v!==120));
 for(let i=0;i<data.length;i+=4){assert.equal(data[i],data[i+1]);assert.equal(data[i],data[i+2]);assert.equal(data[i+3],128);}
});
test('preview creates a derivative from original, never overwrites source or compounds grain',async()=>{
 const original=await sharp({create:{width:8,height:8,channels:3,background:'#777'}}).png().toBuffer();
 let downloaded;const writes=[];const files=new Map();
 const db={rpc:async()=>({}),storage:{from:()=>({
   exists:async path=>({data:files.has(path)}),
   download:async path=>{if(!files.has(path)) downloaded=path;return {data:new Blob([files.get(path)||original])};},
   upload:async(path,bytes)=>{writes.push({path,bytes});files.set(path,bytes);return {};},
 })}};
 const row={storage_path:'original.png',metadata:{}};
 const first=await prepareGrain(db,'test',row);
 const next=await prepareGrain(db,'test',{storage_path:first.storagePath,metadata:{grain:{originalStoragePath:'original.png'}}});
 assert.equal(downloaded,'original.png');assert.equal(first.storagePath,next.storagePath);
 assert.notEqual(first.storagePath,'original.png');assert.equal(writes.length,1); // Approval reuses the preview instead of reprocessing/reuploading.
});

test('concurrent preview and approval share work, cached requests skip original download, missing derivatives recover', async () => {
 const original = await sharp({create:{width:8,height:8,channels:3,background:'#777'}}).png().toBuffer();
 const files = new Map(); let downloads = 0; let uploads = 0;
 const db = {rpc:async()=>({}),storage:{from:()=>({
  exists:async path=>({data:files.has(path)}),
  download:async path=>{if(path==='source.png') downloads++; return {data:new Blob([files.get(path)||original])};},
  upload:async(path,bytes)=>{uploads++; files.set(path,bytes); return {};},
 })}};
 const row = {storage_path:'source.png'};
 const [first, second] = await Promise.all([prepareGrain(db,'test',row), prepareGrain(db,'test',row)]);
 assert.deepEqual(first,second); assert.equal(downloads,1); assert.equal(uploads,1);
 await prepareGrain(db,'test',row);
 assert.equal(downloads,1);
 files.clear();
 await prepareGrain(db,'test',row);
 assert.equal(downloads,2); assert.equal(uploads,2);
});

test('a failed preparation can be retried and does not block later jobs', async () => {
 const original = await sharp({create:{width:2,height:2,channels:3,background:'#777'}}).png().toBuffer();
 const files = new Map(); let fail = true;
 const db = {rpc:async()=>({}),storage:{from:()=>({
  exists:async path=>({data:files.has(path)}),
  download:async path=> fail ? {error:new Error('offline')} : {data:new Blob([files.get(path)||original])},
  upload:async(path,bytes)=>{files.set(path,bytes);return {};},
 })}};
 await assert.rejects(prepareGrain(db,'test',{storage_path:'source.png'}),/offline/);
 fail = false;
 await prepareGrain(db,'test',{storage_path:'source.png'});
 assert.equal(files.size,1);
});
