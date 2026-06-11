import { BUCKET, POST_PREFIX, resizeForWidget } from "./instagram-helper.js";

function captionText(caption) {
  if (!caption || typeof caption !== "object") return null;
  const small = typeof caption.smallText === "string" ? caption.smallText : "";
  const big = typeof caption.bigText === "string" ? caption.bigText : "";
  const joined = `${small} ${big}`.trim();
  return joined || null;
}

function postStoragePathForDraft(draft) {
  const ext = draft.storage_path?.includes(".")
    ? draft.storage_path.split(".").pop().toLowerCase()
    : "jpg";
  return `${POST_PREFIX}/${draft.name}.${ext}`;
}

/** Fast server-side copy within the same bucket; falls back to download/resize/upload. */
export async function publishDraftFromDb(supabase, draft, { status = "active" } = {}) {
  const postStoragePath = postStoragePathForDraft(draft);

  const { error: copyErr } = await supabase.storage
    .from(BUCKET)
    .copy(draft.storage_path, postStoragePath);

  if (copyErr) {
    const { data: blobData, error: downloadErr } = await supabase.storage
      .from(BUCKET)
      .download(draft.storage_path);
    if (downloadErr) throw downloadErr;

    const imageBytes = Buffer.from(await blobData.arrayBuffer());
    const resized = await resizeForWidget(imageBytes);
    const fallbackPath = `${POST_PREFIX}/${draft.name}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(fallbackPath, resized, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) throw uploadErr;

    await upsertPostAndMarkPublished(supabase, draft, fallbackPath, status);
    return fallbackPath;
  }

  await upsertPostAndMarkPublished(supabase, draft, postStoragePath, status);
  return postStoragePath;
}

async function upsertPostAndMarkPublished(supabase, draft, storagePath, status) {
  const { error: insertErr } = await supabase.from("posts").upsert(
    {
      instagram_id: `generated_${draft.name}`,
      storage_path: storagePath,
      caption: captionText(draft.caption),
      posted_at: null,
      status,
    },
    { onConflict: "instagram_id" }
  );
  if (insertErr) throw insertErr;

  const { error: updateErr } = await supabase
    .from("drafts")
    .update({ status: "published" })
    .eq("id", draft.id);
  if (updateErr) throw updateErr;
}

export async function getDraftForPublish(supabase, name) {
  const { data, error } = await supabase
    .from("drafts")
    .select("id, name, storage_path, caption, scene")
    .eq("name", name)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Draft not found: ${name}`);
  return data;
}
