import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image, Pressable, ActivityIndicator,
} from "react-native";
import { API_BASE, api, Draft } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";
import { WidgetSmall } from "../components/iPhoneMockup/WidgetSmall";
import { WidgetMedium } from "../components/iPhoneMockup/WidgetMedium";
import { WidgetLarge } from "../components/iPhoneMockup/WidgetLarge";

type Screen = "grid" | "review";

export default function DraftsScreen() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("grid");
  const [reviewIdx, setReviewIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { drafts: d } = await api.drafts();
      setDrafts(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openReview(startIdx = 0) {
    setReviewIdx(startIdx);
    setScreen("review");
  }

  function advance(fromDrafts: Draft[]) {
    if (reviewIdx < fromDrafts.length - 1) {
      setReviewIdx(i => i + 1);
    } else {
      setScreen("grid");
      load();
    }
  }

  async function removeCurrent(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      const id = drafts[reviewIdx].id;
      const next = drafts.filter(d => d.id !== id);
      setDrafts(next);
      if (next.length === 0) { setScreen("grid"); load(); }
      else setReviewIdx(i => Math.min(i, next.length - 1));
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  function publishCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;
    return removeCurrent(() => api.publishDraft({ id: draft.id }).then(() => {}));
  }

  function saveInactiveCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;
    return removeCurrent(() => api.publishDraft({ id: draft.id, status: "inactive" }).then(() => {}));
  }

  function discardCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;
    return removeCurrent(() => api.discardDraft({ id: draft.id }).then(() => {}));
  }

  function skipCurrent() {
    advance(drafts);
  }

  // ── Review mode ────────────────────────────────────────────────────────────
  if (screen === "review") {
    const draft = drafts[reviewIdx];
    if (!draft) {
      return (
        <View style={styles.root}>
          <View style={styles.reviewHeader}>
            <Pressable onPress={() => setScreen("grid")} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
            <Text style={S.body}>No drafts to review</Text>
          </View>
        </View>
      );
    }

    const imgUri = `${API_BASE}/content/drafts/${draft.filename}`;
    const caption = draft.meta?.caption ?? null;
    const scene = draft.meta?.scene;

    return (
      <View style={styles.root}>
        {/* Review header */}
        <View style={styles.reviewHeader}>
          <Pressable onPress={() => setScreen("grid")} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Drafts</Text>
          </Pressable>
          <Text style={styles.reviewCounter}>
            {reviewIdx + 1} <Text style={{ color: C.textMuted }}>/ {drafts.length}</Text>
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setReviewIdx(i => Math.max(0, i - 1))}
            style={[styles.navArrow, reviewIdx === 0 && styles.navArrowDisabled]}
            disabled={reviewIdx === 0}
          >
            <Text style={styles.navArrowText}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => setReviewIdx(i => Math.min(drafts.length - 1, i + 1))}
            style={[styles.navArrow, reviewIdx === drafts.length - 1 && styles.navArrowDisabled]}
            disabled={reviewIdx === drafts.length - 1}
          >
            <Text style={styles.navArrowText}>›</Text>
          </Pressable>
        </View>

        {/* Main review area */}
        <View style={styles.reviewBody}>
          {/* Widget previews — all three in a single centered row */}
          <View style={styles.previewArea}>
            <View style={styles.previewRow}>
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Large</Text>
                <WidgetLarge imageUri={imgUri} />
              </View>
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Small</Text>
                <WidgetSmall imageUri={imgUri} />
              </View>
              <View style={styles.previewBlock}>
                <Text style={styles.previewLabel}>Medium</Text>
                <WidgetMedium imageUri={imgUri} />
              </View>
            </View>
          </View>

          {/* Metadata panel */}
          <View style={styles.metaPanel}>
            <Text style={styles.metaTitle}>Metadata</Text>

            {caption ? (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Caption</Text>
                <Text style={styles.captionSmall}>{caption.smallText}</Text>
                <Text style={styles.captionBig}>{caption.bigText}</Text>
              </View>
            ) : (
              <Text style={styles.metaMissing}>No caption</Text>
            )}

            {scene && (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Scene</Text>
                {scene.subject && <Text style={styles.metaValue}>{scene.subject}</Text>}
                {scene.setting && <Text style={styles.metaValueMuted}>{scene.setting}</Text>}
                {scene.mood && <Text style={styles.metaValueMuted}>{scene.mood}</Text>}
                {scene.style && <Text style={styles.metaValueMuted}>{scene.style}</Text>}
              </View>
            )}

            {draft.meta?.imageModel && (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Model</Text>
                <Text style={styles.metaValue}>{draft.meta.imageModel}</Text>
              </View>
            )}

            {draft.meta?.generatedAt && (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Generated</Text>
                <Text style={styles.metaValue}>
                  {new Date(draft.meta.generatedAt).toLocaleString()}
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }} />

            <View style={styles.thumbSmall}>
              <Image source={{ uri: imgUri }} style={styles.thumbImg} resizeMode="cover" />
            </View>
          </View>
        </View>

        {/* Action bar */}
        <View style={styles.actionBar}>
          <Btn label="← Grid" onPress={() => setScreen("grid")} small variant="ghost" />
          <View style={{ flex: 1 }} />
          <Btn label="Skip →" onPress={skipCurrent} small variant="ghost" />
          <Btn label="Save Inactive" onPress={saveInactiveCurrent} loading={busy} small variant="outline" />
          <Btn label="Publish" onPress={publishCurrent} loading={busy} small />
          <Btn label="Delete" onPress={discardCurrent} loading={busy} small variant="danger" />
        </View>
      </View>
    );
  }

  // ── Grid mode ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Drafts</Text>
        {!loading && drafts.length > 0 && (
          <Text style={[S.body, { marginLeft: 6 }]}>{drafts.length} ready</Text>
        )}
        <View style={{ flex: 1 }} />
        {drafts.length > 0 && (
          <Btn label="Review" onPress={() => openReview(0)} small />
        )}
        <Pressable onPress={load} style={styles.refreshBtn} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={C.textMuted} />
            : <Text style={styles.refreshIcon}>↺</Text>
          }
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.grid}>
        {loading && !drafts.length ? (
          <View style={{ padding: 40 }}><ActivityIndicator color={C.accent} /></View>
        ) : drafts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No drafts</Text>
            <Text style={[S.body, { textAlign: "center" }]}>
              Run Generate to create posters.
            </Text>
          </View>
        ) : (
          drafts.map((draft, idx) => {
            const caption = draft.meta?.caption;
            const imgUri = `${API_BASE}/content/drafts/${draft.filename}`;
            return (
              <Pressable
                key={draft.id}
                onPress={() => openReview(idx)}
                style={styles.card}
              >
                <Image source={{ uri: imgUri }} style={styles.img} resizeMode="cover" />
                <View style={styles.cardInfo}>
                  {caption ? (
                    <>
                      <Text style={styles.captionSmall}>{caption.smallText}</Text>
                      <Text style={styles.captionBig} numberOfLines={2}>{caption.bigText}</Text>
                    </>
                  ) : (
                    <Text style={styles.captionSmall}>No caption</Text>
                  )}
                  {draft.meta?.scene?.subject && (
                    <Text style={styles.scene} numberOfLines={1}>
                      {draft.meta.scene.subject}
                      {draft.meta.scene.setting ? ` · ${draft.meta.scene.setting}` : ""}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Grid toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshIcon: { color: C.textSecondary, fontSize: 16 },
  error: { color: C.danger, padding: 16 },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 14,
  },
  empty: { padding: 40, alignItems: "center", gap: 10 },
  emptyTitle: { color: C.textSecondary, fontSize: 18, fontWeight: "700" },
  card: {
    width: 200,
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  img: { width: "100%", height: 200 },
  cardInfo: { padding: 10, gap: 2 },
  captionSmall: { color: C.textSecondary, fontSize: 11, fontWeight: "300" },
  captionBig: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  scene: { color: C.textMuted, fontSize: 10, marginTop: 2 },

  // Review header
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: C.surfaceHigh,
  },
  backBtnText: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  reviewCounter: { color: C.textPrimary, fontSize: 15, fontWeight: "600" },
  navArrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  navArrowDisabled: { opacity: 0.3 },
  navArrowText: { color: C.textPrimary, fontSize: 20, lineHeight: 24 },

  // Review body
  reviewBody: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  previewArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "center",
    transform: [{ scale: 0.72 }],
    // Compensate for layout space that scale() doesn't collapse:
    // WidgetLarge is 329px tall → visual 237px → excess 92px → -46 each side
    marginVertical: -46,
  },
  previewBlock: {
    gap: 8,
    alignItems: "center",
  },
  previewLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Metadata panel
  metaPanel: {
    width: 220,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
    backgroundColor: C.surface,
    padding: 18,
    gap: 0,
    flexShrink: 0,
  },
  metaTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  metaSection: {
    marginBottom: 16,
    gap: 3,
  },
  metaLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  metaValue: { color: C.textPrimary, fontSize: 12, lineHeight: 17 },
  metaValueMuted: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
  metaMissing: { color: C.textMuted, fontSize: 12, fontStyle: "italic", marginBottom: 16 },

  thumbSmall: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 12,
  },
  thumbImg: { width: "100%", height: "100%" },

  // Action bar
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
});
