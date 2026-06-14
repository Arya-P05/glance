import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, PanResponder, Pressable, TextInput,
} from "react-native";
import { Crop, NavArrowDown, NavArrowLeft, NavArrowRight, NavArrowUp, TextSquare } from "iconoir-react-native";
import { Btn } from "./Btn";
import { PosterPreview } from "./PosterPreview";
import { C, S } from "../lib/theme";
import { CaptionTextBlock } from "./CaptionOverlay";
import {
  CaptionLayout,
  CaptionLayoutInput,
  CaptionText,
  DEFAULT_CAPTION_LAYOUT,
  DEFAULT_MEDIUM_CAPTION_LAYOUT,
  MediumCaptionLayout,
  MediumCaptionLayoutInput,
  captionBlockRect,
  captionBlockRectForFrame,
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
  onApply: (layout: CaptionLayout, mediumLayout: MediumCaptionLayout) => Promise<void>;
  onCancel: () => void;
  applyLabel?: string;
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
}: Props) {
  const [layout, setLayout] = useState<CaptionLayout>(() => normalizeCaptionLayout(initialLayout));
  const [mediumLayout, setMediumLayout] = useState<MediumCaptionLayout>(() =>
    normalizeMediumCaptionLayout(initialMediumLayout, initialLayout ?? DEFAULT_MEDIUM_CAPTION_LAYOUT)
  );
  const [saving, setSaving] = useState(false);
  const [draggingText, setDraggingText] = useState(false);
  const [draggingMediumText, setDraggingMediumText] = useState(false);
  const [draggingMediumCrop, setDraggingMediumCrop] = useState(false);
  const [mediumMode, setMediumMode] = useState<"text" | "image">("text");
  const mediumModeRef = useRef(mediumMode);
  mediumModeRef.current = mediumMode;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const mediumLayoutRef = useRef(mediumLayout);
  mediumLayoutRef.current = mediumLayout;
  const startLayout = useRef(layout);
  const startMediumLayout = useRef(mediumLayout);
  const canvasSize = useRef(EDITOR_SIZE);
  const mediumCanvasSize = useRef({ width: MEDIUM_EDITOR_WIDTH, height: MEDIUM_EDITOR_HEIGHT });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDraggingText(true);
        startLayout.current = layoutRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const size = canvasSize.current;
        setLayout({
          ...startLayout.current,
          xRatio: clamp(startLayout.current.xRatio + gesture.dx / size, 0.08, 0.92),
          yRatio: clamp(startLayout.current.yRatio + gesture.dy / size, 0.08, 0.88),
        });
      },
      onPanResponderRelease: () => {
        setDraggingText(false);
      },
      onPanResponderTerminate: () => {
        setDraggingText(false);
      },
    })
  ).current;

  const rect = captionBlockRect(EDITOR_SIZE, layout, caption);
  const outlinePadH = Math.max(10, Math.round(rect.smallSize * 0.35));
  const outlinePadV = Math.max(8, Math.round(rect.smallSize * 0.3));
  const mediumRect = captionBlockRectForFrame(
    MEDIUM_EDITOR_WIDTH,
    MEDIUM_EDITOR_HEIGHT,
    mediumLayout,
    caption
  );
  const mediumOutlinePadH = Math.max(10, Math.round(mediumRect.smallSize * 0.35));
  const mediumOutlinePadV = Math.max(8, Math.round(mediumRect.smallSize * 0.3));

  const mediumTextPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => mediumModeRef.current === "text",
      onMoveShouldSetPanResponder: () => mediumModeRef.current === "text",
      onPanResponderGrant: () => {
        if (mediumModeRef.current !== "text") return;
        setDraggingMediumText(true);
        startMediumLayout.current = mediumLayoutRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        if (mediumModeRef.current !== "text") return;
        const size = mediumCanvasSize.current;
        setMediumLayout({
          ...startMediumLayout.current,
          xRatio: clamp(startMediumLayout.current.xRatio + gesture.dx / size.width, 0.08, 0.92),
          yRatio: clamp(startMediumLayout.current.yRatio + gesture.dy / size.height, 0.06, 0.82),
        });
      },
      onPanResponderRelease: () => {
        setDraggingMediumText(false);
      },
      onPanResponderTerminate: () => {
        setDraggingMediumText(false);
      },
    })
  ).current;

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

  async function handleApply() {
    setSaving(true);
    try {
      await onApply(layout, mediumLayout);
    } finally {
      setSaving(false);
    }
  }

  function adjustFontScale(delta: number) {
    setLayout((l) => ({
      ...l,
      fontScale: clamp(Math.round((l.fontScale + delta) * 100) / 100, 0.7, 1.45),
    }));
  }

  function adjustMediumFontScale(delta: number) {
    setMediumLayout((l) => ({
      ...l,
      fontScale: clamp(Math.round((l.fontScale + delta) * 100) / 100, 0.7, 1.45),
    }));
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
          <Text style={styles.hint}>Drag the text to reposition. Toggle color, then apply to bake onto the poster.</Text>

          <View
            style={styles.canvas}
            onLayout={(e) => { canvasSize.current = e.nativeEvent.layout.width; }}
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
            <View
              {...panResponder.panHandlers}
              style={[
                styles.dragHandle,
                {
                  left: rect.left - outlinePadH,
                  top: rect.top - outlinePadV,
                  width: rect.width + outlinePadH * 2,
                  paddingHorizontal: outlinePadH,
                  paddingVertical: outlinePadV,
                },
              ]}
            >
              <CaptionTextBlock rect={rect} caption={caption} />
              {draggingText && (
                <View
                  style={[styles.dragOutline, styles.noPointerEvents, { borderColor: layout.textColor }]}
                />
              )}
            </View>
          </View>

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
            <Text style={styles.controlLabel}>Text size</Text>
            <View style={styles.sizeRow}>
              <Pressable onPress={() => adjustFontScale(-0.05)} style={styles.sizeBtn}>
                <Text style={styles.sizeBtnText}>-</Text>
              </Pressable>
              <Text style={styles.sizeValue}>{Math.round(layout.fontScale * 100)}%</Text>
              <Pressable onPress={() => adjustFontScale(0.05)} style={styles.sizeBtn}>
                <Text style={styles.sizeBtnText}>+</Text>
              </Pressable>
            </View>
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
              <Pressable onPress={() => setLayout(normalizeCaptionLayout(DEFAULT_CAPTION_LAYOUT))} style={styles.resetBtn}>
                <Text style={styles.resetText}>Reset layout</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Btn label="Cancel" onPress={onCancel} variant="ghost" />
            <Btn label={saving ? "Applying…" : applyLabel} onPress={handleApply} loading={saving} />
          </View>
        </View>

        <View style={styles.widgetCol}>
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
            <View
              {...mediumTextPanResponder.panHandlers}
              style={[
                styles.mediumDragHandle,
                {
                  left: mediumRect.left - mediumOutlinePadH,
                  top: mediumRect.top - mediumOutlinePadV,
                  width: mediumRect.width + mediumOutlinePadH * 2,
                  paddingHorizontal: mediumOutlinePadH,
                  paddingVertical: mediumOutlinePadV,
                  pointerEvents: (mediumMode === "text" ? "auto" : "none") as any,
                },
              ]}
            >
              <CaptionTextBlock rect={mediumRect} caption={caption} />
              {draggingMediumText && (
                <View
                  style={[styles.dragOutline, styles.noPointerEvents, { borderColor: mediumLayout.textColor }]}
                />
              )}
            </View>
            {draggingMediumCrop && (
              <View style={[styles.cropOutline, styles.noPointerEvents]} />
            )}
          </View>

          {mediumMode === "text" ? (
            <View style={styles.mediumControls}>
              <View style={styles.controlBlock}>
                <Text style={styles.controlLabel}>Text size</Text>
                <View style={styles.sizeRow}>
                  <Pressable onPress={() => adjustMediumFontScale(-0.05)} style={styles.sizeBtn}>
                    <Text style={styles.sizeBtnText}>-</Text>
                  </Pressable>
                  <Text style={styles.sizeValue}>{Math.round(mediumLayout.fontScale * 100)}%</Text>
                  <Pressable onPress={() => adjustMediumFontScale(0.05)} style={styles.sizeBtn}>
                    <Text style={styles.sizeBtnText}>+</Text>
                  </Pressable>
                </View>
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
                    onPress={() => setMediumLayout(normalizeMediumCaptionLayout(DEFAULT_MEDIUM_CAPTION_LAYOUT))}
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
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sizeBtn: {
    width: 40,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  sizeBtnText: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
  sizeValue: {
    minWidth: 54,
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
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
