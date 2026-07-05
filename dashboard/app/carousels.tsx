import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Linking,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { api, InstagramCarousel, InstagramCarouselPackage, InstagramStatus, StorageImage } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";
import { useJobStream } from "../lib/useJobStream";
import { RemoteImage } from "../components/RemoteImage";

const CAROUSEL_SELECTION_KEY = "glance.carouselDraftSelection";
const CAROUSEL_SIZE = 5;

type Builder = {
  id?: string;
  title: string;
  caption: string;
  status: InstagramCarousel["status"];
  items: StorageImage[];
  lastError?: string | null;
  permalink?: string | null;
};

function carouselToBuilder(carousel: InstagramCarousel): Builder {
  return {
    id: carousel.id,
    title: carousel.title,
    caption: carousel.caption,
    status: carousel.status,
    items: carousel.items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(item => item.post)
      .filter((post): post is StorageImage => Boolean(post)),
    lastError: carousel.lastError,
    permalink: carousel.permalink,
  };
}

function statusLabel(status: InstagramCarousel["status"]) {
  if (status === "posting") return "posting";
  if (status === "posted") return "posted";
  if (status === "failed") return "failed";
  if (status === "ready") return "ready";
  return "draft";
}

export default function CarouselsScreen() {
  const { width } = useWindowDimensions();
  const narrow = width < 1080;

  const [images, setImages] = useState<StorageImage[]>([]);
  const [carousels, setCarousels] = useState<InstagramCarousel[]>([]);
  const [instagramStatus, setInstagramStatus] = useState<InstagramStatus | null>(null);
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const job = useJobStream(jobId);

  const selectedIds = useMemo(() => new Set(builder?.items.map(item => item.id) ?? []), [builder]);
  const availableImages = useMemo(
    () => images.filter(image => !selectedIds.has(image.id)),
    [images, selectedIds],
  );

  async function loadAll({ consumeSelection = true } = {}) {
    try {
      setLoading(true);
      setError(null);
      const [imageRes, carouselRes, statusRes] = await Promise.all([
        api.images(),
        api.carousels(),
        api.instagramStatus(),
      ]);
      const activeImages = imageRes.items.filter(item => item.status === "active");
      setImages(activeImages);
      setCarousels(carouselRes.carousels);
      setInstagramStatus(statusRes);

      if (consumeSelection && typeof window !== "undefined") {
        const raw = sessionStorage.getItem(CAROUSEL_SELECTION_KEY);
        if (raw) {
          sessionStorage.removeItem(CAROUSEL_SELECTION_KEY);
          const ids = JSON.parse(raw) as string[];
          const picked = ids
            .map(id => activeImages.find(image => image.id === id))
            .filter((image): image is StorageImage => Boolean(image));
          if (picked.length) {
            setBuilder({
              title: `Carousel ${new Date().toLocaleDateString()}`,
              caption: "",
              status: "draft",
              items: picked,
            });
          }
          if (picked.length !== ids.length) {
            setError("Some selected Library posts are no longer active, so they were skipped.");
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => {
    void loadAll();
  }, []));

  useEffect(() => {
    if (jobId && job.done) void loadAll({ consumeSelection: false });
  }, [jobId, job.done]);

  function newCarousel() {
    setBuilder({
      title: `Carousel ${new Date().toLocaleDateString()}`,
      caption: "",
      status: "draft",
      items: [],
    });
    setReplaceIndex(null);
  }

  function editCarousel(carousel: InstagramCarousel) {
    setBuilder(carouselToBuilder(carousel));
    setReplaceIndex(null);
  }

  function updateBuilder(patch: Partial<Builder>) {
    setBuilder(current => current ? { ...current, ...patch } : current);
  }

  function moveItem(index: number, delta: number) {
    if (!builder) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= builder.items.length) return;
    const items = [...builder.items];
    const [item] = items.splice(index, 1);
    items.splice(nextIndex, 0, item);
    updateBuilder({ items });
  }

  function removeItem(index: number) {
    if (!builder) return;
    updateBuilder({ items: builder.items.filter((_, idx) => idx !== index) });
    if (replaceIndex === index) setReplaceIndex(null);
  }

  function addOrReplaceImage(image: StorageImage) {
    if (!builder) {
      setBuilder({
        title: `Carousel ${new Date().toLocaleDateString()}`,
        caption: "",
        status: "draft",
        items: [image],
      });
      return;
    }
    if (selectedIds.has(image.id)) return;
    if (replaceIndex !== null) {
      const items = [...builder.items];
      items[replaceIndex] = image;
      updateBuilder({ items });
      setReplaceIndex(null);
      return;
    }
    if (builder.items.length >= CAROUSEL_SIZE) return;
    updateBuilder({ items: [...builder.items, image] });
  }

  async function saveBuilder(nextStatus?: "draft" | "ready"): Promise<InstagramCarousel | null> {
    if (!builder) return null;
    if (builder.items.length !== CAROUSEL_SIZE) {
      alert(`Pick exactly ${CAROUSEL_SIZE} posts before saving.`);
      return null;
    }

    setBusy(true);
    try {
      const payload = {
        title: builder.title,
        caption: builder.caption,
        postIds: builder.items.map(item => item.id),
        status: nextStatus ?? (builder.status === "ready" ? "ready" as const : "draft" as const),
      };
      const { carousel } = builder.id
        ? await api.updateCarousel(builder.id, payload)
        : await api.createCarousel(payload);
      setBuilder(carouselToBuilder(carousel));
      await loadAll({ consumeSelection: false });
      return carousel;
    } catch (e: any) {
      alert(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!confirm("Archive this carousel draft?")) return;
    setBusy(true);
    try {
      await api.archiveCarousel(id);
      if (builder?.id === id) setBuilder(null);
      await loadAll({ consumeSelection: false });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    setBusy(true);
    try {
      const { carousel } = await api.duplicateCarousel(id);
      setBuilder(carouselToBuilder(carousel));
      await loadAll({ consumeSelection: false });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function triggerBrowserDownload(url: string, filename: string) {
    if (typeof document !== "undefined") {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    Linking.openURL(url);
  }

  function downloadFolderName(title: string) {
    const safeTitle = (title || "carousel")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "carousel";
    return `${safeTitle}-slides`;
  }

  async function pickDownloadDirectory(): Promise<any | "cancelled" | false> {
    if (typeof window === "undefined") return false;
    const showDirectoryPicker = (window as any).showDirectoryPicker;
    if (typeof showDirectoryPicker !== "function") return false;

    try {
      return await showDirectoryPicker({ mode: "readwrite" });
    } catch (e: any) {
      if (e?.name !== "AbortError") throw e;
      return "cancelled";
    }
  }

  async function savePackageToDirectory(
    pkg: InstagramCarouselPackage,
    parentDirectory: any,
  ): Promise<{ status: "saved"; folderName: string }> {
    const folderName = downloadFolderName(pkg.title);
    const directory = await parentDirectory.getDirectoryHandle(folderName, { create: true });

    for (const item of pkg.items) {
      const res = await fetch(item.downloadUrl);
      if (!res.ok) throw new Error(`Could not download ${item.filename}`);
      const blob = await res.blob();
      const file = await directory.getFileHandle(item.filename, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
    }
    return { status: "saved", folderName };
  }

  async function downloadAllItems(pkg: InstagramCarouselPackage, parentDirectory: any | false) {
    try {
      if (parentDirectory) {
        const directoryResult = await savePackageToDirectory(pkg, parentDirectory);
        alert(`Slides saved to "${directoryResult.folderName}".`);
        return;
      }
      triggerBrowserDownload(pkg.zipUrl, `${downloadFolderName(pkg.title)}.zip`);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function downloadCarousel(id: string) {
    setDownloadingId(id);
    try {
      const parentDirectory = await pickDownloadDirectory();
      if (parentDirectory === "cancelled") return;
      const { package: pkg } = await api.exportCarousel(id);
      await downloadAllItems(pkg, parentDirectory);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadBuilderCarousel() {
    if (!builder) return;
    const downloadKey = builder.id ?? "new";
    setDownloadingId(downloadKey);
    try {
      const parentDirectory = await pickDownloadDirectory();
      if (parentDirectory === "cancelled") return;
      let targetId = builder.id;
      if (!targetId || ["draft", "ready", "failed"].includes(builder.status)) {
        const saved = await saveBuilder();
        if (!saved) return;
        targetId = saved.id;
      }
      const { package: pkg } = await api.exportCarousel(targetId);
      await downloadAllItems(pkg, parentDirectory);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function markPosted(id?: string) {
    let targetId = id;
    if (!targetId) {
      const saved = await saveBuilder("ready");
      if (!saved) return;
      targetId = saved.id;
    }
    if (!confirm("Mark this carousel as posted in the dashboard?")) return;
    setBusy(true);
    try {
      const { carousel } = await api.markCarouselPosted(targetId);
      setBuilder(carouselToBuilder(carousel));
      await loadAll({ consumeSelection: false });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function postNow(id?: string) {
    if (!instagramStatus?.publishEnabled) {
      alert(instagramStatus?.error || "Instagram publishing is not connected yet.");
      return;
    }

    let targetId = id;
    if (!targetId) {
      const saved = await saveBuilder("ready");
      if (!saved) return;
      targetId = saved.id;
    }

    setBusy(true);
    try {
      const result = await api.postCarouselNow(targetId);
      setJobId(result.jobId);
      await loadAll({ consumeSelection: false });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const connectionText = instagramStatus
    ? instagramStatus.publishEnabled
      ? `Connected${instagramStatus.username ? ` as @${instagramStatus.username}` : ""}`
      : instagramStatus.error || (instagramStatus.missing?.length ? `Missing ${instagramStatus.missing.join(", ")}` : "Not connected")
    : "Checking Instagram...";

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Carousels</Text>
        <Text style={[S.body, { marginLeft: 8 }]}>{carousels.length} saved</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.integrationPill, instagramStatus?.publishEnabled && styles.integrationPillOn]}>
          <Text style={[styles.integrationText, instagramStatus?.publishEnabled && styles.integrationTextOn]}>
            {connectionText}
          </Text>
        </View>
        <Btn label="New" onPress={newCarousel} small />
        <Btn label="Refresh" onPress={() => loadAll({ consumeSelection: false })} loading={loading} small variant="ghost" />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={[styles.body, narrow && styles.bodyNarrow]}>
        <View style={[styles.queuePane, narrow && styles.queuePaneNarrow]}>
          <View style={styles.paneHeader}>
            <Text style={S.h2}>Queue</Text>
            <Text style={styles.smallMuted}>Draft a bunch, post one when ready.</Text>
          </View>
          {loading && !carousels.length ? (
            <View style={styles.center}>
              <ActivityIndicator color={C.accent} />
              <Text style={S.body}>Loading carousels...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.queueList}>
              {carousels.map(carousel => (
                <Pressable
                  key={carousel.id}
                  onPress={() => editCarousel(carousel)}
                  style={[styles.queueCard, builder?.id === carousel.id && styles.queueCardActive]}
                >
                  <View style={styles.queueTop}>
                    <Text style={styles.queueTitle} numberOfLines={1}>{carousel.title || "Untitled carousel"}</Text>
                    <View style={[styles.statusPill, styles[`status_${carousel.status}` as keyof typeof styles] as any]}>
                      <Text style={styles.statusText}>{statusLabel(carousel.status)}</Text>
                    </View>
                  </View>
                  <View style={styles.queueThumbs}>
                    {carousel.items.slice(0, 5).map(item => (
                      <RemoteImage
                        key={item.id}
                        uri={item.post?.publicUrl ?? ""}
                        width={96}
                        height={96}
                        transformResizeMode="contain"
                        style={styles.queueThumb}
                        resizeMode="contain"
                      />
                    ))}
                  </View>
                  {!!carousel.caption && <Text style={styles.queueCaption} numberOfLines={2}>{carousel.caption}</Text>}
                  {!!carousel.lastError && <Text style={styles.queueError} numberOfLines={2}>{carousel.lastError}</Text>}
                  <View style={styles.queueActions}>
                    <Btn
                      label="Download"
                      onPress={() => downloadCarousel(carousel.id)}
                      disabled={carousel.status === "posting"}
                      loading={downloadingId === carousel.id}
                      small
                      variant="outline"
                    />
                    {carousel.status !== "posted" && (
                      <Btn
                        label={carousel.status === "failed" ? "Retry" : "Post now"}
                        onPress={() => postNow(carousel.id)}
                        disabled={!instagramStatus?.publishEnabled || carousel.status === "posting"}
                        loading={busy && builder?.id === carousel.id}
                        small
                      />
                    )}
                    {carousel.status !== "posted" && (
                      <Btn label="Mark posted" onPress={() => markPosted(carousel.id)} small variant="ghost" />
                    )}
                    {carousel.permalink && (
                      <Btn label="Open" onPress={() => Linking.openURL(carousel.permalink!)} small variant="outline" />
                    )}
                    <Btn label="Copy" onPress={() => duplicate(carousel.id)} small variant="outline" />
                    <Btn label="Archive" onPress={() => archive(carousel.id)} small variant="ghost" />
                  </View>
                </Pressable>
              ))}
              {!carousels.length && !loading && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No carousel drafts yet.</Text>
                  <Text style={styles.emptyCopy}>Go to Library, select 5 posts, then create a carousel.</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        <ScrollView style={styles.editorPane} contentContainerStyle={styles.editorContent}>
          {!builder ? (
            <View style={styles.editorEmpty}>
              <Text style={styles.emptyTitle}>Select or create a carousel</Text>
              <Text style={styles.emptyCopy}>Your five slides, order, caption, and publish controls will appear here.</Text>
              <Btn label="Start blank carousel" onPress={newCarousel} small />
            </View>
          ) : (
            <>
              <View style={styles.editorHeader}>
                <View style={{ flex: 1, minWidth: 240 }}>
                  <Text style={S.label}>Title</Text>
                  <TextInput
                    value={builder.title}
                    onChangeText={title => updateBuilder({ title })}
                    placeholder="Carousel title"
                    placeholderTextColor={C.textMuted}
                    style={styles.titleInput}
                  />
                </View>
                <View style={[styles.statusPill, styles[`status_${builder.status}` as keyof typeof styles] as any]}>
                  <Text style={styles.statusText}>{statusLabel(builder.status)}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={S.h2}>Preview</Text>
                  <Text style={styles.smallMuted}>{builder.items.length}/{CAROUSEL_SIZE} slides</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewStrip}>
                  {builder.items.map((item, index) => (
                    <View key={item.id} style={styles.slideCard}>
                      <RemoteImage
                        uri={item.publicUrl}
                        width={360}
                        height={360}
                        transformResizeMode="contain"
                        style={styles.slideImage}
                        resizeMode="contain"
                        priority={index === 0}
                      />
                      <View style={styles.slideNumber}><Text style={styles.slideNumberText}>{index + 1}</Text></View>
                      <View style={styles.slideActions}>
                        <Btn label="Left" onPress={() => moveItem(index, -1)} disabled={index === 0} small variant="outline" />
                        <Btn label="Right" onPress={() => moveItem(index, 1)} disabled={index === builder.items.length - 1} small variant="outline" />
                        <Btn label="Replace" onPress={() => setReplaceIndex(index)} small variant={replaceIndex === index ? "primary" : "outline"} />
                        <Btn label="Remove" onPress={() => removeItem(index)} small variant="ghost" />
                      </View>
                    </View>
                  ))}
                  {Array.from({ length: Math.max(0, CAROUSEL_SIZE - builder.items.length) }).map((_, index) => (
                    <View key={`slot-${index}`} style={[styles.slideCard, styles.slideEmpty]}>
                      <Text style={styles.slideEmptyNumber}>{builder.items.length + index + 1}</Text>
                      <Text style={styles.smallMuted}>Choose a post below</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.section}>
                <Text style={S.label}>Instagram caption</Text>
                <TextInput
                  value={builder.caption}
                  onChangeText={caption => updateBuilder({ caption })}
                  multiline
                  placeholder="Write the carousel caption..."
                  placeholderTextColor={C.textMuted}
                  style={styles.captionInput}
                />
              </View>

              {builder.lastError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorTitle}>Last publish failed</Text>
                  <Text style={styles.errorCopy}>{builder.lastError}</Text>
                </View>
              )}

              <View style={styles.actionBar}>
                <Btn label="Save draft" onPress={() => saveBuilder("draft")} loading={busy} disabled={builder.items.length !== CAROUSEL_SIZE} variant="outline" />
                <Btn label="Mark ready" onPress={() => saveBuilder("ready")} loading={busy} disabled={builder.items.length !== CAROUSEL_SIZE} />
                <Btn
                  label="Download"
                  onPress={downloadBuilderCarousel}
                  loading={downloadingId === (builder.id ?? "new")}
                  disabled={builder.items.length !== CAROUSEL_SIZE}
                  variant="outline"
                />
                <Btn
                  label={builder.status === "failed" ? "Retry post" : "Post now"}
                  onPress={() => postNow(builder.id)}
                  loading={busy}
                  disabled={!instagramStatus?.publishEnabled || builder.items.length !== CAROUSEL_SIZE || builder.status === "posting" || builder.status === "posted"}
                />
                {builder.status !== "posted" && (
                  <Btn label="Mark posted" onPress={() => markPosted(builder.id)} loading={busy} disabled={builder.items.length !== CAROUSEL_SIZE} variant="ghost" />
                )}
                {builder.permalink && <Btn label="Open Instagram" onPress={() => Linking.openURL(builder.permalink!)} variant="outline" />}
              </View>

              {jobId && (
                <View style={styles.jobBox}>
                  <View style={styles.sectionHeader}>
                    <Text style={S.h2}>Publish log</Text>
                    <Text style={styles.smallMuted}>{job.running ? "running" : job.exitCode === 0 ? "done" : "failed"}</Text>
                  </View>
                  <ScrollView style={styles.jobLog} contentContainerStyle={styles.jobLogContent}>
                    {job.lines.map((line, index) => (
                      <Text key={`${index}-${line}`} style={styles.jobLine}>{line}</Text>
                    ))}
                    {!job.lines.length && <Text style={styles.jobLine}>Starting...</Text>}
                  </ScrollView>
                </View>
              )}

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={S.h2}>{replaceIndex === null ? "Add from Library" : `Replace slide ${replaceIndex + 1}`}</Text>
                  {replaceIndex !== null && <Btn label="Cancel replace" onPress={() => setReplaceIndex(null)} small variant="ghost" />}
                </View>
                <ScrollView contentContainerStyle={styles.libraryGrid}>
                  {availableImages.map(image => (
                    <Pressable key={image.id} onPress={() => addOrReplaceImage(image)} style={styles.libraryCell}>
                      <RemoteImage
                        uri={image.publicUrl}
                        width={180}
                        height={180}
                        transformResizeMode="contain"
                        style={styles.libraryThumb}
                        resizeMode="contain"
                      />
                    </Pressable>
                  ))}
                  {!availableImages.length && <Text style={S.body}>No more active Library posts available.</Text>}
                </ScrollView>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexWrap: "wrap",
  },
  error: { color: C.danger, paddingHorizontal: 20, paddingVertical: 10 },
  body: { flex: 1, flexDirection: "row" },
  bodyNarrow: { flexDirection: "column" },
  queuePane: {
    width: 390,
    borderRightWidth: 1,
    borderRightColor: C.border,
    backgroundColor: C.surface,
  },
  queuePaneNarrow: { width: "100%", maxHeight: 430, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: C.border },
  paneHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 },
  queueList: { padding: 12, gap: 10 },
  queueCard: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: 10,
    gap: 9,
  },
  queueCardActive: { borderColor: C.accent, backgroundColor: "#101a08" },
  queueTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  queueTitle: { flex: 1, color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  queueThumbs: { flexDirection: "row", gap: 5 },
  queueThumb: { width: 62, height: 62, borderRadius: 7, backgroundColor: C.surfaceHigh },
  queueCaption: { color: C.textSecondary, fontSize: 12, lineHeight: 16 },
  queueError: { color: C.danger, fontSize: 11, lineHeight: 15 },
  queueActions: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  editorPane: { flex: 1 },
  editorContent: { padding: 24, gap: 22 },
  editorEmpty: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
    flexWrap: "wrap",
  },
  titleInput: {
    marginTop: 8,
    color: C.textPrimary,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
  },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  previewStrip: { gap: 12, paddingBottom: 4 },
  slideCard: {
    width: 230,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  slideImage: { width: "100%", height: 230, backgroundColor: C.surfaceHigh },
  slideNumber: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  slideNumberText: { color: C.bg, fontSize: 12, fontWeight: "800" },
  slideActions: { flexDirection: "row", gap: 6, flexWrap: "wrap", padding: 8 },
  slideEmpty: {
    height: 288,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderStyle: "dashed",
  },
  slideEmptyNumber: { color: C.textMuted, fontSize: 30, fontWeight: "800" },
  captionInput: {
    minHeight: 130,
    color: C.textPrimary,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    paddingTop: 2,
  },
  libraryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 24 },
  libraryCell: {
    width: 86,
    height: 86,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  libraryThumb: { width: "100%", height: "100%" },
  integrationPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 440,
  },
  integrationPillOn: { borderColor: C.accentDim, backgroundColor: C.successDim },
  integrationText: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  integrationTextOn: { color: C.textPrimary },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusText: { color: C.textPrimary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  status_draft: { backgroundColor: C.surfaceHigh, borderColor: C.border },
  status_ready: { backgroundColor: C.successDim, borderColor: C.accentDim },
  status_posting: { backgroundColor: "#28300d", borderColor: C.accentDim },
  status_posted: { backgroundColor: "#113021", borderColor: C.success },
  status_failed: { backgroundColor: C.dangerDim, borderColor: C.danger },
  status_archived: { backgroundColor: C.surfaceHigh, borderColor: C.border },
  jobBox: { gap: 10 },
  jobLog: {
    maxHeight: 180,
    backgroundColor: "#050505",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  jobLogContent: { padding: 12, gap: 4 },
  jobLine: { color: C.textSecondary, fontSize: 11, fontFamily: "monospace" as any },
  errorBox: {
    borderWidth: 1,
    borderColor: C.danger,
    backgroundColor: C.dangerDim,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  errorTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  errorCopy: { color: C.textSecondary, fontSize: 12, lineHeight: 17 },
  emptyState: { alignItems: "center", justifyContent: "center", gap: 8, padding: 30 },
  emptyTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  emptyCopy: { color: C.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },
  center: { alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  smallMuted: { color: C.textMuted, fontSize: 12 },
});
