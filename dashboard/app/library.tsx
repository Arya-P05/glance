import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image, Pressable,
  TextInput, ActivityIndicator, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { api, StorageImage } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function LibraryScreen() {
  const router = useRouter();
  const [images, setImages] = useState<StorageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<StorageImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { items } = await api.images();
      setImages(items);
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
    if (!confirm(`Delete ${selected.size} image(s)? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      await api.deleteImages([...selected]);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const filtered = search
    ? images.filter(i => i.storagePath.toLowerCase().includes(search.toLowerCase()))
    : images;

  return (
    <View style={styles.root}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={S.h1}>Library</Text>
        <Text style={[S.body, { marginLeft: 8 }]}>{images.length} images</Text>
        <View style={{ flex: 1 }} />
        {selected.size > 0 && (
          <Btn label={`Delete ${selected.size}`} onPress={deleteSelected} loading={deleting} variant="danger" small />
        )}
        {selected.size > 0 && (
          <Btn label="Preview" onPress={() => {
            const first = images.find(i => selected.has(i.storagePath));
            if (first) {
              // Store in sessionStorage and navigate to preview
              if (typeof window !== "undefined") {
                sessionStorage.setItem("previewUri", first.publicUrl);
              }
              router.push("/preview");
            }
          }} small variant="outline" />
        )}
        <Btn label="Refresh" onPress={load} loading={loading} variant="ghost" small />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Filter by filename…"
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {selected.size > 0 && (
          <Btn label="Clear" onPress={() => setSelected(new Set())} small variant="ghost" />
        )}
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
            return (
              <Pressable
                key={img.storagePath}
                onPress={() => toggle(img.storagePath)}
                onLongPress={() => setDetail(img)}
                style={[styles.cell, sel && styles.cellSelected]}
              >
                <Image source={{ uri: img.publicUrl }} style={styles.thumb} resizeMode="cover" />
                {sel && <View style={styles.checkOverlay}><Text style={styles.check}>✓</Text></View>}
                <Text style={styles.name} numberOfLines={1}>
                  {img.storagePath.replace("posts/", "")}
                </Text>
              </Pressable>
            );
          })}
          {filtered.length === 0 && !loading && (
            <Text style={[S.body, { margin: 24 }]}>No images found.</Text>
          )}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalBg} onPress={() => setDetail(null)}>
          <View style={styles.modalCard}>
            {detail && (
              <>
                <Image source={{ uri: detail.publicUrl }} style={styles.modalImg} resizeMode="contain" />
                <Text style={styles.modalPath}>{detail.storagePath}</Text>
                <View style={styles.modalActions}>
                  <Btn label="Preview in iPhone" onPress={() => {
                    if (typeof window !== "undefined") sessionStorage.setItem("previewUri", detail.publicUrl);
                    setDetail(null);
                    router.push("/preview");
                  }} small />
                  <Btn label="Delete" onPress={async () => {
                    if (!confirm("Delete this image?")) return;
                    await api.deleteImages([detail.storagePath]);
                    setDetail(null);
                    load();
                  }} small variant="danger" />
                  <Btn label="Close" onPress={() => setDetail(null)} small variant="ghost" />
                </View>
              </>
            )}
          </View>
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  search: {
    flex: 1,
    backgroundColor: C.surface,
    color: C.textPrimary,
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
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
  thumb: { width: CELL, height: CELL },
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
  name: {
    color: C.textMuted,
    fontSize: 10,
    padding: 5,
    backgroundColor: C.surface,
  },
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
  modalPath: { color: C.textSecondary, fontSize: 12 },
  modalActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
