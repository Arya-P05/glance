import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RemoteImage } from "../RemoteImage";
import { PosterPreview } from "../PosterPreview";
import { CaptionLayout, CaptionText, MediumCaptionLayout } from "../../lib/captionLayout";

interface Props {
  imageUri?: string;
  posterPreview?: {
    backgroundUri: string;
    caption: CaptionText;
    layout?: Partial<CaptionLayout> | null;
    mediumLayout?: Partial<MediumCaptionLayout> | null;
  };
}

export function WidgetMedium({ imageUri, posterPreview }: Props) {
  return (
    <View style={styles.container}>
      {posterPreview ? (
        <PosterPreview
          backgroundUri={posterPreview.backgroundUri}
          caption={posterPreview.caption}
          layout={posterPreview.mediumLayout ?? posterPreview.layout}
          cropLayout={posterPreview.mediumLayout}
          layoutSpace={posterPreview.mediumLayout ? "frame" : "source"}
          width={329}
          height={155}
        />
      ) : imageUri ? (
        <RemoteImage uri={imageUri} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>🖼</Text>
          <Text style={styles.placeholderText}>No image</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 329,
    height: 155,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#1C1C1E",
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderIcon: { fontSize: 32 },
  placeholderText: { color: "#666", fontSize: 12 },
});
