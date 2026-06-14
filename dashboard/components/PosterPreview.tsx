import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { RemoteImage } from "./RemoteImage";
import { CaptionOverlay, CaptionOverlayFrame } from "./CaptionOverlay";
import {
  CaptionLayout,
  CaptionText,
  captionPositionInFrame,
  normalizeCaptionLayout,
  sourceCropInFrame,
} from "../lib/captionLayout";

type Props = {
  backgroundUri: string;
  caption: CaptionText;
  layout?: Partial<CaptionLayout> | null;
  width: number;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  showCaption?: boolean;
  cropLayout?: { cropXRatio?: number | null; cropYRatio?: number | null } | null;
  layoutSpace?: "source" | "frame";
};

export function PosterPreview({
  backgroundUri,
  caption,
  layout,
  width,
  height,
  borderRadius = 0,
  style,
  showCaption = true,
  cropLayout,
  layoutSpace = "source",
}: Props) {
  const frameHeight = height ?? width;
  const normalized = normalizeCaptionLayout(layout);
  const isSquare = Math.abs(width - frameHeight) < 1;

  if (isSquare) {
    return (
      <View style={[styles.frame, { width, height: frameHeight, borderRadius }, style]}>
        <RemoteImage uri={backgroundUri} style={styles.fill} resizeMode="cover" raw />
        {showCaption && (
          <CaptionOverlay frameSize={width} layout={normalized} caption={caption} />
        )}
      </View>
    );
  }

  const crop = sourceCropInFrame(
    width,
    frameHeight,
    Number(cropLayout?.cropXRatio ?? 0.5),
    Number(cropLayout?.cropYRatio ?? 0.5)
  );
  const pos = layoutSpace === "frame"
    ? { ...crop, x: 0, y: 0, smallSize: 0, bigSize: 0 }
    : captionPositionInFrame(width, frameHeight, normalized, caption);

  return (
    <View style={[styles.frame, { width, height: frameHeight, borderRadius }, style]}>
      <View style={[styles.cropWrap, { width, height: frameHeight }]}>
        <View
          style={{
            width: crop.scaledSize,
            height: crop.scaledSize,
            marginLeft: crop.offsetX,
            marginTop: crop.offsetY,
          }}
        >
          <RemoteImage
            uri={backgroundUri}
            style={{ width: crop.scaledSize, height: crop.scaledSize }}
            resizeMode="cover"
            raw
          />
        </View>
        {showCaption && layoutSpace === "frame" && (
          <CaptionOverlayFrame
            frameWidth={width}
            frameHeight={frameHeight}
            layout={normalized}
            caption={caption}
          />
        )}
        {showCaption && layoutSpace !== "frame" && (
          <CaptionOverlay
            frameSize={pos.scaledSize}
            layout={normalized}
            caption={caption}
            offsetX={pos.offsetX}
            offsetY={pos.offsetY}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    backgroundColor: "#111",
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  cropWrap: {
    overflow: "hidden",
    position: "relative",
  },
});
