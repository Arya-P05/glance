import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image, Pressable, ActivityIndicator,
} from "react-native";
import { NavArrowLeft, NavArrowRight, RefreshDouble, Trash } from "iconoir-react-native";
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

  // Keyboard shortcuts for review mode (i=inactive, p=publish, s=skip, d=delete)
  useEffect(() => {
    if (screen !== "review" || typeof document === "undefined") return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "i") saveInactiveCurrent();
      else if (e.key === "p") publishCurrent();
      else if (e.key === "s") skipCurrent();
      else if (e.key === "d") discardCurrent();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen, reviewIdx, drafts, busy]);

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
            <NavArrowLeft color={C.textSecondary} width={16} height={16} />
          </Pressable>
          <Pressable
            onPress={() => setReviewIdx(i => Math.min(drafts.length - 1, i + 1))}
            style={[styles.navArrow, reviewIdx === drafts.length - 1 && styles.navArrowDisabled]}
            disabled={reviewIdx === drafts.length - 1}
          >
            <NavArrowRight color={C.textSecondary} width={16} height={16} />
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
                <Text style={styles.captionLine}>{caption.smallText}</Text>
                <Text style={styles.captionLine}>{caption.bigText}</Text>
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
          </View>
        </View>

        {/* Action bar — keyboard: i=inactive p=publish s=skip d=delete */}
        <View style={styles.actionBar}>
          <View style={{ flex: 1 }} />
          <ActionKey label="Inactive" keyHint="I" onPress={saveInactiveCurrent} loading={busy} variant="outline" />
          <ActionKey label="Publish" keyHint="P" onPress={publishCurrent} loading={busy} variant="primary" />
          <ActionKey label="Skip" keyHint="S" onPress={skipCurrent} variant="outline" />
          <ActionKey keyHint="D" onPress={discardCurrent} loading={busy} variant="danger"
            icon={<Trash color="#fff" width={20} height={20} strokeWidth={1.8} />} />
          <View style={{ flex: 1 }} />
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
            : <RefreshDouble color={C.textSecondary} width={16} height={16} />
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
                      <Text style={styles.gridCaption}>{caption.smallText}</Text>
                      <Text style={[styles.gridCaption, { fontWeight: "600" }]} numberOfLines={2}>{caption.bigText}</Text>
                    </>
                  ) : (
                    <Text style={styles.gridCaption}>No caption</Text>
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

// Large action button with a keyboard hint badge
function ActionKey({
  label, keyHint, onPress, loading, variant = "outline", icon,
}: {
  label?: string; keyHint: string; onPress: () => void;
  loading?: boolean; variant?: "primary" | "outline" | "ghost" | "danger";
  icon?: React.ReactNode;
}) {
  const bg =
    variant === "primary" ? C.accent :
    variant === "danger"  ? C.danger :
    C.surface;
  const textColor =
    variant === "primary" ? C.bg :
    variant === "danger"  ? "#fff" :
    C.textSecondary;
  const borderColor =
    variant === "primary" ? C.accent :
    variant === "danger"  ? C.danger :
    C.border;

  // On light backgrounds (primary/lime), use dark hint; on dark/colored, use light
  const hintBg = variant === "primary" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
  const hintColor = variant === "primary" ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.8)";

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={[akStyles.btn, { backgroundColor: bg, borderColor, opacity: loading ? 0.5 : 1 }]}
    >
      {icon ?? <Text style={[akStyles.label, { color: textColor }]}>{label}</Text>}
      <View style={[akStyles.hint, { backgroundColor: hintBg }]}>
        <Text style={[akStyles.hintText, { color: hintColor }]}>{keyHint}</Text>
      </View>
    </Pressable>
  );
}

const akStyles = StyleSheet.create({
  btn: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  label: { fontWeight: "700", letterSpacing: 0.3 },
  hint: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hintText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
});

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
  refreshIcon: { color: C.textSecondary, fontSize: 16 }, // kept as fallback
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
  captionLine: { color: C.textPrimary, fontSize: 13, fontWeight: "500", lineHeight: 19 },
  gridCaption: { color: C.textSecondary, fontSize: 12, lineHeight: 17 },
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
    gap: 24,
    alignItems: "center",
    transform: [{ scale: 0.95 }],
    // WidgetLarge is 329px tall → visual 312px → excess 17px → -8 each side
    marginVertical: -8,
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

  // Action bar
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 32,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
});
