import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { RemoteImage } from "./RemoteImage";
import { CaptionOverlay } from "./CaptionOverlay";
import {
  CaptionLayout,
  CaptionText,
  captionPositionInFrame,
  normalizeCaptionLayout,
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

  const pos = captionPositionInFrame(width, frameHeight, normalized, caption);

  return (
    <View style={[styles.frame, { width, height: frameHeight, borderRadius }, style]}>
      <View style={[styles.cropWrap, { width, height: frameHeight }]}>
        <View
          style={{
            width: pos.scaledSize,
            height: pos.scaledSize,
            marginLeft: pos.offsetX,
            marginTop: pos.offsetY,
          }}
        >
          <RemoteImage
            uri={backgroundUri}
            style={{ width: pos.scaledSize, height: pos.scaledSize }}
            resizeMode="cover"
            raw
          />
        </View>
        {showCaption && (
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
