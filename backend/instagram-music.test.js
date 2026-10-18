import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectCarouselMusic} from './instagram-music.js';
const config = JSON.parse(readFileSync(new URL('./instagram-music.json',import.meta.url)));
const availableIds=config.tracks.map(t=>t.track_id);
test('neutral posts rotate through every approved track before reusing one',()=>{
 const history=[];
 for(let i=0;i<config.tracks.length;i++) {
  const selected=selectCarouselMusic({config,availableIds,history,text:'A reminder'});
  history.push({track_id:selected.track_id});
 }
 assert.equal(new Set(history.map(t=>t.track_id)).size,config.tracks.length);
});
test('matches reflective posts but never repeats the previous song',()=>{
 const first=selectCarouselMusic({config,availableIds,text:'Take time to breathe'});
 assert.equal(first.artist,'Nujabes');
 const next=selectCarouselMusic({config,availableIds,text:'Take time to breathe',history:[{track_id:first.track_id}]});
 assert.notEqual(next.track_id,first.track_id);
});
test('never chooses an unapproved track or repeats when it is the only available choice',()=>{
 assert.throws(()=>selectCarouselMusic({config,availableIds:['unknown']}));
 assert.throws(()=>selectCarouselMusic({config,availableIds:[availableIds[0]],history:[{track_id:availableIds[0]}]}));
});
