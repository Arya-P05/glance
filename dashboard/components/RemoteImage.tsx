import React from "react";
import { Image, ImageStyle, Platform, StyleProp, StyleSheet } from "react-native";

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  /** Skip Supabase render transform — use the URL as-is (matches Library thumbnails). */
  raw?: boolean;
  width?: number;
  height?: number;
  transformResizeMode?: "cover" | "contain" | "fill";
  priority?: boolean;
  webStyle?: React.CSSProperties;
};

export function previewImageUrl(
  uri: string,
  width = 640,
  options: { height?: number; resize?: "cover" | "contain" | "fill"; quality?: number } = {}
) {
  if (!uri.includes("/storage/v1/object/public/")) return uri;
  const separator = uri.includes("?") ? "&" : "?";
  const params = [
    `width=${Math.round(width)}`,
    options.height ? `height=${Math.round(options.height)}` : null,
    options.resize ? `resize=${options.resize}` : null,
    `quality=${options.quality ?? 75}`,
  ].filter(Boolean).join("&");
  return uri
    .replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")
    + `${separator}${params}`;
}

export function RemoteImage({
  uri,
  style,
  resizeMode = "cover",
  raw = false,
  width = 640,
  height,
  transformResizeMode,
  priority = false,
  webStyle,
}: Props) {
  const src = raw ? uri : previewImageUrl(uri, width, { height, resize: transformResizeMode });

  if (Platform.OS === "web") {
    const flattened = StyleSheet.flatten(style) ?? {};
    return React.createElement("img", {
      src,
      loading: priority ? "eager" : "lazy",
      decoding: "async",
      fetchPriority: priority ? "high" : "low",
      style: {
        width: flattened.width ?? "100%",
        height: flattened.height ?? "100%",
        objectFit: resizeMode,
        objectPosition: "center",
        display: "block",
        backgroundColor: flattened.backgroundColor,
        position: flattened.position as React.CSSProperties["position"],
        left: flattened.left,
        top: flattened.top,
        right: flattened.right,
        bottom: flattened.bottom,
        ...webStyle,
      },
    });
  }

  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} />;
}
