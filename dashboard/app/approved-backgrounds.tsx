import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform, useWindowDimensions,
} from "react-native";
import { RefreshDouble } from "iconoir-react-native";
import { API_BASE, api, CaptionText, Draft } from "../lib/api";
import { Btn } from "../components/Btn";
import { CaptionEditor } from "../components/CaptionEditor";
import { C, S } from "../lib/theme";
import { previewImageUrl, RemoteImage } from "../components/RemoteImage";
import { CaptionLayout, MediumCaptionLayout } from "../lib/captionLayout";

type Screen = "grid" | "edit";

const GRID_PADDING = 16;
const GRID_GAP = 10;
const MIN_GRID_CELL = 220;
const MAX_GRID_CELL = 320;

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

function normalizeCaption(caption: CaptionText): CaptionText {
  return {
    smallText: caption.smallText.trim().toLowerCase(),
    bigText: caption.bigText.trim().toLowerCase(),
  };
}

export default function ApprovedBackgroundsScreen() {
  const { width } = useWindowDimensions();
  const [backgrounds, setBackgrounds] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("grid");
  const [reviewIdx, setReviewIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captionOptions, setCaptionOptions] = useState<CaptionText[]>([]);
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState(0);
  const [caption, setCaption] = useState<CaptionText>({ smallText: "", bigText: "" });
  const [captionModel, setCaptionModel] = useState<string | undefined>();
  const [captionPrompt, setCaptionPrompt] = useState<string | undefined>();
  const gridViewportWidth = Math.max(
    320,
    width - (Platform.OS === "web" && width > 600 ? C.sidebarW : 0) - GRID_PADDING * 2
  );
  const maxGridColumns = Math.max(1, Math.floor((gridViewportWidth + GRID_GAP) / (MIN_GRID_CELL + GRID_GAP)));
  const gridColumns = backgrounds.length > 0 ? Math.min(backgrounds.length, maxGridColumns) : maxGridColumns;
  const gridCell = Math.min(
    MAX_GRID_CELL,
    Math.floor((gridViewportWidth - GRID_GAP * (gridColumns - 1)) / gridColumns)
  );

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { backgrounds: b } = await api.backgrounds({ status: "staged" });
      setBackgrounds(b);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function applyCaptionState(background: Draft, options: CaptionText[]) {
    const index = Math.max(0, Math.min(options.length - 1, background.meta?.selectedCaptionIndex ?? 0));
    setCaptionOptions(options);
    setSelectedCaptionIndex(index);
    setCaption(options[index]);
    setCaptionModel(background.meta?.captionModel ?? undefined);
    setCaptionPrompt(background.meta?.captionPrompt ?? undefined);
  }

  async function generateMessagesForBackground(background: Draft) {
    const result = await api.generateBackgroundMessages({ id: background.id });
    const options = result.captionOptions.length ? result.captionOptions : [{ smallText: "smile today,", bigText: "it helps." }];
    const index = Math.max(0, Math.min(options.length - 1, result.selectedCaptionIndex ?? 0));
    setCaptionOptions(options);
    setSelectedCaptionIndex(index);
    setCaption(options[index]);
    setCaptionModel(result.captionModel);
    setCaptionPrompt(result.captionPrompt);
    setBackgrounds(prev => prev.map(item =>
      item.id === background.id
        ? {
            ...item,
            meta: {
              ...item.meta,
              captionOptions: options,
              selectedCaptionIndex: index,
              captionModel: result.captionModel,
              captionPrompt: result.captionPrompt,
            },
          }
        : item
    ));
  }

  async function openEdit(startIdx = 0) {
    const background = backgrounds[startIdx];
    if (!background || busy) return;

    setReviewIdx(startIdx);
    const existingOptions = background.meta?.captionOptions?.filter(Boolean) ?? [];
    if (existingOptions.length) {
      applyCaptionState(background, existingOptions);
      setScreen("edit");
      return;
    }

    setBusy(true);
    try {
      await generateMessagesForBackground(background);
      setScreen("edit");
    } catch (e: any) {
      alert(e?.message ?? "Failed to generate messages");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateMessagesCurrent() {
    const background = backgrounds[reviewIdx];
    if (!background || busy) return;
    setBusy(true);
    try {
      await generateMessagesForBackground(background);
    } catch (e: any) {
      alert(e?.message ?? "Failed to regenerate messages");
    } finally {
      setBusy(false);
    }
  }

  function closeEdit() {
    setCaptionOptions([]);
    setSelectedCaptionIndex(0);
    setCaption({ smallText: "", bigText: "" });
    setCaptionModel(undefined);
    setCaptionPrompt(undefined);
    setScreen("grid");
  }

  function selectCaptionOption(index: number) {
    const option = captionOptions[index];
    if (!option) return;
    setSelectedCaptionIndex(index);
    setCaption(option);
  }

  function updateCaption(next: CaptionText) {
    setCaption(next);
    setCaptionOptions(options => options.map((option, idx) =>
      idx === selectedCaptionIndex ? next : option
    ));
  }

  async function discardCurrent() {
    const background = backgrounds[reviewIdx];
    if (!background || busy) return;

    setBusy(true);
    try {
      await api.discardBackground({ id: background.id, dbId: background.dbId, status: "staged" });
      setBackgrounds(prev => prev.filter(item => item.id !== background.id));
      closeEdit();
      if (backgrounds.length <= 1) load();
    } catch (e: any) {
      await load();
      closeEdit();
      alert(e?.message ?? "Failed to discard background");
    } finally {
      setBusy(false);
    }
  }

  async function saveToDrafts(layout: CaptionLayout, mediumLayout: MediumCaptionLayout) {
    const background = backgrounds[reviewIdx];
    if (!background) return;

    const finalCaption = normalizeCaption(caption);
    const finalOptions = captionOptions.map((option, idx) =>
      idx === selectedCaptionIndex ? finalCaption : normalizeCaption(option)
    );

    try {
      await api.approveBackground({
        id: background.id,
        caption: finalCaption,
        captionOptions: finalOptions,
        selectedCaptionIndex,
        captionModel,
        captionPrompt,
        layout,
        mediumLayout,
      });
      setBackgrounds(prev => prev.filter(item => item.id !== background.id));
      closeEdit();
      if (backgrounds.length <= 1) load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to save draft");
      throw e;
    }
  }

  if (screen === "edit") {
    const background = backgrounds[reviewIdx];
    if (!background || !captionOptions.length) {
      return (
        <View style={styles.root}>
          <View style={styles.reviewHeader}>
            <Pressable onPress={closeEdit} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Approved</Text>
            </Pressable>
            <Text style={S.body}>No background selected</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <View style={styles.reviewHeader}>
          <Pressable onPress={closeEdit} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Approved</Text>
          </Pressable>
          <Text style={styles.reviewCounter}>Choose message</Text>
          <Text style={[S.body, { color: C.textMuted }]}>
            {reviewIdx + 1} / {backgrounds.length}
          </Text>
          <View style={{ flex: 1 }} />
          <Btn label="Regenerate" onPress={regenerateMessagesCurrent} loading={busy} small variant="outline" />
          <Btn label="Discard" onPress={discardCurrent} loading={busy} small variant="danger" />
        </View>
        <View style={styles.messageBody}>
          <View style={styles.optionPanel}>
            <Text style={styles.panelTitle}>Messages</Text>
            <ScrollView contentContainerStyle={styles.optionList}>
              {captionOptions.map((option, idx) => {
                const active = idx === selectedCaptionIndex;
                return (
                  <Pressable
                    key={`${option.smallText}-${option.bigText}-${idx}`}
                    onPress={() => selectCaptionOption(idx)}
                    style={[styles.optionCard, active && styles.optionCardActive]}
                  >
                    <Text style={styles.optionNumber}>{idx + 1}</Text>
                    <Text style={styles.optionSmall}>{option.smallText}</Text>
                    <Text style={styles.optionBig}>{option.bigText}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.editorWrap}>
            <CaptionEditor
              backgroundUri={backgroundImageUri(background, 1200)}
              caption={caption}
              initialLayout={background.meta?.captionLayout}
              initialMediumLayout={background.meta?.mediumCaptionLayout}
              onCaptionChange={updateCaption}
              onApply={saveToDrafts}
              onCancel={closeEdit}
              applyLabel="Save to drafts"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Approved</Text>
        {!loading && backgrounds.length > 0 && (
          <Text style={[S.body, { marginLeft: 6 }]}>{backgrounds.length} ready to edit</Text>
        )}
        <View style={{ flex: 1 }} />
        {backgrounds.length > 0 && (
          <Btn label="Edit" onPress={() => openEdit(0)} loading={busy} small />
        )}
        <Pressable onPress={load} style={styles.refreshBtn} disabled={loading || busy}>
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
            <Text style={styles.emptyTitle}>No approved backgrounds</Text>
            <Text style={[S.body, { textAlign: "center" }]}>
              Approve backgrounds from the Backgrounds screen to edit them here.
            </Text>
          </View>
        ) : (
          backgrounds.map((background, idx) => (
            <Pressable
              key={background.id}
              onPress={() => openEdit(idx)}
              disabled={busy}
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
              {busy && reviewIdx === idx && (
                <View style={styles.cellOverlay}>
                  <ActivityIndicator color={C.accent} />
                </View>
              )}
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
  cellOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
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
  messageBody: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  optionPanel: {
    width: 300,
    borderRightWidth: 1,
    borderRightColor: C.border,
    backgroundColor: C.surface,
    padding: 16,
  },
  panelTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  optionList: { gap: 10, paddingBottom: 24 },
  optionCard: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  optionCardActive: {
    borderColor: C.accent,
    backgroundColor: "#111A0A",
  },
  optionNumber: { color: C.textMuted, fontSize: 10, fontWeight: "700" },
  optionSmall: { color: C.textPrimary, fontSize: 12, fontWeight: "800" },
  optionBig: { color: C.textPrimary, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  editorWrap: { flex: 1, minWidth: 0 },
});
