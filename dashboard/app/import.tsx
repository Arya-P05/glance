import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput, Image, Pressable, ActivityIndicator,
} from "react-native";
import { api, ImportPreviewItem } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

type Phase = "input" | "preview" | "done";

export default function ImportScreen() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [previews, setPreviews] = useState<ImportPreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { items } = await api.previewImport(input);
      setPreviews(items);
      // Auto-select non-errored items
      const ok = new Set(items.filter(i => !i.error).map(i => itemKey(i)));
      setSelected(ok);
      setPhase("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function itemKey(item: ImportPreviewItem) {
    return `${item.shortcode}-${item.media_index}`;
  }

  function toggle(key: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  async function runImport() {
    const items = previews.filter(i => selected.has(itemKey(i)));
    if (!items.length) return;
    setLoading(true);
    setError(null);
    try {
      const { message: msg } = await api.importPosts(items);
      setMessage(msg);
      setPhase("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setInput("");
    setPreviews([]);
    setSelected(new Set());
    setMessage(null);
    setError(null);
    setPhase("input");
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Import</Text>
        <View style={{ flex: 1 }} />
        {phase !== "input" && (
          <Btn label="Start Over" onPress={reset} small variant="ghost" />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {phase === "input" && (
          <>
            <Text style={[S.body, { marginBottom: 16 }]}>
              Paste Instagram post or reel URLs (one per line). Requires Instaloader:
              {" "}<Text style={{ fontFamily: "monospace" }}>pip3 install instaloader</Text>
            </Text>
            <TextInput
              style={styles.textarea}
              value={input}
              onChangeText={setInput}
              placeholder={"https://www.instagram.com/p/ABC123/\nhttps://www.instagram.com/reel/DEF456/"}
              placeholderTextColor={C.textMuted}
              multiline
              numberOfLines={8}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={{ marginTop: 16 }}>
              <Btn label="Preview" onPress={runPreview} loading={loading} disabled={!input.trim()} />
            </View>
          </>
        )}

        {phase === "preview" && (
          <>
            <View style={styles.previewHeader}>
              <Text style={S.h2}>{previews.length} items resolved</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Btn label="Select All" small variant="ghost" onPress={() => setSelected(new Set(previews.filter(i => !i.error).map(itemKey)))} />
                <Btn label="Clear" small variant="ghost" onPress={() => setSelected(new Set())} />
              </View>
            </View>

            <View style={styles.previewGrid}>
              {previews.map(item => {
                const key = itemKey(item);
                const sel = selected.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => !item.error && toggle(key)}
                    style={[styles.previewCard, sel && styles.previewCardSel, item.error && styles.previewCardErr]}
                  >
                    {item.previewDataUrl ? (
                      <Image source={{ uri: item.previewDataUrl }} style={styles.previewImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <Text style={styles.previewErrText}>{item.error ?? "No preview"}</Text>
                      </View>
                    )}
                    {sel && (
                      <View style={styles.checkOverlay}><Text style={styles.check}>✓</Text></View>
                    )}
                    <Text style={styles.previewLabel} numberOfLines={1}>
                      {item.shortcode}
                      {item.media_count > 1 ? ` (${item.media_index}/${item.media_count})` : ""}
                    </Text>
                    {item.caption && (
                      <Text style={styles.previewCaption} numberOfLines={2}>{item.caption}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={{ marginTop: 16 }}>
              <Btn
                label={`Add ${selected.size} to Glance`}
                onPress={runImport}
                loading={loading}
                disabled={!selected.size}
              />
            </View>
          </>
        )}

        {phase === "done" && (
          <View style={styles.done}>
            <Text style={styles.doneIcon}>✓</Text>
            <Text style={S.h2}>Import complete</Text>
            <Text style={S.body}>{message}</Text>
            <Btn label="Import More" onPress={reset} variant="outline" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CARD = 160;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  content: { padding: 24 },
  textarea: {
    backgroundColor: C.surface,
    color: C.textPrimary,
    fontSize: 13,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 160,
    textAlignVertical: "top",
  },
  error: { color: C.danger, fontSize: 13, marginTop: 8 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  previewCard: {
    width: CARD,
    backgroundColor: C.surface,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  previewCardSel: { borderColor: C.accent },
  previewCardErr: { opacity: 0.5 },
  previewImg: { width: CARD, height: CARD },
  previewPlaceholder: {
    width: CARD,
    height: CARD,
    backgroundColor: C.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  previewErrText: { color: C.danger, fontSize: 10, textAlign: "center" },
  checkOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  check: { color: C.bg, fontSize: 12, fontWeight: "700" },
  previewLabel: { color: C.textMuted, fontSize: 10, padding: 5 },
  previewCaption: { color: C.textSecondary, fontSize: 10, paddingHorizontal: 5, paddingBottom: 5 },
  done: { alignItems: "center", gap: 12, paddingTop: 60 },
  doneIcon: { fontSize: 48, color: C.success },
});
