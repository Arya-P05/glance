import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import {
  CaptionText,
  captionBlockRect,
  captionBlockRectForFrame,
  CaptionLayout,
  CAPTION_FONT_FAMILY,
} from "../lib/captionLayout";

type Rect = ReturnType<typeof captionBlockRect>;

type Props = {
  frameSize?: number;
  frameWidth?: number;
  frameHeight?: number;
  layout: CaptionLayout;
  caption: CaptionText;
  offsetX?: number;
  offsetY?: number;
  containerStyle?: StyleProp<ViewStyle>;
};

export function CaptionTextBlock({ rect, caption }: { rect: Rect; caption: CaptionText }) {
  return (
    <>
      <Text
        selectable={false}
        style={[
          styles.small,
          {
            fontSize: rect.smallSize,
            lineHeight: rect.smallSize,
            color: rect.textColor,
            letterSpacing: 0,
          },
        ]}
      >
        {caption.smallText}
      </Text>
      <Text
        selectable={false}
        style={[
          styles.big,
          {
            fontSize: rect.bigSize,
            lineHeight: rect.bigSize,
            marginTop: rect.lineGap,
            color: rect.textColor,
            letterSpacing: 0,
          },
        ]}
      >
        {caption.bigText}
      </Text>
    </>
  );
}

export function CaptionOverlay({ frameSize, layout, caption, offsetX = 0, offsetY = 0, containerStyle }: Props) {
  const width = frameSize ?? 0;
  const rect = captionBlockRect(width, layout, caption);

  return (
    <CaptionOverlayRect
      rect={rect}
      caption={caption}
      offsetX={offsetX}
      offsetY={offsetY}
      containerStyle={containerStyle}
    />
  );
}

export function CaptionOverlayFrame({
  frameSize,
  frameWidth,
  frameHeight,
  layout,
  caption,
  offsetX = 0,
  offsetY = 0,
  containerStyle,
}: Props) {
  const width = frameWidth ?? frameSize ?? 0;
  const height = frameHeight ?? frameSize ?? width;
  const rect = captionBlockRectForFrame(width, height, layout, caption);

  return (
    <CaptionOverlayRect
      rect={rect}
      caption={caption}
      offsetX={offsetX}
      offsetY={offsetY}
      containerStyle={containerStyle}
    />
  );
}

function CaptionOverlayRect({
  rect,
  caption,
  offsetX,
  offsetY,
  containerStyle,
}: {
  rect: Rect;
  caption: CaptionText;
  offsetX: number;
  offsetY: number;
  containerStyle?: StyleProp<ViewStyle>;
}) {

  return (
    <View
      style={[
        styles.wrap,
        {
          left: offsetX + rect.left,
          top: offsetY + rect.top,
          width: rect.width,
          pointerEvents: "none" as any,
        },
        containerStyle,
      ]}
    >
      <CaptionTextBlock rect={rect} caption={caption} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignItems: "center",
  },
  small: {
    fontFamily: CAPTION_FONT_FAMILY,
    fontWeight: "800",
    textAlign: "center",
  },
  big: {
    fontFamily: CAPTION_FONT_FAMILY,
    fontWeight: "800",
    textAlign: "center",
  },
});
