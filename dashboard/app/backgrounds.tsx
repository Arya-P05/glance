import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform, TextInput, useWindowDimensions,
} from "react-native";
import { NavArrowLeft, NavArrowRight, RefreshDouble, Trash } from "iconoir-react-native";
import { API_BASE, api, Draft } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";
import { WidgetSmall } from "../components/iPhoneMockup/WidgetSmall";
import { WidgetMedium } from "../components/iPhoneMockup/WidgetMedium";
import { WidgetLarge } from "../components/iPhoneMockup/WidgetLarge";
import { previewImageUrl, RemoteImage } from "../components/RemoteImage";
import { ActionKey } from "../components/ActionKey";

type Screen = "grid" | "review";

const GRID_PADDING = 16;
const GRID_GAP = 10;
const MIN_GRID_CELL = 220;

function backgroundImageUri(background: Draft, width: number) {
  if (background.rawImageUrl) return previewImageUrl(background.rawImageUrl, width);
  if (background.imageUrl) return previewImageUrl(background.imageUrl, width);
  return `${API_BASE}/content/backgrounds/${background.filename}`;
}

function backgroundGridImageUri(background: Draft) {
  if (background.rawImageUrl) return background.rawImageUrl;
  if (background.imageUrl) return background.imageUrl;
  return `${API_BASE}/content/backgrounds/${background.filename}`;
}

export default function BackgroundsScreen() {
  const { width } = useWindowDimensions();
  const [backgrounds, setBackgrounds] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("grid");
  const [reviewIdx, setReviewIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tweakInstruction, setTweakInstruction] = useState("");
  const discardLockRef = useRef(false);
  const gridViewportWidth = Math.max(
    320,
    width - (Platform.OS === "web" && width > 600 ? C.sidebarW : 0) - GRID_PADDING * 2
  );
  const gridColumns = Math.max(1, Math.floor((gridViewportWidth + GRID_GAP) / (MIN_GRID_CELL + GRID_GAP)));
  const gridCell = Math.floor((gridViewportWidth - GRID_GAP * (gridColumns - 1)) / gridColumns);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { backgrounds: b } = await api.backgrounds();
      setBackgrounds(b);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (screen !== "review" || typeof document === "undefined") return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a") approveCurrent();
      else if (e.key === "ArrowLeft") {
        e.preventDefault();
        previousBackground();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextBackground();
      } else if (e.key === "s") skipCurrent();
      else if (e.key === "d" && !e.repeat) discardCurrent();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen, reviewIdx, backgrounds, busy]);

  function openReview(startIdx = 0) {
    setReviewIdx(startIdx);
    setScreen("review");
  }

  function previousBackground() {
    setReviewIdx((i) => Math.max(0, i - 1));
  }

  function nextBackground() {
    setReviewIdx((i) => Math.min(backgrounds.length - 1, i + 1));
  }

  function skipCurrent() {
    if (reviewIdx < backgrounds.length - 1) setReviewIdx(i => i + 1);
    else setScreen("grid");
  }

  async function discardCurrent() {
    const background = backgrounds[reviewIdx];
    if (!background || busy || discardLockRef.current) return;

    discardLockRef.current = true;
    const id = background.id;
    setBusy(true);
    try {
      await api.discardBackground({ id, dbId: background.dbId });
      const nextLength = Math.max(0, backgrounds.length - 1);
      setBackgrounds(prev => prev.filter(b => b.id !== id));
      if (nextLength === 0) setScreen("grid");
      else setReviewIdx(i => Math.min(i, nextLength - 1));
      if (nextLength === 0) load();
    } catch (e: any) {
      await load();
      setScreen("grid");
      alert(e.message);
    } finally {
      setBusy(false);
      discardLockRef.current = false;
    }
  }

  async function approveCurrent() {
    const background = backgrounds[reviewIdx];
    if (!background || busy) return;

    const id = background.id;
    setBusy(true);
    try {
      await api.stageBackground({ id, dbId: background.dbId });
      const nextLength = Math.max(0, backgrounds.length - 1);
      setBackgrounds(prev => prev.filter(item => item.id !== id));
      if (nextLength === 0) setScreen("grid");
      else setReviewIdx(i => Math.min(i, nextLength - 1));
      if (nextLength === 0) load();
    } catch (e: any) {
      await load();
      setScreen("grid");
      alert(e?.message ?? "Failed to approve background");
    } finally {
      setBusy(false);
    }
  }

  async function reviseCurrentBackground() {
    const background = backgrounds[reviewIdx];
    const instruction = tweakInstruction.trim();
    if (!background || busy || !instruction) return;

    setBusy(true);
    try {
      const result = await api.reviseBackground({ id: background.id, instruction });
      const insertAt = reviewIdx + 1;
      setBackgrounds(prev => {
        const next = prev.filter(item => item.id !== result.background.id);
        next.splice(Math.min(insertAt, next.length), 0, result.background);
        return next;
      });
      setReviewIdx(insertAt);
      setTweakInstruction("");
    } catch (e: any) {
      alert(e?.message ?? "Failed to tweak background");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "review") {
    const background = backgrounds[reviewIdx];
    if (!background) {
      return (
        <View style={styles.root}>
          <View style={styles.reviewHeader}>
            <Pressable onPress={() => setScreen("grid")} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
            <Text style={S.body}>No backgrounds to review</Text>
          </View>
        </View>
      );
    }

    const imgUri = backgroundImageUri(background, 1024);
    const scene = background.meta?.scene;

    return (
      <View style={styles.root}>
        <View style={styles.reviewHeader}>
          <Pressable onPress={() => setScreen("grid")} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Backgrounds</Text>
          </Pressable>
          <Text style={styles.reviewCounter}>
            {reviewIdx + 1} <Text style={{ color: C.textMuted }}>/ {backgrounds.length}</Text>
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={previousBackground}
            style={[styles.navArrow, reviewIdx === 0 && styles.navArrowDisabled]}
            disabled={reviewIdx === 0}
          >
            <NavArrowLeft color={C.textSecondary} width={16} height={16} />
          </Pressable>
          <Pressable
            onPress={nextBackground}
            style={[styles.navArrow, reviewIdx === backgrounds.length - 1 && styles.navArrowDisabled]}
            disabled={reviewIdx === backgrounds.length - 1}
          >
            <NavArrowRight color={C.textSecondary} width={16} height={16} />
          </Pressable>
        </View>

        <View style={styles.reviewBody}>
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

          <View style={styles.metaPanel}>
            <Text style={styles.metaTitle}>Metadata</Text>
            <View style={styles.metaSection}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaMissing}>Pending background</Text>
            </View>
            {scene && (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Scene</Text>
                {scene.subject && <Text style={styles.metaValue}>{scene.subject}</Text>}
                {scene.setting && <Text style={styles.metaValueMuted}>{scene.setting}</Text>}
                {scene.mood && <Text style={styles.metaValueMuted}>{scene.mood}</Text>}
                {scene.style && <Text style={styles.metaValueMuted}>{scene.style}</Text>}
              </View>
            )}
            {background.meta?.imageModel && (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Model</Text>
                <Text style={styles.metaValue}>{background.meta.imageModel}</Text>
              </View>
            )}
            {background.meta?.generatedAt && (
              <View style={styles.metaSection}>
                <Text style={styles.metaLabel}>Generated</Text>
                <Text style={styles.metaValue}>
                  {new Date(background.meta.generatedAt).toLocaleString()}
                </Text>
              </View>
            )}
            <View style={styles.tweakPanel}>
              <Text style={styles.metaLabel}>Tweak image</Text>
              <Text style={styles.tweakHint}>Make one small edit and keep this frame.</Text>
              <TextInput
                value={tweakInstruction}
                onChangeText={setTweakInstruction}
                placeholder="no open mouth"
                placeholderTextColor={C.textMuted}
                multiline
                editable={!busy}
                textAlignVertical="top"
                style={styles.tweakInput}
              />
              <Btn
                label="Generate tweak"
                onPress={reviseCurrentBackground}
                loading={busy}
                disabled={!tweakInstruction.trim() || busy}
                small
              />
              {background.meta?.revision?.instruction && (
                <Text style={styles.tweakSource}>
                  From: {background.meta.revision.instruction}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.actionBar}>
          <View style={{ flex: 1 }} />
          <ActionKey label="Approve background" keyHint="A" onPress={approveCurrent} loading={busy} variant="primary" />
          <ActionKey label="Skip" keyHint="S" onPress={skipCurrent} variant="outline" />
          <ActionKey keyHint="D" onPress={discardCurrent} loading={busy} variant="danger"
            icon={<Trash color="#fff" width={20} height={20} strokeWidth={1.8} />} />
          <View style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Backgrounds</Text>
        {!loading && backgrounds.length > 0 && (
          <Text style={[S.body, { marginLeft: 6 }]}>{backgrounds.length} pending</Text>
        )}
        <View style={{ flex: 1 }} />
        {backgrounds.length > 0 && (
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
        {loading && !backgrounds.length ? (
          <View style={{ padding: 40 }}><ActivityIndicator color={C.accent} /></View>
        ) : backgrounds.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No backgrounds</Text>
            <Text style={[S.body, { textAlign: "center" }]}>
              Generate background candidates to review here.
            </Text>
          </View>
        ) : (
          backgrounds.map((background, idx) => (
            <Pressable
              key={background.id}
              onPress={() => openReview(idx)}
              style={[styles.cell, { width: gridCell, height: gridCell }]}
            >
              <RemoteImage
                uri={backgroundGridImageUri(background)}
                width={gridCell * 1.5}
                height={gridCell * 1.5}
                transformResizeMode="contain"
                style={styles.thumb}
                resizeMode="contain"
                priority={idx < gridColumns}
              />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
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
    marginVertical: -8,
  },
  previewBlock: { gap: 8, alignItems: "center" },
  previewLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
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
  metaSection: { marginBottom: 16, gap: 3 },
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
  tweakPanel: {
    marginTop: 4,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 8,
  },
  tweakHint: { color: C.textMuted, fontSize: 11, lineHeight: 15 },
  tweakInput: {
    minHeight: 82,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    backgroundColor: C.bg,
    color: C.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
    lineHeight: 17,
    outlineStyle: "none",
  } as any,
  tweakSource: { color: C.textMuted, fontSize: 10, lineHeight: 14 },
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
