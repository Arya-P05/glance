import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image, Pressable,
  ActivityIndicator, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { api, StorageImage } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";
import { RemoteImage, previewImageUrl } from "../components/RemoteImage";

type Filter = "active" | "inactive";
const CAROUSEL_SELECTION_KEY = "glance.carouselDraftSelection";

export default function LibraryScreen() {
  const router = useRouter();
  const [images, setImages] = useState<StorageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");
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

  function applyStatus(paths: string[], status: "active" | "inactive") {
    const pathSet = new Set(paths);
    setImages(prev => prev.map(i => pathSet.has(i.storagePath) ? { ...i, status } : i));
    setDetail(d => d && pathSet.has(d.storagePath) ? { ...d, status } : d);
  }

  async function setStatusSelected(status: "active" | "inactive") {
    if (!selected.size) return;
    const paths = [...selected];
    applyStatus(paths, status);
    setSelected(new Set());
    setBusy(true);
    try {
      await api.setImageStatus(paths, status);
    } catch (e: any) {
      alert(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setStatusOne(img: StorageImage, status: "active" | "inactive") {
    applyStatus([img.storagePath], status);
    setDetail(null);
    setBusy(true);
    try {
      await api.setImageStatus([img.storagePath], status);
    } catch (e: any) {
      alert(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function createCarouselFromSelection() {
    const activeSelected = selectedImages.filter(i => i.status === "active");
    if (activeSelected.length !== 5 || activeSelected.length !== selectedImages.length) {
      alert("Pick exactly 5 active Library posts for a carousel.");
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(CAROUSEL_SELECTION_KEY, JSON.stringify(activeSelected.map(i => i.id)));
    }
    router.push("/carousels");
  }

  const filtered = images.filter(i => i.status === filter);
  const selectedImages = [...selected]
    .map(path => images.find(i => i.storagePath === path))
    .filter((img): img is StorageImage => Boolean(img));
  const canCreateCarousel = selectedImages.length === 5 && selectedImages.every(i => i.status === "active");

  const activeCount = images.filter(i => i.status === "active").length;
  const inactiveCount = images.filter(i => i.status === "inactive").length;

  const selectionHasActive = [...selected].some(p => images.find(i => i.storagePath === p)?.status === "active");
  const selectionHasInactive = [...selected].some(p => images.find(i => i.storagePath === p)?.status === "inactive");

  return (
    <View style={styles.root}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={S.h1}>Library</Text>
        <Text style={[S.body, { marginLeft: 6 }]}>
          {filter === "active" ? activeCount : inactiveCount} {filter}
        </Text>
        <View style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            {filter === "active" && (
              <Btn
                label={canCreateCarousel ? "Create carousel" : `${selectedImages.length}/5 for carousel`}
                onPress={createCarouselFromSelection}
                disabled={!canCreateCarousel}
                small
              />
            )}
            {selectionHasActive && (
              <Btn label={`Deactivate ${selected.size}`} onPress={() => setStatusSelected("inactive")} loading={busy} small variant="outline" />
            )}
            {selectionHasInactive && (
              <Btn label={`Reactivate ${selected.size}`} onPress={() => setStatusSelected("active")} loading={busy} small />
            )}
            <Btn label="Clear" onPress={() => setSelected(new Set())} small variant="ghost" />
          </>
        )}
        {selected.size === 0 && (
          <Btn label="Refresh" onPress={load} loading={loading} small variant="ghost" />
        )}
      </View>

      {filter === "active" && selectedImages.length > 0 && (
        <View style={styles.carouselTray}>
          <View style={styles.carouselTrayText}>
            <Text style={styles.carouselTrayTitle}>Carousel draft</Text>
            <Text style={styles.carouselTrayHint}>Pick 5 active posts in the order you want them to appear.</Text>
          </View>
          <View style={styles.carouselTrayThumbs}>
            {selectedImages.slice(0, 5).map((img, idx) => (
              <View key={img.id} style={styles.carouselTrayThumbWrap}>
                <RemoteImage uri={img.publicUrl} width={96} style={styles.carouselTrayThumb} resizeMode="cover" priority={idx < 2} />
                <View style={styles.carouselTrayNumber}><Text style={styles.carouselTrayNumberText}>{idx + 1}</Text></View>
              </View>
            ))}
            {Array.from({ length: Math.max(0, 5 - selectedImages.length) }).map((_, idx) => (
              <View key={`empty-${idx}`} style={[styles.carouselTrayThumbWrap, styles.carouselTrayEmpty]}>
                <Text style={styles.carouselTrayEmptyText}>{selectedImages.length + idx + 1}</Text>
              </View>
            ))}
          </View>
          <Btn
            label="Create carousel"
            onPress={createCarouselFromSelection}
            disabled={!canCreateCarousel}
            small
          />
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {([
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
                <RemoteImage
                  uri={img.publicUrl}
                  width={Math.ceil(CELL * 1.5)}
                  style={styles.thumb}
                  resizeMode="cover"
                />
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
              {filter === "inactive" ? "No inactive images." : "No active images."}
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
                <Image source={{ uri: previewImageUrl(detail.publicUrl, 1200) }} style={styles.modalImg} resizeMode="contain" />
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
                    await api.deleteImage({ id: detail.id, storagePath: detail.storagePath }).catch(e => alert(e.message));
                    setBusy(false);
                    setDetail(null);
                    setSelected(prev => {
                      const next = new Set(prev);
                      next.delete(detail.storagePath);
                      return next;
                    });
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
  carouselTray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
    flexWrap: "wrap",
  },
  carouselTrayText: { minWidth: 190, gap: 2 },
  carouselTrayTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  carouselTrayHint: { color: C.textMuted, fontSize: 11 },
  carouselTrayThumbs: { flexDirection: "row", gap: 6, alignItems: "center" },
  carouselTrayThumbWrap: {
    width: 46,
    height: 46,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
  },
  carouselTrayThumb: { width: "100%", height: "100%" },
  carouselTrayNumber: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  carouselTrayNumberText: { color: C.bg, fontSize: 9, fontWeight: "800" },
  carouselTrayEmpty: { alignItems: "center", justifyContent: "center", borderStyle: "dashed" },
  carouselTrayEmptyText: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
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
