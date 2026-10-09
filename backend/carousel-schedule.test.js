import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCarouselSchedule} from './carousel-schedule.js';
const config={enabled:true,timezone:'America/New_York',hours:[9,14,19],starts_at:'2026-01-01T00:00:00Z'};
const queue=[{id:'a',status:'ready'},{id:'b',status:'draft'},{id:'c',status:'ready'}];
test('queue projections skip drafts and occupied slots, follow New York time',()=>{
 const result=projectCarouselSchedule(queue,config,[{slot:'2026-10-09T13:00:00Z',phase:'posted'}],new Date('2026-10-09T12:00:00Z'));
 assert.equal(result.carousels[0].scheduledAt,'2026-10-09T18:00:00.000Z');
 assert.equal(result.carousels[1].scheduledAt,null);
 assert.equal(result.carousels[2].scheduledAt,'2026-10-09T23:00:00.000Z');
});
test('projection follows DST, skips expired slots, and honors activation time',()=>{
 assert.equal(projectCarouselSchedule(queue,config,[],new Date('2026-11-09T12:00:00Z')).carousels[0].scheduledAt,'2026-11-09T14:00:00.000Z');
 assert.equal(projectCarouselSchedule(queue,config,[],new Date('2026-10-09T13:16:00Z')).carousels[0].scheduledAt,'2026-10-09T18:00:00.000Z');
 assert.equal(projectCarouselSchedule(queue,{...config,starts_at:'2026-10-09T13:05:00Z'},[],new Date('2026-10-09T13:06:00Z')).carousels[0].scheduledAt,'2026-10-09T18:00:00.000Z');
});
test('paused and uncertain schedules do not promise new slots',()=>{
 assert.equal(projectCarouselSchedule(queue,{...config,enabled:false},[],new Date()).carousels[0].scheduledAt,null);
 const result=projectCarouselSchedule(queue,config,[{carousel_id:'old',phase:'uncertain',slot:'2026-10-09T13:00:00Z'}],new Date());
 assert.equal(result.schedule.blocked,true);assert.equal(result.carousels[0].scheduledAt,null);
});
