const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function text(value, key, max = 3000) {
  if (typeof value !== 'string' || value.length > max) throw invalid(`${key} must be text of at most ${max} characters`);
  return value.trim();
}
export function validateReferencePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Expected a reference object');
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (['title', 'user_notes'].includes(key)) patch[key] = text(value, key, key === 'title' ? 160 : 3000);
    else if (key === 'role' && ['exemplar', 'near_miss'].includes(value)) patch[key] = value;
    else if (key === 'review_status' && ['pending', 'accepted', 'rejected'].includes(value)) patch[key] = value;
    else if (key === 'benchmark' && typeof value === 'boolean') patch[key] = value;
    else throw invalid(`Invalid reference field: ${key}`);
  }
  if (patch.review_status && patch.review_status !== 'accepted') {
    if (patch.benchmark) throw invalid('Only accepted references can enter the benchmark');
    patch.benchmark = false;
  }
  return patch;
}
export async function addReferences(db, sourceType, ids, suggestions = new Map()) {
  if (!['post', 'background'].includes(sourceType)) throw invalid('Invalid source type');
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !UUID.test(id))) throw invalid('Choose 1–50 valid sources');
  const unique = [...new Set(ids)];
  const { data, error } = await db.from(sourceType === 'post' ? 'posts' : 'backgrounds')
    .select(sourceType === 'post' ? 'id,storage_path,caption' : 'id,storage_path,name').in('id', unique);
  if (error) throw error;
  if (data.length !== unique.length) throw invalid('Some selected sources no longer exist');
  const rows = data.map(row => ({
    source_type: sourceType, source_id: row.id, storage_path: row.storage_path,
    source_caption: row.caption || null, title: row.caption?.slice(0,160) || row.name || 'Untitled reference',
    ...suggestions.get(row.id),
    review_status: 'pending', benchmark: false,
    suggested_by: suggestions.has(row.id) ? 'assistant' : 'user',
  }));
  const result = await db.from('creative_references').upsert(rows, {onConflict:'source_type,source_id', ignoreDuplicates:true}).select('id');
  if (result.error) throw result.error;
  return { added: result.data.length, existing: unique.length - result.data.length };
}
export async function listReferences(db, publicUrl) {
  const { data, error } = await db.from('creative_references').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  return data.map(row => ({...row, publicUrl: publicUrl(row.storage_path)}));
}
export async function updateReference(db, id, input) {
  if (!UUID.test(id)) throw invalid('Invalid reference ID');
  const patch = validateReferencePatch(input);
  const {data,error}=await db.from('creative_references').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();
  if (error) {
    if (error.code === '23514') throw invalid('Accept this reference before adding it to the benchmark');
    throw error;
  }
  if (!data) throw Object.assign(new Error('Reference not found'),{status:404});
  return data;
}
