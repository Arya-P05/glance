import { randomUUID, createHash } from 'node:crypto';
import { captionSignature, normalizeCaptionLayout, normalizeMediumCaptionLayout } from './motivational-generator.js';

export function feedbackReason(value = '') {
  if (typeof value !== 'string' || value.length > 1000) throw Object.assign(new Error('Feedback must be at most 1000 characters'),{statusCode:400});
  return value.trim();
}
export function reviewEvent(stage,decision,before,after,reason='') {
  return {eventId:randomUUID(),stage,decision,before,after,reason:feedbackReason(reason)};
}
export function approvalEvents(metadata, caption, selectedIndex, layout, mediumLayout, reasons={}) {
  const original = metadata.captionOptions?.[selectedIndex] ?? null;
  const initialLayout = {...normalizeCaptionLayout(metadata.captionLayout || {}),textColor:metadata.captionLayout?.textColor || '#050505'};
  const initialMedium = {...normalizeMediumCaptionLayout(metadata.mediumCaptionLayout || {},metadata.captionLayout || undefined),textColor:metadata.mediumCaptionLayout?.textColor || metadata.captionLayout?.textColor || '#050505'};
  const before = {layout:initialLayout,mediumLayout:initialMedium};
  const after = {layout:normalizeCaptionLayout(layout),mediumLayout:normalizeMediumCaptionLayout(mediumLayout,layout)};
  return [
    reviewEvent('caption',original && (original.smallText !== caption.smallText || original.bigText !== caption.bigText) ? 'edited' : 'accepted',
      {caption:original,optionIndex:selectedIndex},{caption},reasons.caption),
    reviewEvent('placement',JSON.stringify(before)===JSON.stringify(after) ? 'unchanged' : 'edited',before,after,reasons.placement),
  ];
}
export function compileFeedback(events, excludedSources = new Set()) {
  // Latest decision per actual target, not per candidate batch. Ignore unreviewed alternatives.
  const latest = new Map();
  for (const event of events) {
    if (excludedSources.has(event.source_id)) continue;
    const caption = event.before_value?.caption ?? event.after_value?.caption;
    const key = `${event.source_id}:${event.stage}:${event.stage==='caption' ? captionSignature(caption || {}) : ''}`;
    if (!latest.has(key)) latest.set(key,event);
  }
  const stages = {background:[],caption:[],placement:[]};
  for (const event of latest.values()) if (stages[event.stage]) stages[event.stage].push(event);
  return stages;
}
export async function loadFeedback(db, excludedSources = new Set()) {
  const {data,error}=await db.from('generation_feedback').select('*').order('sequence',{ascending:false}).limit(300);
  if(error)throw new Error(`Cannot load generation feedback: ${error.message}`);
  return compileFeedback(data,excludedSources);
}
export function feedbackHash(feedback) { return createHash('sha256').update(JSON.stringify(feedback)).digest('hex'); }
export function stageFeedback(taste,stage) {
  return (taste.feedback?.[stage] || []).slice(0,40).map(event=>({
    decision:event.decision,reason:event.reason,before:event.before_value,after:event.after_value,
    ...(stage!=='caption' ? {scene:event.context?.scene} : {}),
  }));
}
