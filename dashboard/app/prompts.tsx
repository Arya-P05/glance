import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Modal } from "react-native";
import { RefreshDouble, MoreHoriz } from "iconoir-react-native";
import { useRouter } from "expo-router";
import { api, Prompt } from "../lib/api";
import { Btn } from "../components/Btn";
import { JobLog } from "../components/JobLog";
import { C, S } from "../lib/theme";

export default function PromptsScreen() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { prompts: p } = await api.prompts();
      setPrompts(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggle(id: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function generateSelected() {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      const { jobId: id } = await api.generate({
        mode: "full",
        promptIds: [...selected],
        count: selected.size,
      });
      setJobId(id);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  async function generateOne(promptId: string) {
    setBusy(true);
    try {
      const { jobId: id } = await api.generate({
        mode: "full",
        promptIds: [promptId],
        count: 1,
      });
      setJobId(id);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  const detail = expanded ? prompts.find(p => p.id === expanded) ?? null : null;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Prompts</Text>
        {!loading && prompts.length > 0 && (
          <Text style={[S.body, { marginLeft: 6 }]}>{prompts.length} saved</Text>
        )}
        <View style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <Btn
              label={`Generate ${selected.size} selected`}
              onPress={generateSelected}
              loading={busy}
              small
            />
            <Btn label="Clear" onPress={() => setSelected(new Set())} small variant="ghost" />
          </>
        )}
        <Pressable onPress={load} style={styles.refreshBtn} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={C.textMuted} />
            : <RefreshDouble color={C.textSecondary} width={16} height={16} />
          }
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.list}>
        {loading && !prompts.length && (
          <View style={{ padding: 40 }}><ActivityIndicator color={C.accent} /></View>
        )}
        {prompts.length === 0 && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No saved prompts</Text>
            <Text style={[S.body, { textAlign: "center" }]}>
              Run Generate with mode "Prompts Only" to save reusable scene prompts.
            </Text>
          </View>
        )}

        {prompts.map(p => {
          const scene = p.data?.scene ?? {};
          const sel = selected.has(p.id);
          const summary = [scene.subject, scene.setting, scene.action].filter(Boolean).join(" · ");
          const mood = scene.mood ?? scene.style ?? null;

          return (
            <View key={p.id} style={[styles.card, sel && styles.cardSelected]}>
              <Pressable
                style={styles.cardHeader}
                onPress={() => toggle(p.id)}
              >
                {/* Checkbox */}
                <View style={[styles.checkbox, sel && styles.checkboxOn]}>
                  {sel && <Text style={styles.checkmark}>✓</Text>}
                </View>

                {/* Content */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.subject} numberOfLines={1}>
                    {scene.subject ?? p.id}
                  </Text>
                  {summary && (
                    <Text style={styles.summary} numberOfLines={1}>{summary}</Text>
                  )}
                  {mood && (
                    <Text style={styles.mood} numberOfLines={1}>{mood}</Text>
                  )}
                </View>

                {/* Actions */}
                <Pressable
                  onPress={e => { e.stopPropagation?.(); generateOne(p.id); }}
                  style={styles.genBtn}
                >
                  <Text style={styles.genBtnText}>Generate</Text>
                </Pressable>
                <Pressable
                  onPress={e => { e.stopPropagation?.(); setExpanded(p.id); }}
                  style={styles.detailBtn}
                >
                  <MoreHoriz color={C.textSecondary} width={18} height={18} />
                </Pressable>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {jobId && (
        <View style={styles.logArea}>
          <JobLog jobId={jobId} onDone={() => {
            setBusy(false);
            setJobId(null);
          }} />
        </View>
      )}

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setExpanded(null)}>
        <Pressable style={styles.modalBg} onPress={() => setExpanded(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation?.()}>
            {detail && (() => {
              const scene = detail.data?.scene ?? {};
              return (
                <>
                  <Text style={styles.modalTitle}>{scene.subject ?? detail.id}</Text>

                  {Object.keys(scene).length > 0 && (
                    <View style={styles.sceneGrid}>
                      {Object.entries(scene).map(([k, v]) => (
                        <View key={k} style={styles.sceneRow}>
                          <Text style={styles.sceneKey}>{k}</Text>
                          <Text style={styles.sceneVal}>{v as string}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {detail.imagePrompt && (
                    <>
                      <Text style={styles.sectionLabel}>Image Prompt</Text>
                      <View style={styles.promptBox}>
                        <Text style={styles.promptText}>{detail.imagePrompt}</Text>
                      </View>
                    </>
                  )}

                  {detail.data?.generatedAt && (
                    <Text style={styles.metaText}>
                      Generated {new Date(detail.data.generatedAt).toLocaleString()}
                    </Text>
                  )}

                  <View style={styles.modalActions}>
                    <Btn label="Generate from this" onPress={() => {
                      setExpanded(null);
                      generateOne(detail.id);
                    }} loading={busy} small />
                    <Btn label="Close" onPress={() => setExpanded(null)} small variant="ghost" />
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
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
    flexWrap: "wrap",
  },
  refreshBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshIcon: { color: C.textSecondary, fontSize: 16 },
  error: { color: C.danger, padding: 16 },
  list: { padding: 16, gap: 6 },
  empty: { padding: 40, alignItems: "center", gap: 10 },
  emptyTitle: { color: C.textSecondary, fontSize: 18, fontWeight: "700" },

  card: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  cardSelected: { borderColor: C.accent, backgroundColor: "#111A0A" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: C.bg, fontSize: 11, fontWeight: "700" },

  subject: { color: C.textPrimary, fontSize: 14, fontWeight: "600" },
  summary: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  mood: { color: C.textMuted, fontSize: 11, marginTop: 1 },

  genBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: C.accent,
    flexShrink: 0,
  },
  genBtnText: { color: C.bg, fontSize: 12, fontWeight: "700" },
  detailBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: C.surfaceHigh,
    flexShrink: 0,
  },
  detailBtnText: { color: C.textSecondary, fontSize: 14 },

  logArea: { paddingHorizontal: 20, paddingBottom: 20 },

  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 24,
    width: 520,
    maxWidth: "90%",
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "700" },
  sectionLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sceneGrid: { gap: 5 },
  sceneRow: { flexDirection: "row", gap: 10 },
  sceneKey: {
    color: C.textMuted,
    fontSize: 11,
    width: 90,
    textTransform: "capitalize",
    flexShrink: 0,
  },
  sceneVal: { color: C.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  promptBox: {
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  promptText: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  metaText: { color: C.textMuted, fontSize: 11 },
  modalActions: { flexDirection: "row", gap: 8 },
});
