import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalEvents,compileFeedback,stageFeedback,feedbackReason} from './generation-feedback.js';
import {normalizeCaptionLayout,normalizeMediumCaptionLayout} from './motivational-generator.js';
import {defaultCaptionPlacement} from './reviewed-placement.js';
import {reviewedCaptionPrompt} from './reviewed-captions.js';
import {tasteInstructions} from './generation-taste.js';
const original={smallText:'keep going',bigText:'it gets better'};
const layout=normalizeCaptionLayout({textColor:'#050505'});
const medium=normalizeMediumCaptionLayout({textColor:'#050505'});
test('approval records only chosen caption and unchanged placement, not unused negatives',()=>{
 const events=approvalEvents({captionOptions:[original,{smallText:'other',bigText:'option'}]},original,0,layout,medium);
 assert.deepEqual(events.map(x=>[x.stage,x.decision]),[['caption','accepted'],['placement','unchanged']]);
 assert.equal(events.length,2);
});
test('editing captures exact original and final text and both layouts independently',()=>{
 const edited={...original,bigText:'small steps count'};
 const events=approvalEvents({captionOptions:[original],captionLayout:layout,mediumCaptionLayout:medium},edited,0,{...layout,yRatio:.4},{...medium,cropYRatio:.7},{caption:'less vague',placement:'off face'});
 assert.equal(events[0].decision,'edited');assert.deepEqual(events[0].before.caption,original);assert.deepEqual(events[0].after.caption,edited);
 assert.equal(events[1].decision,'edited');assert.equal(events[1].before.layout.yRatio,.3);assert.equal(events[1].after.mediumLayout.cropYRatio,.7);
});
test('latest explicit decision wins and benchmark source is held out',()=>{
 const make=(source,decision)=>({source_id:source,stage:'caption',decision,before_value:{caption:original}});
 const f=compileFeedback([make('a','accepted'),make('a','rejected'),make('b','rejected')],new Set(['b']));
 assert.equal(f.caption.length,1);assert.equal(f.caption[0].decision,'accepted');
});
test('image, wording and placement feedback cannot leak into each other',()=>{
 const taste={references:[],feedback:{background:[{decision:'rejected',reason:'image-only'}],caption:[{decision:'rejected',reason:'wording-only'}],placement:[{decision:'edited',reason:'placement-only'}]}};
 assert.match(tasteInstructions(taste),/image-only/);assert.doesNotMatch(tasteInstructions(taste),/wording-only|placement-only/);
 assert.match(reviewedCaptionPrompt({},taste),/wording-only/);assert.doesNotMatch(reviewedCaptionPrompt({},taste),/image-only|placement-only/);
 assert.equal(stageFeedback(taste,'placement')[0].reason,'placement-only');
});
test('placement always uses fixed square and medium positions without AI',()=>{
 const result=defaultCaptionPlacement({
   client:{responses:{create(){throw new Error('Layout must not call AI');}}},
   taste:{feedback:{placement:[{id:'one',decision:'edited',after:{layout:{xRatio:.8,yRatio:.7}}}]}},
 });
 assert.equal(result.layout.xRatio,.5);assert.equal(result.layout.yRatio,.3);
 assert.equal(result.mediumLayout.xRatio,.5);assert.equal(result.mediumLayout.yRatio,.26);
 assert.equal(result.mediumLayout.cropXRatio,.5);assert.equal(result.mediumLayout.cropYRatio,.5);
 assert.equal(result.layout.textColor,'#050505');assert.equal(result.mediumLayout.textColor,'#050505');
 assert.deepEqual(result.feedbackIds,[]);
 assert.deepEqual(result,defaultCaptionPlacement());
});
test('oversized feedback is rejected before mutation',()=>{assert.throws(()=>feedbackReason('x'.repeat(1001)),/at most/)});
test('wide rejection preserves square acceptance and is a separate feedback target',()=>{
 const events=approvalEvents({captionOptions:[original]},original,0,layout,medium,{mediumRejected:true,medium:'subject cropped out'});
 assert.equal(events[0].decision,'accepted');
 assert.equal(events[1].decision,'unchanged');
 assert.ok(events[1].after.layout);
 assert.equal(events[1].after.mediumLayout,undefined);
 assert.equal(events[2].decision,'rejected');
 assert.deepEqual(events[2].after,{format:'medium',eligible:false});
 const compiled=compileFeedback(events.map(e=>({source_id:'image',stage:e.stage,decision:e.decision,before_value:e.before,after_value:e.after})));
 assert.equal(compiled.placement.length,2);
 assert.equal(compiled.background.length,0);
});
