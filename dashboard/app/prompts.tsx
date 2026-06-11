import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { api, Prompt } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function PromptsScreen() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const { prompts: p } = await api.prompts();
      setPrompts(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Prompts</Text>
        <Text style={[S.body, { marginLeft: 6 }]}>{prompts.length} saved</Text>
        <View style={{ flex: 1 }} />
        <Btn label="Refresh" onPress={load} loading={loading} small variant="ghost" />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.list}>
        {loading && !prompts.length && (
          <View style={{ padding: 40 }}><ActivityIndicator color={C.accent} /></View>
        )}
        {prompts.length === 0 && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No saved prompts</Text>
            <Text style={S.body}>
              Run Generate with mode "Prompts Only" to save reusable scene prompts.
            </Text>
          </View>
        )}
        {prompts.map(p => {
          const open = expanded === p.id;
          const scene = p.data?.scene ?? {};
          return (
            <Pressable key={p.id} onPress={() => setExpanded(open ? null : p.id)} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.promptId}>{p.id}</Text>
                  {scene.subject && (
                    <Text style={styles.sceneSummary}>
                      {[scene.subject, scene.setting, scene.action].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
                <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
              </View>

              {open && (
                <View style={styles.expanded}>
                  {Object.entries(scene).length > 0 && (
                    <View style={styles.sceneGrid}>
                      {Object.entries(scene).map(([k, v]) => (
                        <View key={k} style={styles.sceneRow}>
                          <Text style={styles.sceneKey}>{k}</Text>
                          <Text style={styles.sceneVal}>{v}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {p.imagePrompt && (
                    <>
                      <Text style={[S.label, { marginTop: 14, marginBottom: 6 }]}>Image Prompt</Text>
                      <View style={styles.promptBox}>
                        <Text style={styles.promptText}>{p.imagePrompt}</Text>
                      </View>
                    </>
                  )}
                  {p.data?.generatedAt && (
                    <Text style={styles.meta}>
                      Generated {new Date(p.data.generatedAt).toLocaleString()}
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  error: { color: C.danger, padding: 16 },
  list: { padding: 20, gap: 8 },
  empty: { padding: 40, alignItems: "center", gap: 10 },
  emptyTitle: { ...S.h2, color: C.textSecondary },
  card: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  promptId: { color: C.textPrimary, fontSize: 12, fontFamily: "monospace" },
  sceneSummary: { color: C.textSecondary, fontSize: 12, marginTop: 3 },
  chevron: { color: C.textMuted, fontSize: 12 },
  expanded: {
    padding: 14,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  sceneGrid: { gap: 4, marginTop: 12 },
  sceneRow: { flexDirection: "row", gap: 10 },
  sceneKey: { color: C.textMuted, fontSize: 11, width: 100, textTransform: "capitalize" },
  sceneVal: { color: C.textSecondary, fontSize: 12, flex: 1 },
  promptBox: {
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  promptText: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  meta: { color: C.textMuted, fontSize: 11, marginTop: 10 },
});
