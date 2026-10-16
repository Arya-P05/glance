import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { startGrainWarmer } from './grain-warmer.js';

test('warmer discovers new rows, skips warm rows, retries failures, and stops', async () => {
 let rows = [{storage_path:'a'}, {storage_path:'b'}];
 let scans = 0; let active = 0; let maxActive = 0;
 const calls = []; const errors = [];
 const db = {from:()=>({select(){return this;},eq(){return this;},order(){return this;},
  async range(){scans++;return {data:[...rows]};},
 })};
 const stop = startGrainWarmer(db,'test', {intervalMs:5, onError:e=>errors.push(e),
  prepare:async (_db,_bucket,row)=>{
   active++; maxActive=Math.max(maxActive,active);
   calls.push(row.storage_path);
   await delay(1); active--;
   if(row.storage_path==='b' && errors.length===0) throw new Error('temporary');
  },
 });
 try {
  for(let i=0;i<200 && calls.filter(x=>x==='b').length<2;i++) await delay(5);
  assert.equal(calls.filter(x=>x==='a').length,1);
  assert.equal(calls.filter(x=>x==='b').length,2);
  rows.push({storage_path:'c'});
  for(let i=0;i<200 && !calls.includes('c');i++) await delay(5);
  assert.ok(calls.includes('c')); assert.equal(maxActive,1); assert.equal(errors.length,1);
 } finally {stop();}
 await delay(15); const stoppedScans=scans;
 await delay(15); assert.equal(scans,stoppedScans);
});
