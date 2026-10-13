import { layoutCaptionGlyphs } from "../lib/captionFont";
import { RemoteImage } from "../components/RemoteImage";
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, StorageImage } from "../lib/api";
import { CaptionLayout, CaptionText, normalizeCaptionLayout } from "../lib/captionLayout";
import { CaptionLines } from "../components/CaptionLines";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function TypographyScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const size = Math.min(640, Math.max(260, width - C.sidebarW - 64));
  const [image, setImage] = useState<StorageImage | null>(null);
  const [caption, setCaption] = useState<CaptionText>({ smallText: "", bigText: "" });
  const [layout, setLayout] = useState<CaptionLayout>(() => normalizeCaptionLayout({ smallFontRatio: .02875, bigFontRatio: 53.5 / 1024, smallYRatio: 153 / 640, smallXRatio: 162 / 640, bigXRatio: 260 / 640 }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOverlay, setShowOverlay] = useState(true);
  const [faded, setFaded] = useState(false);
  const [imageStatus, setImageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [imageAttempt, setImageAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.images(), api.typography()]).then(([{ items }, { defaults }]) => {
      if (!active) return;
      const selected = items.find(item => item.id === reference);
      if (!selected) throw new Error("Choose a reference image from Library first.");
      setImageStatus("loading"); setImageAttempt(0); setFaded(false);
      setImage(selected);
      setCaption(selected.referenceText ?? { smallText: "", bigText: "" });
      setLayout(normalizeCaptionLayout({ ...(defaults ?? { smallFontRatio: .02875, bigFontRatio: 53.5 / 1024 }), smallYRatio: 153 / 640, smallXRatio: 162 / 640, bigXRatio: 260 / 640 }));
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reference]);
  const unsupported = layoutCaptionGlyphs(caption.smallText + caption.bigText, 1).unsupported;
  function updateLayout(next: CaptionLayout) { setLayout(next); }
  return <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.page}>
    <View style={styles.row}><Text style={S.h1}>Typography reference</Text><Btn label="Back to Library" onPress={() => router.push("/library")} variant="ghost" /></View>
    <Text style={styles.copy}>Font sizes and vertical spacing are locked for all new images. Move each line left or right independently; drag up or down to move both together.</Text>
    {loading ? <ActivityIndicator color={C.accent} /> : image && <View style={styles.workspace}>
      <View style={{ gap: 12 }}>
        <View style={{ width: size, height: size, backgroundColor: "#ddd", overflow: "hidden" }}>
          <RemoteImage key={`${image.id}:${imageAttempt}`} uri={image.publicUrl + (imageAttempt ? `${image.publicUrl.includes("?") ? "&" : "?"}referenceRetry=${imageAttempt}` : "")}
            raw priority accessibilityLabel="Original reference image" resizeMode="cover"
            onLoad={() => setImageStatus("ready")} onError={() => setImageStatus("error")}
            style={{ width: size, height: size, opacity: faded ? .45 : 1 }} />
          {imageStatus !== "ready" && <View style={{ position: "absolute", inset: 0, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", gap: 12 }}>
            {imageStatus === "loading" ? <><ActivityIndicator color={C.accent} /><Text style={styles.copy}>Loading original image…</Text></> : <>
              <Text accessibilityRole="alert" style={styles.copy}>The original image could not load.</Text>
              <Btn label="Retry original image" onPress={() => { setImageStatus("loading"); setImageAttempt(value => value + 1); }} variant="outline" />
            </>}
          </View>}
          {showOverlay && imageStatus === "ready" && <CaptionLines width={size} height={size} {...{ layout, caption }} onChange={updateLayout} />}
        </View>
        <View style={styles.row}>
          <Btn label={showOverlay ? "Hide editable text" : "Show editable text"} onPress={() => setShowOverlay(!showOverlay)} variant="outline" small />
          <Btn label={faded ? "Show full original" : "Fade original"} onPress={() => setFaded(!faded)} variant="outline" small />
        </View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.title}>Locked typography</Text>
        <Text style={styles.copy}>Heavy reference lettering · identical outlines in preview and export.</Text>
        <Text style={styles.copy}>{image.referenceText ? "Text loaded from the original image transcription. Correct it below if needed." : "Type the two lines exactly as they appear in the original image."}</Text>
        {(["small", "big"] as const).map((line, index) => <View key={line} style={styles.group}>
          <Text style={styles.label}>{index === 0 ? "First line" : "Second line"}</Text>
          <TextInput accessibilityLabel={`${index === 0 ? "First" : "Second"} line text`} value={caption[line === "small" ? "smallText" : "bigText"]}
            onChangeText={text => { setCaption(current => ({ ...current, [line === "small" ? "smallText" : "bigText"]: text })); }} style={styles.input} />

        </View>)}
        <Text style={styles.copy}>First line: 29.44px · Second line: 53.50px at 1024px width. Sizes and spacing scale proportionally for preview and export.</Text>
        <View style={styles.row}>
          <Btn label="Black text" variant={layout.textColor === "#050505" ? "primary" : "outline"} onPress={() => updateLayout({ ...layout, textColor: "#050505" })} small />
          <Btn label="White text" variant={layout.textColor === "#ffffff" ? "primary" : "outline"} onPress={() => updateLayout({ ...layout, textColor: "#ffffff" })} small />
        </View>
        {!!unsupported.length && <Text style={{ color: C.danger }}>Replace unsupported characters: {unsupported.join(" ")}</Text>}
      </View>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={{ color: C.danger }}>{error}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 20 }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  workspace: { flexDirection: "row", flexWrap: "wrap", gap: 28 }, panel: { width: 330, gap: 20 },
  group: { gap: 10 }, title: { color: C.textPrimary, fontSize: 18, fontWeight: "600" },
  copy: { color: C.textSecondary, fontSize: 13, lineHeight: 20, maxWidth: 850 },
  label: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  input: { color: C.textPrimary, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, fontSize: 14 },
});
