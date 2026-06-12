import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, PanResponder, Pressable,
} from "react-native";
import { Btn } from "./Btn";
import { PosterPreview } from "./PosterPreview";
import { WidgetLarge } from "./iPhoneMockup/WidgetLarge";
import { WidgetMedium } from "./iPhoneMockup/WidgetMedium";
import { WidgetSmall } from "./iPhoneMockup/WidgetSmall";
import { C, S } from "../lib/theme";
import { CaptionTextBlock } from "./CaptionOverlay";
import {
  CaptionLayout,
  CaptionText,
  DEFAULT_CAPTION_LAYOUT,
  captionBlockRect,
  normalizeCaptionLayout,
} from "../lib/captionLayout";

const EDITOR_SIZE = 420;

type Props = {
  backgroundUri: string;
  caption: CaptionText;
  initialLayout?: Partial<CaptionLayout> | null;
  onApply: (layout: CaptionLayout) => Promise<void>;
  onCancel: () => void;
};

export function CaptionEditor({ backgroundUri, caption, initialLayout, onApply, onCancel }: Props) {
  const [layout, setLayout] = useState<CaptionLayout>(() => normalizeCaptionLayout(initialLayout));
  const [saving, setSaving] = useState(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const startLayout = useRef(layout);
  const canvasSize = useRef(EDITOR_SIZE);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
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
    })
  ).current;

  const rect = captionBlockRect(EDITOR_SIZE, layout, caption);
  const outlinePadH = Math.max(10, Math.round(rect.smallSize * 0.35));
  const outlinePadV = Math.max(8, Math.round(rect.smallSize * 0.3));

  async function handleApply() {
    setSaving(true);
    try {
      await onApply(layout);
    } finally {
      setSaving(false);
    }
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
              <View
                pointerEvents="none"
                style={[styles.dragOutline, { borderColor: layout.textColor }]}
              />
            </View>
          </View>

          <View style={styles.controls}>
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
                <Text style={styles.resetText}>Reset position</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Btn label="Cancel" onPress={onCancel} variant="ghost" />
            <Btn label={saving ? "Applying…" : "Apply to poster"} onPress={handleApply} loading={saving} />
          </View>
        </View>

        <View style={styles.widgetCol}>
          <Text style={styles.sectionTitle}>Widget preview</Text>
          <Text style={[S.body, { marginBottom: 16 }]}>Live preview at all three widget sizes.</Text>
          <View style={styles.widgetStack}>
            <View style={styles.widgetBlock}>
              <Text style={styles.widgetLabel}>Large</Text>
              <WidgetLarge
                posterPreview={{ backgroundUri, caption, layout }}
              />
            </View>
            <View style={styles.widgetBlock}>
              <Text style={styles.widgetLabel}>Medium</Text>
              <WidgetMedium
                posterPreview={{ backgroundUri, caption, layout }}
              />
            </View>
            <View style={styles.widgetBlock}>
              <Text style={styles.widgetLabel}>Small</Text>
              <WidgetSmall
                posterPreview={{ backgroundUri, caption, layout }}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
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
    gap: 32,
    overflow: "auto" as any,
  },
  editorCol: { flex: 1, minWidth: 440, gap: 12 },
  widgetCol: { width: 380, flexShrink: 0 },
  sectionTitle: { ...S.h1, fontSize: 20, marginBottom: 4 },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 8 },
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
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 8,
  },
  controls: { marginTop: 8, gap: 8 },
  controlLabel: { color: C.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
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
  widgetStack: { gap: 20, alignItems: "center" },
  widgetBlock: { alignItems: "center", gap: 8 },
  widgetLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
