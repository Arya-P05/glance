import React from "react";
import { Image, ImageStyle, Platform, StyleProp, StyleSheet } from "react-native";

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  webStyle?: React.CSSProperties;
};

export function previewImageUrl(uri: string, width = 640) {
  if (!uri.includes("/storage/v1/object/public/")) return uri;
  return uri
    .replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")
    + `?width=${width}&quality=85`;
}

export function RemoteImage({ uri, style, resizeMode = "cover", webStyle }: Props) {
  const src = previewImageUrl(uri);

  if (Platform.OS === "web") {
    const flattened = StyleSheet.flatten(style) ?? {};
    return React.createElement("img", {
      src,
      style: {
        width: flattened.width ?? "100%",
        height: flattened.height ?? "100%",
        objectFit: resizeMode,
        display: "block",
        backgroundColor: flattened.backgroundColor,
        ...webStyle,
      },
    });
  }

  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} />;
}
