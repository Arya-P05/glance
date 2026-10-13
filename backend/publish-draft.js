/** Publish immutable render references and draft status in one transaction. */
export async function publishDraftFromDb(supabase, draft, { status = 'active' } = {}) {
  const { data, error } = await supabase.rpc('publish_image_draft', {
    target_id: draft.id, desired_status: status,
  });
  if (error) throw error;
  return data;
}

export async function getDraftForPublish(supabase, name) {
  const { data, error } = await supabase.from('drafts')
    .select('id, name, storage_path, caption, scene, metadata')
    .eq('name', name).in('status', ['draft', 'published']).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Draft not found: ${name}`);
  return data;
}
