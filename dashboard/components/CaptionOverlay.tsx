import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import {
  CaptionText,
  captionBlockRect,
  CaptionLayout,
  CAPTION_FONT_FAMILY,
} from "../lib/captionLayout";

type Rect = ReturnType<typeof captionBlockRect>;

type Props = {
  frameSize: number;
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
        style={[
          styles.small,
          {
            fontSize: rect.smallSize,
            lineHeight: rect.smallSize,
            color: rect.textColor,
            letterSpacing: rect.smallSize * -0.018,
          },
        ]}
      >
        {caption.smallText}
      </Text>
      <Text
        style={[
          styles.big,
          {
            fontSize: rect.bigSize,
            lineHeight: rect.bigSize,
            marginTop: rect.lineGap,
            color: rect.textColor,
            letterSpacing: rect.bigSize * -0.032,
          },
        ]}
      >
        {caption.bigText}
      </Text>
    </>
  );
}

export function CaptionOverlay({ frameSize, layout, caption, offsetX = 0, offsetY = 0, containerStyle }: Props) {
  const rect = captionBlockRect(frameSize, layout, caption);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          left: offsetX + rect.left,
          top: offsetY + rect.top,
          width: rect.width,
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
    fontWeight: "900",
    textAlign: "center",
  },
  big: {
    fontFamily: CAPTION_FONT_FAMILY,
    fontWeight: "900",
    textAlign: "center",
  },
});
