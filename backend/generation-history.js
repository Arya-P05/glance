import {sceneDedupKeys} from './poster-concepts.js';
export const RECENT_GENERATION_LIMIT = 20;
export async function loadGenerationHistory(db) {
  if (!db) return [];
  const {data,error}=await db.from('generation_history').select('name,scene,image_prompt,created_at')
    .order('created_at',{ascending:false}).order('name',{ascending:true}).limit(RECENT_GENERATION_LIMIT);
  if(error) throw new Error(`Cannot load recent generation history: ${error.message}`);
  return data || [];
}
export function rememberGeneration(history, entry) {
  return [entry,...history.filter(item=>item.name!==entry.name)].slice(0,RECENT_GENERATION_LIMIT);
}
export function generationHistoryInstructions(history=[]) {
  if(!history.length) return '';
  return `\nRECENT GENERATION MEMORY — last ${Math.min(history.length,RECENT_GENERATION_LIMIT)} outputs, newest first. This is avoidance context, not positive inspiration or human feedback. Includes rejected and unreviewed images. Do not repeat or lightly remix these concepts. Vary subjects/characters, actions, settings, composition, palette and visual jokes; a different animal in the same scene is not a new idea. Preserve explicitly requested subjects or series constraints while varying the remaining dimensions.\n${JSON.stringify(history.slice(0,RECENT_GENERATION_LIMIT).map(({name,scene})=>({name,scene})))}\n`;
}

export function recentSceneAvoidance(history=[]) {
  // A familiar setting category is not a repeated concept.
  return new Set(history.slice(0,RECENT_GENERATION_LIMIT).flatMap(item=>
    [...sceneDedupKeys(item.scene)].filter(key=>!key.startsWith('family:'))));
}
