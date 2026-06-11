import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image, Pressable,
  ActivityIndicator, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { api, StorageImage } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

type Filter = "all" | "active" | "inactive";

export default function LibraryScreen() {
  const router = useRouter();
  const [images, setImages] = useState<StorageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<StorageImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { items } = await api.images();
      setImages(items); // already sorted newest-first from the API
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggle(path: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Permanently delete ${selected.size} image(s) from Supabase? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteImages([...selected]);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatusSelected(status: "active" | "inactive") {
    if (!selected.size) return;
    setBusy(true);
    try {
      await api.setImageStatus([...selected], status);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatusOne(img: StorageImage, status: "active" | "inactive") {
    setBusy(true);
    try {
      await api.setImageStatus([img.storagePath], status);
      setDetail(null);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = images.filter(i =>
    filter === "all" ? true : i.status === filter
  );

  const activeCount = images.filter(i => i.status === "active").length;
  const inactiveCount = images.filter(i => i.status === "inactive").length;

  const selectionHasActive = [...selected].some(p => images.find(i => i.storagePath === p)?.status === "active");
  const selectionHasInactive = [...selected].some(p => images.find(i => i.storagePath === p)?.status === "inactive");

  return (
    <View style={styles.root}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={S.h1}>Library</Text>
        <Text style={[S.body, { marginLeft: 6 }]}>{images.length} images</Text>
        <View style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            {selectionHasActive && (
              <Btn label={`Deactivate ${selected.size}`} onPress={() => setStatusSelected("inactive")} loading={busy} small variant="outline" />
            )}
            {selectionHasInactive && (
              <Btn label={`Reactivate ${selected.size}`} onPress={() => setStatusSelected("active")} loading={busy} small />
            )}
            <Btn label={`Delete ${selected.size}`} onPress={deleteSelected} loading={busy} small variant="danger" />
            <Btn label="Clear" onPress={() => setSelected(new Set())} small variant="ghost" />
          </>
        )}
        {selected.size === 0 && (
          <Btn label="Refresh" onPress={load} loading={loading} small variant="ghost" />
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {([
          { id: "all" as Filter, label: `All (${images.length})` },
          { id: "active" as Filter, label: `Active (${activeCount})` },
          { id: "inactive" as Filter, label: `Inactive (${inactiveCount})` },
        ]).map(tab => (
          <Pressable
            key={tab.id}
            onPress={() => { setFilter(tab.id); setSelected(new Set()); }}
            style={[styles.filterTab, filter === tab.id && styles.filterTabActive]}
          >
            <Text style={[styles.filterLabel, filter === tab.id && styles.filterLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading && !images.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
          <Text style={[S.body, { marginTop: 12 }]}>Loading…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {filtered.map(img => {
            const sel = selected.has(img.storagePath);
            const inactive = img.status === "inactive";
            return (
              <Pressable
                key={img.storagePath}
                onPress={() => toggle(img.storagePath)}
                onLongPress={() => setDetail(img)}
                style={[styles.cell, sel && styles.cellSelected, inactive && styles.cellInactive]}
              >
                <Image source={{ uri: img.publicUrl }} style={styles.thumb} resizeMode="cover" />
                {inactive && (
                  <View style={styles.inactiveBadge}>
                    <Text style={styles.inactiveBadgeText}>off</Text>
                  </View>
                )}
                {sel && <View style={styles.checkOverlay}><Text style={styles.check}>✓</Text></View>}
                {img.createdAt && (
                  <Text style={styles.date}>
                    {new Date(img.createdAt).toLocaleDateString()}
                  </Text>
                )}
              </Pressable>
            );
          })}
          {filtered.length === 0 && !loading && (
            <Text style={[S.body, { margin: 24 }]}>
              {filter === "inactive" ? "No inactive images." : "No images found."}
            </Text>
          )}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalBg} onPress={() => setDetail(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation?.()}>
            {detail && (
              <>
                <Image source={{ uri: detail.publicUrl }} style={styles.modalImg} resizeMode="contain" />
                <View style={styles.modalMeta}>
                  <View style={[styles.statusPill, detail.status === "active" ? styles.pillActive : styles.pillInactive]}>
                    <Text style={styles.pillText}>{detail.status}</Text>
                  </View>
                  {detail.caption && (
                    <Text style={styles.modalCaption} numberOfLines={3}>{detail.caption}</Text>
                  )}
                  {detail.createdAt && (
                    <Text style={styles.modalDate}>Added {new Date(detail.createdAt).toLocaleString()}</Text>
                  )}
                </View>
                <View style={styles.modalActions}>
                  {detail.status === "active" ? (
                    <Btn label="Deactivate" onPress={() => setStatusOne(detail, "inactive")} loading={busy} small variant="outline" />
                  ) : (
                    <Btn label="Reactivate" onPress={() => setStatusOne(detail, "active")} loading={busy} small />
                  )}
                  <Btn label="Preview" onPress={() => {
                    if (typeof window !== "undefined") sessionStorage.setItem("previewUri", detail.publicUrl);
                    setDetail(null);
                    router.push("/preview");
                  }} small variant="outline" />
                  <Btn label="Delete" onPress={async () => {
                    if (!confirm("Permanently delete this image?")) return;
                    setBusy(true);
                    await api.deleteImages([detail.storagePath]).catch(e => alert(e.message));
                    setBusy(false);
                    setDetail(null);
                    load();
                  }} small variant="danger" />
                  <Btn label="Close" onPress={() => setDetail(null)} small variant="ghost" />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL = 160;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexWrap: "wrap",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterTabActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  filterLabelActive: { color: C.bg },
  error: { color: C.danger, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 10,
  },
  cell: {
    width: CELL,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cellSelected: { borderColor: C.accent },
  cellInactive: { opacity: 0.45 },
  thumb: { width: CELL, height: CELL },
  inactiveBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  inactiveBadgeText: { color: C.textMuted, fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
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
  date: {
    color: C.textMuted,
    fontSize: 9,
    padding: 4,
    backgroundColor: C.surface,
    textAlign: "center",
  },

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
    padding: 20,
    width: 420,
    maxWidth: "90%",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalImg: { width: "100%", height: 300, borderRadius: 10 },
  modalMeta: { gap: 6 },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillActive: { backgroundColor: C.successDim },
  pillInactive: { backgroundColor: C.surfaceHigh },
  pillText: { color: C.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  modalCaption: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  modalDate: { color: C.textMuted, fontSize: 11 },
  modalActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
