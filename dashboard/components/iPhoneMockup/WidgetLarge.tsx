import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RemoteImage } from "../RemoteImage";
import { PosterPreview } from "../PosterPreview";
import { CaptionLayout, CaptionText } from "../../lib/captionLayout";

interface Props {
  imageUri?: string;
  posterPreview?: {
    backgroundUri: string;
    caption: CaptionText;
    layout?: Partial<CaptionLayout> | null;
  };
}

export function WidgetLarge({ imageUri, posterPreview }: Props) {
  return (
    <View style={styles.container}>
      {posterPreview ? (
        <PosterPreview
          backgroundUri={posterPreview.backgroundUri}
          caption={posterPreview.caption}
          layout={posterPreview.layout}
          width={329}
          height={329}
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
    height: 329,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#1C1C1E",
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  placeholderIcon: { fontSize: 40 },
  placeholderText: { color: "#666", fontSize: 13 },
});
