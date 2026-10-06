import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Linking,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api, InstagramCarousel, InstagramStatus, StorageImage } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";
import { useJobStream } from "../lib/useJobStream";
import { RemoteImage } from "../components/RemoteImage";

const CAROUSEL_SELECTION_KEY = "glance.carouselDraftSelection";
const CAROUSEL_SIZE = 5;
const DEFAULT_CAPTION = "little reminders for your lock screen\n.\n.\n.\nsomething to glance at when life gets loud";

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

export default function CarouselWorkspace({ mode }: { mode: "queue" | "editor" }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditor = mode === "editor";

  const [images, setImages] = useState<StorageImage[]>([]);
  const [carousels, setCarousels] = useState<InstagramCarousel[]>([]);
  const [instagramStatus, setInstagramStatus] = useState<InstagramStatus | null>(null);
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
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
      setCarousels(carouselRes.carousels.filter(carousel => carousel.status !== "posted"));
      setBuilder(current => {
        const saved = carouselRes.carousels.find(carousel => carousel.id === current?.id);
        return saved?.status === "posted" ? null : current;
      });
      setInstagramStatus(statusRes);

      if (consumeSelection && isEditor && id) {
        const { carousel } = await api.carousel(id);
        setBuilder(carouselToBuilder(carousel));
        setReplaceIndex(null);
      } else if (consumeSelection && isEditor && typeof window !== "undefined") {
        setBuilder(current => current ?? {
          title: `Carousel ${new Date().toLocaleDateString()}`,
          caption: DEFAULT_CAPTION,
          status: "draft",
          items: [],
        });
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
              caption: DEFAULT_CAPTION,
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
  }, [isEditor, id]));

  useEffect(() => {
    if (jobId && job.done) void loadAll({ consumeSelection: false });
  }, [jobId, job.done]);

  function newCarousel() {
    if (!isEditor) {
      router.push("/carousel-editor");
      return;
    }
    if (id) router.setParams({ id: undefined });
    setJobId(null);
    setBuilder({
      title: `Carousel ${new Date().toLocaleDateString()}`,
      caption: DEFAULT_CAPTION,
      status: "draft",
      items: [],
    });
    setReplaceIndex(null);
  }

  function editCarousel(carousel: InstagramCarousel) {
    router.push({ pathname: "/carousel-editor", params: { id: carousel.id } });
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
        caption: DEFAULT_CAPTION,
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

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>{isEditor ? "Carousel editor" : "Carousel queue"}</Text>
        {!isEditor && <Text style={[S.body, { marginLeft: 8 }]}>{carousels.length} queued</Text>}
        <View style={{ flex: 1 }} />
        {isEditor && <Btn label="View queue" onPress={() => router.push("/carousels")} small variant="outline" />}
        <Btn label="New carousel" onPress={newCarousel} small />
        <Btn label="Refresh" onPress={() => loadAll({ consumeSelection: false })} loading={loading} small variant="ghost" />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.body}>
        {!isEditor && <View style={styles.queuePane}>
          <View style={styles.paneHeader}>
            <Text style={S.h2}>Queue</Text>
            <Text style={styles.smallMuted}>Saved drafts and ready carousels. Open one to edit or publish it here.</Text>
          </View>
          {loading && !carousels.length ? (
            <View style={styles.center}>
              <ActivityIndicator color={C.accent} />
              <Text style={S.body}>Loading carousels...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.queueList}>
              {carousels.map(carousel => (
                <View
                  key={carousel.id}
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
                    <Btn label="Edit" onPress={() => editCarousel(carousel)} small variant="outline" />
                    <Btn label="Archive" onPress={() => archive(carousel.id)} small variant="ghost" />
                    {carousel.permalink && (
                      <Btn label="Open" onPress={() => Linking.openURL(carousel.permalink!)} small variant="outline" />
                    )}
                    <View style={{ flex: 1 }} />
                    {carousel.status !== "posted" && (
                      <Btn
                        label={carousel.status === "failed" ? "Retry" : "Post now"}
                        onPress={() => postNow(carousel.id)}
                        disabled={!instagramStatus?.publishEnabled || carousel.status === "posting"}
                        loading={busy && builder?.id === carousel.id}
                        small
                      />
                    )}
                  </View>
                </View>
              ))}
              {!carousels.length && !loading && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No carousels in the queue.</Text>
                  <Text style={styles.emptyCopy}>Go to Library, select 5 posts, then create a carousel.</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>}

        {isEditor && <ScrollView style={styles.editorPane} contentContainerStyle={styles.editorContent}>
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
                <Btn label="Mark ready" onPress={async () => {
                  const saved = await saveBuilder("ready");
                  if (saved) newCarousel();
                }} loading={busy} disabled={builder.items.length !== CAROUSEL_SIZE} />
                <Btn
                  label={builder.status === "failed" ? "Retry post" : "Post now"}
                  onPress={() => postNow()}
                  loading={busy}
                  disabled={!instagramStatus?.publishEnabled || builder.items.length !== CAROUSEL_SIZE || builder.status === "posting" || builder.status === "posted"}
                />
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
        </ScrollView>}
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
  queuePane: {
    flex: 1,
    backgroundColor: C.surface,
  },
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
