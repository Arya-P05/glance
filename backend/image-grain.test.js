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
