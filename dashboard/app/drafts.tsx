import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image, Pressable, ActivityIndicator,
} from "react-native";
import { API_BASE, api, Draft } from "../lib/api";
import { JobLog } from "../components/JobLog";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function DraftsScreen() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { drafts: d } = await api.drafts();
      setDrafts(d);
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

  async function publishAll() {
    setBusy(true);
    try {
      const { jobId: id } = await api.publishDraft({ all: true });
      setJobId(id);
    } catch (e: any) { alert(e.message); setBusy(false); }
  }

  async function publishSelected() {
    if (!selected.size) return;
    setBusy(true);
    const ids = [...selected];
    // Publish each selected draft sequentially by count approach or --all
    // For individual IDs, just use count = 1 per id
    try {
      // Use the first id approach: publish one at a time
      for (const id of ids) {
        const { jobId: jid } = await api.publishDraft({ id });
        setJobId(jid);
        // Wait a bit between jobs
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  async function discardSelected() {
    if (!selected.size) return;
    if (!confirm(`Discard ${selected.size} draft(s)?`)) return;
    setBusy(true);
    try {
      for (const id of [...selected]) {
        const { jobId: jid } = await api.discardDraft({ id });
        setJobId(jid);
        await new Promise(r => setTimeout(r, 300));
      }
      setSelected(new Set());
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  async function discardAll() {
    if (!confirm("Discard ALL drafts?")) return;
    setBusy(true);
    try {
      const { jobId: id } = await api.discardDraft({ all: true });
      setJobId(id);
      setSelected(new Set());
    } catch (e: any) { alert(e.message); setBusy(false); }
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Drafts</Text>
        <Text style={[S.body, { marginLeft: 6 }]}>{drafts.length} ready</Text>
        <View style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <Btn label={`Publish ${selected.size}`} onPress={publishSelected} loading={busy} small />
            <Btn label={`Discard ${selected.size}`} onPress={discardSelected} loading={busy} small variant="ghost" />
          </>
        )}
        {drafts.length > 0 && (
          <>
            <Btn label="Publish All" onPress={publishAll} loading={busy} small />
            <Btn label="Discard All" onPress={discardAll} loading={busy} small variant="danger" />
          </>
        )}
        <Btn label="Refresh" onPress={load} loading={loading} small variant="ghost" />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.grid}>
        {loading && !drafts.length ? (
          <View style={{ padding: 40 }}><ActivityIndicator color={C.accent} /></View>
        ) : drafts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No drafts</Text>
            <Text style={[S.body, { textAlign: "center" }]}>
              Run Generate to create posters, or check the Generate screen.
            </Text>
          </View>
        ) : (
          drafts.map(draft => {
            const sel = selected.has(draft.id);
            const caption = draft.meta?.caption;
            const imgUri = `${API_BASE}/content/drafts/${draft.filename}`;
            return (
              <Pressable
                key={draft.id}
                onPress={() => toggle(draft.id)}
                style={[styles.card, sel && styles.cardSelected]}
              >
                <Image source={{ uri: imgUri }} style={styles.img} resizeMode="cover" />
                {sel && (
                  <View style={styles.checkOverlay}>
                    <Text style={styles.check}>✓</Text>
                  </View>
                )}
                <View style={styles.cardInfo}>
                  {caption ? (
                    <>
                      <Text style={styles.captionSmall}>{caption.smallText}</Text>
                      <Text style={styles.captionBig}>{caption.bigText}</Text>
                    </>
                  ) : (
                    <Text style={styles.captionSmall}>No caption</Text>
                  )}
                  {draft.meta?.scene?.subject && (
                    <Text style={styles.scene} numberOfLines={1}>
                      {draft.meta.scene.subject}
                      {draft.meta.scene.setting ? ` · ${draft.meta.scene.setting}` : ""}
                    </Text>
                  )}
                  <Text style={styles.dateText}>
                    {draft.meta?.generatedAt
                      ? new Date(draft.meta.generatedAt).toLocaleString()
                      : draft.id}
                  </Text>
                  <View style={styles.cardActions}>
                    <Btn label="Publish" small onPress={async () => {
                      setBusy(true);
                      try {
                        const { jobId: id } = await api.publishDraft({ id: draft.id });
                        setJobId(id);
                      } catch (e: any) { alert(e.message); }
                      setBusy(false);
                    }} />
                    <Btn label="Discard" small variant="ghost" onPress={async () => {
                      if (!confirm("Discard this draft?")) return;
                      setBusy(true);
                      try {
                        const { jobId: id } = await api.discardDraft({ id: draft.id });
                        setJobId(id);
                      } catch (e: any) { alert(e.message); }
                      setBusy(false);
                      load();
                    }} />
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {jobId && (
        <View style={styles.logArea}>
          <JobLog jobId={jobId} onDone={() => { load(); setBusy(false); }} />
        </View>
      )}
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
  error: { color: C.danger, padding: 16 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 14,
  },
  empty: { padding: 40, alignItems: "center", gap: 10, flex: 1 },
  emptyTitle: { ...S.h2, color: C.textSecondary },
  card: {
    width: 220,
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardSelected: { borderColor: C.accent },
  img: { width: "100%", height: 220 },
  checkOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  check: { color: C.bg, fontSize: 13, fontWeight: "700" },
  cardInfo: { padding: 12, gap: 3 },
  captionSmall: { color: C.textSecondary, fontSize: 11, fontWeight: "300" },
  captionBig: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
  scene: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  dateText: { color: C.textMuted, fontSize: 10, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: 6, marginTop: 8 },
  logArea: { paddingHorizontal: 20, paddingBottom: 20 },
});
