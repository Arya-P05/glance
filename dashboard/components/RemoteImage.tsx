import React from "react";
import { Image, ImageStyle, Platform, StyleProp, StyleSheet } from "react-native";
import { enqueueImage } from "../lib/image-queue";

function QueuedWebImage({ src, original, priority, onLoad, onError, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError"> & {
  original: string;
  priority: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const element = React.useRef<HTMLImageElement>(null);
  const [visible, setVisible] = React.useState(priority);
  const [attempt, setAttempt] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const finish = React.useRef<(ok: boolean) => void>(() => {});
  const callbacks = React.useRef({ onLoad, onError });
  callbacks.current = { onLoad, onError };

  React.useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [visible]);

  React.useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    let retry: ReturnType<typeof setTimeout>;
    const cancel = enqueueImage(release => {
      finish.current = ok => {
        if (disposed || settled) return;
        settled = true;
        clearTimeout(timeout);
        release();
        if (ok) {
          callbacks.current.onLoad?.();
        } else {
          setReady(false);
          if (attempt < 3) {
            retry = setTimeout(() => setAttempt(value => value + 1), 1000 * 2 ** attempt + Math.random() * 500);
          } else {
            callbacks.current.onError?.();
          }
        }
      };
      setReady(true);
      timeout = setTimeout(() => finish.current(false), 20000);
    });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearTimeout(retry);
      finish.current = () => {};
      cancel();
    };
  }, [visible, attempt]);

  return <img {...props} ref={element} key={attempt}
    src={ready ? (attempt === 3 ? original : src) : undefined}
    onLoad={() => finish.current(true)}
    onError={() => finish.current(false)}
  />;
}

type Props = {
  uri: string;
  onLoad?: () => void;
  onError?: () => void;
  accessibilityLabel?: string;
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
  onLoad,
  onError,
  accessibilityLabel,
}: Props) {
  const src = raw ? uri : previewImageUrl(uri, width, { height, resize: transformResizeMode });

  if (Platform.OS === "web") {
    const flattened = StyleSheet.flatten(style) ?? {};
    return React.createElement(QueuedWebImage, {
      key: src,
      src,
      original: uri,
      priority,
      onLoad,
      onError,
      alt: accessibilityLabel ?? "",
      loading: "eager",
      decoding: "async",
      fetchPriority: priority ? "high" : "low",
      style: {
        width: flattened.width ?? "100%",
        height: flattened.height ?? "100%",
        objectFit: resizeMode === "stretch" ? "fill" : resizeMode === "center" || resizeMode === "repeat" ? "none" : resizeMode,
        opacity: flattened.opacity,
        objectPosition: "center",
        display: "block",
        backgroundColor: flattened.backgroundColor,
        position: flattened.position as React.CSSProperties["position"],
        left: flattened.left,
        top: flattened.top,
        right: flattened.right,
        bottom: flattened.bottom,
        ...webStyle,
      } as React.CSSProperties,
    });
  }

  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} onLoad={onLoad} onError={onError} accessibilityLabel={accessibilityLabel} />;
}
