import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneDedupKeys,visualSetupKeys} from './poster-concepts.js';
test('ride reaction variations share a setup regardless of cast, wording, or concept ID',()=>{
 const scenes=[
  {conceptId:'first',subject:'a teen in a blue shirt',action:'gripping the lap bar',setting:'roller coaster at sunset'},
  {conceptId:'second',subject:'another person',action:'laughing',setting:'a wooden rollercoaster under a pink sky'},
  {conceptId:'third',subject:'a dog',action:'riding a carnival thrill ride',setting:'nighttime'},
 ];
 for(const scene of scenes) assert.ok(sceneDedupKeys(scene).has('setup:amusement-ride-reaction'));
});
test('cooldown does not broadly ban sunsets, skating, or other fairground scenes',()=>{
 for(const scene of [{setting:'sunset beach',action:'smiling'},{action:'wearing roller skates'},{setting:'fairground food stall',action:'sharing popcorn'}]) assert.deepEqual(visualSetupKeys(scene),[]);
});
