import { layoutCaptionGlyphs } from "../lib/captionFont";
import { CaptionLines } from "./CaptionLines";
import { clearEditorRecovery, readEditorRecovery, writeEditorRecovery, type EditorRecovery } from '../lib/editorRecovery';
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, PanResponder, Pressable, TextInput,
} from "react-native";
import { Crop, NavArrowDown, NavArrowLeft, NavArrowRight, NavArrowUp, TextSquare } from "iconoir-react-native";
import { Btn } from "./Btn";
import { PosterPreview } from "./PosterPreview";
import { C, S } from "../lib/theme";
import {
  captionOverflow,
  independentCaptionLayout,
  CaptionLayout,
  CaptionLayoutInput,
  CaptionText,
  DEFAULT_CAPTION_LAYOUT,
  DEFAULT_MEDIUM_CAPTION_LAYOUT,
  MediumCaptionLayout,
  MediumCaptionLayoutInput,
  normalizeCaptionLayout,
  normalizeMediumCaptionLayout,
  sourceCropInFrame,
} from "../lib/captionLayout";

const EDITOR_SIZE = 420;
const MEDIUM_EDITOR_WIDTH = 420;
const MEDIUM_EDITOR_HEIGHT = Math.round(MEDIUM_EDITOR_WIDTH * 155 / 329);

type Props = {
  backgroundUri: string;
  caption: CaptionText;
  initialLayout?: CaptionLayoutInput | null;
  initialMediumLayout?: MediumCaptionLayoutInput | null;
  onCaptionChange?: (caption: CaptionText) => void;
  onApply: (layout: CaptionLayout, mediumLayout: MediumCaptionLayout, mediumRejected?: boolean, mediumReason?: string) => Promise<void>;
  onCancel: () => void;
  applyLabel?: string;
  allowMediumRejection?: boolean;
  placementReason?: string;
  onPlacementReasonChange?: (value:string)=>void;
  recoveryKey?: string;
  recoveryVersion?: string;
  recoveryContext?: EditorRecovery['context'];
  onRecover?: (state: EditorRecovery) => void;
};

export function CaptionEditor({
  backgroundUri,
  caption,
  initialLayout,
  initialMediumLayout,
  onCaptionChange,
  onApply,
  onCancel,
  applyLabel = "Apply to poster",
  allowMediumRejection = false,
  placementReason,
  onPlacementReasonChange,
  recoveryKey,
  recoveryVersion = '',
  recoveryContext,
  onRecover,
}: Props) {
  const [recovered] = useState(() => recoveryKey ? readEditorRecovery(recoveryKey, recoveryVersion) : null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const recoveryConsumed = useRef(false);
  useEffect(() => {
    if (recovered) {
      setLayout(normalizeCaptionLayout(recovered.layout));
      setMediumLayout(normalizeMediumCaptionLayout(recovered.mediumLayout, recovered.layout));
      setMediumRejected(recovered.mediumRejected);
      setMediumReason(recovered.mediumReason);
      if (onRecover) onRecover(recovered);
      else onCaptionChange?.(recovered.caption);
    }
    setRecoveryReady(true);
  }, []);
  const [layout, setLayout] = useState<CaptionLayout>(() => independentCaptionLayout(EDITOR_SIZE, EDITOR_SIZE, normalizeCaptionLayout(initialLayout), caption));
  const [mediumLayout, setMediumLayout] = useState<MediumCaptionLayout>(() =>
    independentCaptionLayout(MEDIUM_EDITOR_WIDTH, MEDIUM_EDITOR_HEIGHT, normalizeMediumCaptionLayout(initialMediumLayout, initialLayout ?? DEFAULT_MEDIUM_CAPTION_LAYOUT), caption)
  );
  const [mediumRejected, setMediumRejected] = useState(false);
  const [mediumReason, setMediumReason] = useState("");
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  useEffect(() => {
    if (!recoveryKey || !recoveryReady || recoveryConsumed.current) return;
    setRecoveryFailed(!writeEditorRecovery(recoveryKey, recoveryVersion, {
      caption, layout, mediumLayout, mediumRejected, mediumReason, context: recoveryContext,
    }));
  }, [recoveryKey, recoveryVersion, recoveryReady, caption, layout, mediumLayout, mediumRejected, mediumReason, recoveryContext]);
  const [saving, setSaving] = useState(false);
  const [draggingMediumCrop, setDraggingMediumCrop] = useState(false);
  const [mediumMode, setMediumMode] = useState<"text" | "image">("text");
  const mediumModeRef = useRef(mediumMode);
  mediumModeRef.current = mediumMode;
  const mediumLayoutRef = useRef(mediumLayout);
  mediumLayoutRef.current = mediumLayout;
  const startMediumLayout = useRef(mediumLayout);
  const mediumCanvasSize = useRef({ width: MEDIUM_EDITOR_WIDTH, height: MEDIUM_EDITOR_HEIGHT });

  const mediumCropPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => mediumModeRef.current === "image",
      onMoveShouldSetPanResponder: () => mediumModeRef.current === "image",
      onPanResponderGrant: () => {
        if (mediumModeRef.current !== "image") return;
        setDraggingMediumCrop(true);
        startMediumLayout.current = mediumLayoutRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        if (mediumModeRef.current !== "image") return;
        const size = mediumCanvasSize.current;
        const crop = sourceCropInFrame(size.width, size.height, startMediumLayout.current.cropXRatio, startMediumLayout.current.cropYRatio);
        const overflowX = Math.max(0, crop.scaledSize - size.width);
        const overflowY = Math.max(0, crop.scaledSize - size.height);
        setMediumLayout({
          ...startMediumLayout.current,
          cropXRatio: overflowX > 0
            ? clamp(startMediumLayout.current.cropXRatio - gesture.dx / overflowX, 0, 1)
            : startMediumLayout.current.cropXRatio,
          cropYRatio: overflowY > 0
            ? clamp(startMediumLayout.current.cropYRatio - gesture.dy / overflowY, 0, 1)
            : startMediumLayout.current.cropYRatio,
        });
      },
      onPanResponderRelease: () => {
        setDraggingMediumCrop(false);
      },
      onPanResponderTerminate: () => {
        setDraggingMediumCrop(false);
      },
    })
  ).current;

  const unsupported = layoutCaptionGlyphs(caption.smallText + caption.bigText, 1).unsupported;

  async function handleApply() {
    setSaving(true);
    try {
      await onApply(layout, mediumLayout, mediumRejected, mediumReason);
      recoveryConsumed.current = true;
      if (recoveryKey) clearEditorRecovery(recoveryKey);
    } finally {
      setSaving(false);
    }
  }

  function nudgeMediumCrop(deltaX: number, deltaY: number) {
    setMediumLayout((l) => ({
      ...l,
      cropXRatio: clamp(Math.round((l.cropXRatio + deltaX) * 100) / 100, 0, 1),
      cropYRatio: clamp(Math.round((l.cropYRatio + deltaY) * 100) / 100, 0, 1),
    }));
  }

  function resetMediumCrop() {
    setMediumLayout((l) => ({
      ...l,
      cropXRatio: DEFAULT_MEDIUM_CAPTION_LAYOUT.cropXRatio,
      cropYRatio: DEFAULT_MEDIUM_CAPTION_LAYOUT.cropYRatio,
    }));
  }

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <View style={styles.editorCol}>
          <Text style={styles.sectionTitle}>Caption editor</Text>
          <Text style={styles.hint}>Drag each line left or right independently. Drag up or down to move both lines together.</Text>
          {recoveryKey && <Text style={styles.hint}>{recoveryFailed ? 'Edit recovery is unavailable in this browser. Keep this editor open until you save.' : 'Edits are recovered in this browser. Use the save button to apply them to the poster.'}</Text>}

          <View
            style={styles.canvas}
          >
            <PosterPreview
              backgroundUri={backgroundUri}
              caption={caption}
              layout={layout}
              width={EDITOR_SIZE}
              height={EDITOR_SIZE}
              borderRadius={12}
              showCaption={false}
            />
            <CaptionLines width={EDITOR_SIZE} height={EDITOR_SIZE} layout={layout} caption={caption} onChange={setLayout} />
          </View>

          {captionOverflow(EDITOR_SIZE, EDITOR_SIZE, layout, caption).length > 0 && <Text accessibilityRole="alert" style={{ color: C.danger }}>Text extends beyond the square image. Move it inward or shorten the wording; the size stays fixed.</Text>}
          <View style={styles.controls}>
            {onCaptionChange && (
              <View style={styles.textControls}>
                <Text style={styles.controlLabel}>Message</Text>
                <TextInput
                  value={caption.smallText}
                  onChangeText={(smallText) => onCaptionChange({ ...caption, smallText })}
                  style={styles.textInput}
                  placeholder="small line"
                  placeholderTextColor={C.textMuted}
                />
                <TextInput
                  value={caption.bigText}
                  onChangeText={(bigText) => onCaptionChange({ ...caption, bigText })}
                  style={[styles.textInput, styles.textInputLarge]}
                  placeholder="big line"
                  placeholderTextColor={C.textMuted}
                />
              </View>
            )}
            <Text style={styles.hint}>Text sizes and vertical gap are locked.</Text>
            <Text style={styles.controlLabel}>Text color</Text>
            <View style={styles.colorRow}>
              <Pressable
                onPress={() => setLayout((l) => ({ ...l, textColor: "#050505" }))}
                style={[styles.colorBtn, styles.colorBlack, layout.textColor === "#050505" && styles.colorBtnActive]}
              >
                <Text style={styles.colorBtnTextDark}>Black</Text>
              </Pressable>
              <Pressable
                onPress={() => setLayout((l) => ({ ...l, textColor: "#ffffff" }))}
                style={[styles.colorBtn, styles.colorWhite, layout.textColor === "#ffffff" && styles.colorBtnActive]}
              >
                <Text style={styles.colorBtnTextLight}>White</Text>
              </Pressable>
              <Pressable onPress={() => setLayout(current => (independentCaptionLayout(EDITOR_SIZE, EDITOR_SIZE, { ...normalizeCaptionLayout(DEFAULT_CAPTION_LAYOUT), smallFontRatio: current.smallFontRatio, bigFontRatio: current.bigFontRatio }, caption)))} style={styles.resetBtn}>
                <Text style={styles.resetText}>Reset layout</Text>
              </Pressable>
            </View>
          </View>

          {onPlacementReasonChange && <View style={{gap:8,padding:12}}>
            <Text style={{color:C.textPrimary,fontWeight:"600"}}>{JSON.stringify(layout)===JSON.stringify(normalizeCaptionLayout(initialLayout)) && (mediumRejected || JSON.stringify(mediumLayout)===JSON.stringify(normalizeMediumCaptionLayout(initialMediumLayout,initialLayout ?? DEFAULT_MEDIUM_CAPTION_LAYOUT))) ? "Keep placement as is" : "Save adjusted placement"}</Text>
            <TextInput accessibilityLabel="Placement feedback" value={placementReason} onChangeText={onPlacementReasonChange} placeholder="Optional: moved off the face, better contrast…" placeholderTextColor={C.textMuted} multiline maxLength={1000} style={{color:C.textPrimary,padding:12,borderWidth:1,borderColor:C.border,borderRadius:8}} />
          </View>}
          {!!unsupported.length && <Text style={{ color: C.danger }}>Replace unsupported characters: {unsupported.join(" ")}</Text>}
          <View style={styles.actions}>
            <Btn label="Cancel" onPress={onCancel} variant="ghost" />
            <Btn label={saving ? "Applying…" : applyLabel} onPress={handleApply} loading={saving} disabled={unsupported.length > 0} />
          </View>
        </View>

        <View style={styles.widgetCol}>
          {allowMediumRejection && <View style={{gap:10, marginBottom:16}}>
            <Btn label={mediumRejected ? "Undo wide rejection" : "Reject for wide widgets"} variant="ghost" disabled={saving} onPress={() => setMediumRejected(value => !value)} />
            {mediumRejected && <>
              <Text style={{color:C.textSecondary}}>Square version kept. The wide version will be excluded when you save to drafts.</Text>
              <TextInput accessibilityLabel="Wide widget rejection reason" value={mediumReason} onChangeText={setMediumReason} placeholder="Optional: crop cuts off the subject…" placeholderTextColor={C.textMuted} maxLength={1000} multiline style={{color:C.textPrimary,padding:12,borderWidth:1,borderColor:C.border,borderRadius:8}} />
            </>}
          </View>}
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Medium</Text>
              <Text style={styles.subtleLabel}>Wide widget layout</Text>
            </View>
            <View style={styles.segmentedRow}>
              <Pressable
                onPress={() => setMediumMode("text")}
                style={[styles.segmentBtn, mediumMode === "text" && styles.segmentBtnActive]}
              >
                <TextSquare
                  color={mediumMode === "text" ? "#050505" : C.textSecondary}
                  width={16}
                  height={16}
                />
                <Text style={[styles.segmentText, mediumMode === "text" && styles.segmentTextActive]}>Text</Text>
              </Pressable>
              <Pressable
                onPress={() => setMediumMode("image")}
                style={[styles.segmentBtn, mediumMode === "image" && styles.segmentBtnActive]}
              >
                <Crop
                  color={mediumMode === "image" ? "#050505" : C.textSecondary}
                  width={16}
                  height={16}
                />
                <Text style={[styles.segmentText, mediumMode === "image" && styles.segmentTextActive]}>Crop</Text>
              </Pressable>
            </View>
          </View>

          <View
            style={[styles.mediumCanvas, mediumMode === "image" && styles.mediumCanvasCropMode]}
            onLayout={(e) => {
              mediumCanvasSize.current = {
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              };
            }}
          >
            <PosterPreview
              backgroundUri={backgroundUri}
              caption={caption}
              layout={mediumLayout}
              cropLayout={mediumLayout}
              layoutSpace="frame"
              width={MEDIUM_EDITOR_WIDTH}
              height={MEDIUM_EDITOR_HEIGHT}
              borderRadius={22}
              showCaption={false}
            />
            {mediumMode === "image" && (
              <View
                {...mediumCropPanResponder.panHandlers}
                style={styles.mediumCropHandle}
              />
            )}
            <CaptionLines width={MEDIUM_EDITOR_WIDTH} height={MEDIUM_EDITOR_HEIGHT} layout={mediumLayout} caption={caption}
              onChange={mediumMode === "text" ? next => setMediumLayout(current => ({ ...current, ...next })) : undefined} />
            {draggingMediumCrop && (
              <View style={[styles.cropOutline, styles.noPointerEvents]} />
            )}
          </View>

          {!mediumRejected && captionOverflow(MEDIUM_EDITOR_WIDTH, MEDIUM_EDITOR_HEIGHT, mediumLayout, caption).length > 0 && <Text accessibilityRole="alert" style={{ color: C.danger }}>Text extends beyond the wide image. Move it inward or shorten the wording; the size stays fixed.</Text>}
          {mediumMode === "text" ? (
            <View style={styles.mediumControls}>
              <View style={styles.controlBlock}>
                <Text style={styles.hint}>Text sizes and vertical gap are locked.</Text>
              </View>
              <View style={styles.controlBlock}>
                <Text style={styles.controlLabel}>Color</Text>
                <View style={styles.colorRow}>
                  <Pressable
                    onPress={() => setMediumLayout((l) => ({ ...l, textColor: "#050505" }))}
                    style={[styles.colorBtn, styles.colorBlack, mediumLayout.textColor === "#050505" && styles.colorBtnActive]}
                  >
                    <Text style={styles.colorBtnTextDark}>Black</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMediumLayout((l) => ({ ...l, textColor: "#ffffff" }))}
                    style={[styles.colorBtn, styles.colorWhite, mediumLayout.textColor === "#ffffff" && styles.colorBtnActive]}
                  >
                    <Text style={styles.colorBtnTextLight}>White</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMediumLayout(current => (independentCaptionLayout(MEDIUM_EDITOR_WIDTH, MEDIUM_EDITOR_HEIGHT, { ...normalizeMediumCaptionLayout(DEFAULT_MEDIUM_CAPTION_LAYOUT), smallFontRatio: current.smallFontRatio, bigFontRatio: current.bigFontRatio }, caption)))}
                    style={styles.resetBtn}
                  >
                    <Text style={styles.resetText}>Reset</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.cropPanel}>
              <View style={styles.nudgePad}>
                <View style={styles.nudgeSpacer} />
                <CropNudgeButton onPress={() => nudgeMediumCrop(0, -0.04)}>
                  <NavArrowUp color={C.textPrimary} width={16} height={16} />
                </CropNudgeButton>
                <View style={styles.nudgeSpacer} />
                <CropNudgeButton onPress={() => nudgeMediumCrop(-0.04, 0)}>
                  <NavArrowLeft color={C.textPrimary} width={16} height={16} />
                </CropNudgeButton>
                <Pressable onPress={resetMediumCrop} style={styles.centerCropBtn}>
                  <Text style={styles.centerCropText}>Center</Text>
                </Pressable>
                <CropNudgeButton onPress={() => nudgeMediumCrop(0.04, 0)}>
                  <NavArrowRight color={C.textPrimary} width={16} height={16} />
                </CropNudgeButton>
                <View style={styles.nudgeSpacer} />
                <CropNudgeButton onPress={() => nudgeMediumCrop(0, 0.04)}>
                  <NavArrowDown color={C.textPrimary} width={16} height={16} />
                </CropNudgeButton>
                <View style={styles.nudgeSpacer} />
              </View>
              <View style={styles.cropReadout}>
                <Text style={styles.cropReadoutText}>X {Math.round(mediumLayout.cropXRatio * 100)}%</Text>
                <Text style={styles.cropReadoutText}>Y {Math.round(mediumLayout.cropYRatio * 100)}%</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function CropNudgeButton({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.nudgeBtn}>
      {children}
    </Pressable>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  main: {
    flex: 1,
    flexDirection: "row",
    padding: 24,
    gap: 28,
    overflow: "auto" as any,
  },
  editorCol: { flex: 1, minWidth: 440, gap: 12 },
  widgetCol: {
    width: MEDIUM_EDITOR_WIDTH,
    flexShrink: 0,
    gap: 14,
  },
  sectionTitle: { ...S.h1, fontSize: 20, marginBottom: 4 },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  subtleLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  canvas: {
    width: EDITOR_SIZE,
    height: EDITOR_SIZE,
    position: "relative",
    alignSelf: "center",
  },
  dragHandle: {
    position: "absolute",
    alignItems: "center",
    zIndex: 10,
    cursor: "grab" as any,
  },
  dragOutline: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 8,
  },
  noPointerEvents: {
    pointerEvents: "none" as any,
  },
  segmentedRow: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: C.surface,
  },
  segmentBtnActive: { backgroundColor: C.accent },
  segmentText: { color: C.textSecondary, fontSize: 12, fontWeight: "800" },
  segmentTextActive: { color: "#050505" },
  mediumCanvas: {
    width: MEDIUM_EDITOR_WIDTH,
    height: MEDIUM_EDITOR_HEIGHT,
    position: "relative",
    alignSelf: "center",
  },
  mediumCanvasCropMode: {
    boxShadow: `0 0 0 2px ${C.accent}` as any,
    borderRadius: 22,
  },
  mediumCropHandle: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 8,
    cursor: "grab" as any,
  },
  mediumDragHandle: {
    position: "absolute",
    alignItems: "center",
    zIndex: 10,
    cursor: "grab" as any,
  },
  cropOutline: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: C.accent,
    borderRadius: 22,
    zIndex: 12,
  },
  controls: { marginTop: 8, gap: 8 },
  mediumControls: { gap: 16 },
  controlBlock: { gap: 8 },
  controlLabel: { color: C.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  controlHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textControls: { gap: 8, marginBottom: 8 },
  textInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 10,
    outlineStyle: "none" as any,
  },
  textInputLarge: { fontSize: 18, fontWeight: "900" },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  colorBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.border,
  },
  colorBtnActive: { borderColor: C.accent },
  colorBlack: { backgroundColor: "#050505" },
  colorWhite: { backgroundColor: "#f5f5f5" },
  colorBtnTextDark: { color: "#fff", fontWeight: "600", fontSize: 13 },
  colorBtnTextLight: { color: "#050505", fontWeight: "600", fontSize: 13 },
  resetBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  resetText: { color: C.textSecondary, fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginTop: 16, justifyContent: "flex-end" },
  cropPanel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: C.surface,
  },
  nudgePad: {
    width: 132,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  nudgeBtn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#0f0f0f",
  },
  nudgeSpacer: {
    width: 40,
    height: 36,
  },
  centerCropBtn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: C.accent,
  },
  centerCropText: {
    color: "#050505",
    fontSize: 10,
    fontWeight: "900",
  },
  cropReadout: {
    minWidth: 92,
    gap: 6,
  },
  cropReadoutText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
});
