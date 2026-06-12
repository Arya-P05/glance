import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RemoteImage } from "../RemoteImage";
import { PosterPreview } from "../PosterPreview";
import { CaptionLayout, CaptionText } from "../../lib/captionLayout";

interface Props {
  imageUri?: string;
  caption?: CaptionText | null;
  posterPreview?: {
    backgroundUri: string;
    caption: CaptionText;
    layout?: Partial<CaptionLayout> | null;
  };
}

export function WidgetSmall({ imageUri, caption, posterPreview }: Props) {
  return (
    <View style={styles.container}>
      {posterPreview ? (
        <PosterPreview
          backgroundUri={posterPreview.backgroundUri}
          caption={posterPreview.caption}
          layout={posterPreview.layout}
          width={155}
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
    width: 155,
    height: 155,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#1C1C1E",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
  },
  small: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "300",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  big: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderIcon: { fontSize: 28 },
  placeholderText: { color: "#666", fontSize: 11 },
});
