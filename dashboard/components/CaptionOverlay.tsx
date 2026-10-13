import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { CaptionLayout, CaptionText } from "../lib/captionLayout";
import { CaptionLines } from "./CaptionLines";

type Props = {
  frameSize?: number; frameWidth?: number; frameHeight?: number;
  layout: CaptionLayout; caption: CaptionText;
  offsetX?: number; offsetY?: number; containerStyle?: StyleProp<ViewStyle>;
};

export function CaptionOverlay(props: Props) {
  return <CaptionOverlayFrame {...props} frameWidth={props.frameSize} frameHeight={props.frameSize} />;
}

export function CaptionOverlayFrame({ frameSize, frameWidth, frameHeight, layout, caption, offsetX = 0, offsetY = 0, containerStyle }: Props) {
  const width = frameWidth ?? frameSize ?? 0;
  return <View pointerEvents="none" style={[{ position: "absolute", left: offsetX, top: offsetY }, containerStyle]}>
    <CaptionLines width={width} height={frameHeight ?? frameSize ?? width} layout={layout} caption={caption} />
  </View>;
}
