import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Image, Platform, useWindowDimensions,
} from "react-native";
import { NavArrowLeft, NavArrowRight, RefreshDouble, Trash } from "iconoir-react-native";
import { API_BASE, api, Draft } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";
import { WidgetSmall } from "../components/iPhoneMockup/WidgetSmall";
import { WidgetMedium } from "../components/iPhoneMockup/WidgetMedium";
import { WidgetLarge } from "../components/iPhoneMockup/WidgetLarge";
import { previewImageUrl, RemoteImage } from "../components/RemoteImage";
import { CaptionEditor } from "../components/CaptionEditor";
import { CaptionLayout, CaptionText, MediumCaptionLayout } from "../lib/captionLayout";
import { ActionKey } from "../components/ActionKey";

type Screen = "grid" | "review" | "edit";

const GRID_PADDING = 16;
const GRID_GAP = 10;
const MIN_GRID_CELL = 220;
const MAX_GRID_CELL = 320;

function draftImageUri(draft: Draft, width: number) {
  if (draft.imageUrl) return previewImageUrl(draft.imageUrl, width);
  return `${API_BASE}/content/drafts/${draft.filename}`;
}

function draftGridImageUri(draft: Draft) {
  if (draft.imageUrl) return draft.imageUrl;
  return `${API_BASE}/content/drafts/${draft.filename}`;
}

function draftBackgroundUri(draft: Draft) {
  if (draft.rawImageUrl) return draft.rawImageUrl;
  const base = draft.filename.replace(/\.png$/i, "");
  return `${API_BASE}/content/backgrounds/${base}.png`;
}

function normalizeCaption(caption: CaptionText): CaptionText {
  return {
    smallText: caption.smallText.trim().toLowerCase(),
    bigText: caption.bigText.trim().toLowerCase(),
  };
}

export default function DraftsScreen() {
  const { width } = useWindowDimensions();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("grid");
  const [reviewIdx, setReviewIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftEditCaption, setDraftEditCaption] = useState<CaptionText | null>(null);
  const gridViewportWidth = Math.max(
    320,
    width - (Platform.OS === "web" && width > 600 ? C.sidebarW : 0) - GRID_PADDING * 2
  );
  const maxGridColumns = Math.max(1, Math.floor((gridViewportWidth + GRID_GAP) / (MIN_GRID_CELL + GRID_GAP)));
  const gridColumns = drafts.length > 0 ? Math.min(drafts.length, maxGridColumns) : maxGridColumns;
  const gridCell = Math.min(
    MAX_GRID_CELL,
    Math.floor((gridViewportWidth - GRID_GAP * (gridColumns - 1)) / gridColumns)
  );

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
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;

    setBusy(true);
    setError(null);
    try {
      await action();
      const next = drafts.filter(d => d.id !== draft.id);
      setDrafts(next);
      if (next.length === 0) setScreen("grid");
      else setReviewIdx(i => Math.min(i, next.length - 1));
      if (next.length === 0) load();
    } catch (e: any) {
      await load();
      setScreen("grid");
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function publishCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;
    return removeCurrent(() => api.publishDraft({ id: draft.id }).then(() => {}));
  }

  function saveInactiveCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;
    return removeCurrent(() =>
      api.publishDraft({ id: draft.id, status: "inactive" }).then(() => {})
    );
  }

  function discardCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft || busy) return;
    return removeCurrent(() => api.discardDraft({ id: draft.id }).then(() => {}));
  }

  function skipCurrent() {
    advance(drafts);
  }

  function previousDraft() {
    setReviewIdx((i) => Math.max(0, i - 1));
  }

  function nextDraft() {
    setReviewIdx((i) => Math.min(drafts.length - 1, i + 1));
  }

  function openEditCurrent() {
    const draft = drafts[reviewIdx];
    if (!draft?.meta?.caption || busy) return;
    setDraftEditCaption(draft.meta.caption);
    setScreen("edit");
  }

  async function applyCaptionLayout(layout: CaptionLayout, mediumLayout: MediumCaptionLayout) {
    const draft = drafts[reviewIdx];
    if (!draft?.meta?.caption) return;
    const nextCaption = normalizeCaption(draftEditCaption ?? draft.meta.caption);

    let result;
    try {
      result = await api.renderDraftCaption({
        id: draft.id,
        layout,
        mediumLayout,
        caption: nextCaption,
      });
    } catch (e: any) {
      const msg = e?.message === "Not found"
        ? "Caption save failed — restart the backend admin server (npm run admin in backend/) and try again."
        : e?.message ?? "Failed to save caption";
      alert(msg);
      throw e;
    }

    const bustedUrl = `${result.imageUrl}${result.imageUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draft.id
          ? {
              ...d,
              imageUrl: bustedUrl,
              meta: {
                ...d.meta,
                caption: result.caption,
                captionLayout: {
                  xRatio: result.captionLayout.xRatio,
                  yRatio: result.captionLayout.yRatio,
                  textColor: result.captionLayout.textColor === "#ffffff" ? "#ffffff" : "#050505",
                  fontScale: result.captionLayout.fontScale,
                  smallFontScale: result.captionLayout.smallFontScale,
                  bigFontScale: result.captionLayout.bigFontScale,
                  textSizeMode: result.captionLayout.textSizeMode,
                },
                mediumCaptionLayout: result.mediumCaptionLayout,
                mediumImageUrl: result.mediumImageUrl,
              },
            }
          : d
      )
    );
    setDraftEditCaption(null);
    setScreen("review");
  }

  // Keyboard shortcuts for review mode (i=inactive, p=publish, s=skip, d=delete, e=edit)
  useEffect(() => {
    if (screen !== "review" || typeof document === "undefined") return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const draft = drafts[reviewIdx];
      const hasCaption = Boolean(draft?.meta?.caption?.smallText && draft?.meta?.caption?.bigText);
      if (e.key === "i" && hasCaption) saveInactiveCurrent();
      else if (e.key === "p" && hasCaption) publishCurrent();
      else if (e.key === "ArrowLeft") {
        e.preventDefault();
        previousDraft();
      }
      else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextDraft();
      }
      else if (e.key === "s") skipCurrent();
      else if (e.key === "d") discardCurrent();
      else if (e.key === "e" && hasCaption) openEditCurrent();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen, reviewIdx, drafts, busy]);

  // ── Caption editor ─────────────────────────────────────────────────────────
  if (screen === "edit") {
    const draft = drafts[reviewIdx];
    const caption = draftEditCaption ?? draft?.meta?.caption;
    if (!draft || !caption) {
      return (
        <View style={styles.root}>
          <View style={styles.reviewHeader}>
            <Pressable onPress={() => setScreen("review")} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Review</Text>
            </Pressable>
            <Text style={S.body}>No caption to edit</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <View style={styles.reviewHeader}>
          <Pressable onPress={() => setScreen("review")} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Review</Text>
          </Pressable>
          <Text style={styles.reviewCounter}>Edit caption</Text>
          <Text style={[S.body, { color: C.textMuted }]}>
            {reviewIdx + 1} / {drafts.length}
          </Text>
        </View>
        <CaptionEditor
          backgroundUri={draftBackgroundUri(draft)}
          caption={caption}
          initialLayout={draft.meta?.captionLayout}
          initialMediumLayout={draft.meta?.mediumCaptionLayout}
          onCaptionChange={setDraftEditCaption}
          onApply={applyCaptionLayout}
          onCancel={() => {
            setDraftEditCaption(null);
            setScreen("review");
          }}
        />
      </View>
    );
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

    const imgUri = draftImageUri(draft, 1024);
    const mediumImgUri = draft.meta?.mediumImageUrl
      ? previewImageUrl(draft.meta.mediumImageUrl, 1024)
      : imgUri;
    const caption = draft.meta?.caption ?? null;
    const hasCaption = Boolean(caption?.smallText && caption?.bigText);
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
            onPress={previousDraft}
            style={[styles.navArrow, reviewIdx === 0 && styles.navArrowDisabled]}
            disabled={reviewIdx === 0}
          >
            <NavArrowLeft color={C.textSecondary} width={16} height={16} />
          </Pressable>
          <Pressable
            onPress={nextDraft}
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
                <WidgetMedium imageUri={mediumImgUri} />
              </View>
            </View>
          </View>

          {/* Metadata panel */}
          <View style={styles.metaPanel}>
            <Text style={styles.metaTitle}>Metadata</Text>

            {hasCaption && caption ? (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Caption</Text>
                <Text style={styles.captionLine}>{caption.smallText}</Text>
                <Text style={styles.captionLine}>{caption.bigText}</Text>
                <Btn label="Edit caption" onPress={openEditCurrent} small variant="outline" />
              </View>
            ) : (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Status</Text>
                <Text style={styles.metaMissing}>No caption</Text>
              </View>
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

        {/* Action bar — keyboard: e=edit i=inactive p=publish s=skip d=delete */}
        <View style={styles.actionBar}>
          <View style={{ flex: 1 }} />
          {hasCaption && (
            <ActionKey label="Edit" keyHint="E" onPress={openEditCurrent} variant="outline" />
          )}
          {hasCaption && (
            <ActionKey label="Inactive" keyHint="I" onPress={saveInactiveCurrent} loading={busy} variant="outline" />
          )}
          {hasCaption && (
            <ActionKey label="Publish" keyHint="P" onPress={publishCurrent} loading={busy} variant="primary" />
          )}
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
              Approved backgrounds will appear here.
            </Text>
          </View>
        ) : (
          drafts.map((draft, idx) => {
            const imgUri = draftGridImageUri(draft);
            return (
              <Pressable
                key={draft.id}
                onPress={() => openReview(idx)}
                style={[styles.cell, { width: gridCell, height: gridCell }]}
              >
                <RemoteImage
                  uri={imgUri}
                  width={gridCell * 1.5}
                  height={gridCell * 1.5}
                  transformResizeMode="contain"
                  style={styles.thumb}
                  resizeMode="contain"
                  priority={idx < gridColumns}
                />
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
  error: { color: C.danger, padding: 16 },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: GRID_PADDING,
    gap: GRID_GAP,
  },
  empty: { padding: 40, alignItems: "center", gap: 10 },
  emptyTitle: { color: C.textSecondary, fontSize: 18, fontWeight: "700" },
  cell: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  thumb: { width: "100%", height: "100%", backgroundColor: C.bg },
  captionLine: { color: C.textPrimary, fontSize: 13, fontWeight: "500", lineHeight: 19 },

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
