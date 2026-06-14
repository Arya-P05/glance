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

function mediumDraftStoragePath(draft) {
  const metadata = draft.metadata && typeof draft.metadata === "object" ? draft.metadata : {};
  return typeof metadata.mediumStoragePath === "string" && metadata.mediumStoragePath
    ? metadata.mediumStoragePath
    : null;
}

function mediumPostStoragePathForDraft(draft, sourcePath) {
  const ext = sourcePath?.includes(".")
    ? sourcePath.split(".").pop().toLowerCase()
    : "png";
  return `${POST_PREFIX}/medium/${draft.name}.${ext}`;
}

/** Fast server-side copy within the same bucket; falls back to download/resize/upload. */
export async function publishDraftFromDb(supabase, draft, { status = "active" } = {}) {
  const postStoragePath = postStoragePathForDraft(draft);
  const mediumSourcePath = mediumDraftStoragePath(draft);
  const mediumPostStoragePath = mediumSourcePath
    ? mediumPostStoragePathForDraft(draft, mediumSourcePath)
    : null;

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

    const fallbackMediumPath = mediumSourcePath
      ? await copyMediumPost(supabase, mediumSourcePath, mediumPostStoragePath)
      : null;
    await upsertPostAndMarkPublished(supabase, draft, fallbackPath, fallbackMediumPath, status);
    return fallbackPath;
  }

  const copiedMediumPath = mediumSourcePath
    ? await copyMediumPost(supabase, mediumSourcePath, mediumPostStoragePath)
    : null;
  await upsertPostAndMarkPublished(supabase, draft, postStoragePath, copiedMediumPath, status);
  return postStoragePath;
}

async function copyMediumPost(supabase, sourcePath, targetPath) {
  const { error: copyErr } = await supabase.storage
    .from(BUCKET)
    .copy(sourcePath, targetPath);
  if (!copyErr) return targetPath;

  const { data: blobData, error: downloadErr } = await supabase.storage
    .from(BUCKET)
    .download(sourcePath);
  if (downloadErr) throw downloadErr;

  const imageBytes = Buffer.from(await blobData.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(targetPath, imageBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) throw uploadErr;
  return targetPath;
}

async function upsertPostAndMarkPublished(supabase, draft, storagePath, mediumStoragePath, status) {
  const { error: insertErr } = await supabase.from("posts").upsert(
    {
      instagram_id: `generated_${draft.name}`,
      storage_path: storagePath,
      medium_storage_path: mediumStoragePath,
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
    .select("id, name, storage_path, caption, scene, metadata")
    .eq("name", name)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Draft not found: ${name}`);
  return data;
}
