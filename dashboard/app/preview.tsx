import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Image, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, StorageImage, Draft } from "../lib/api";
import { IPhoneMockup } from "../components/iPhoneMockup/iPhoneMockup";
import { API_BASE } from "../lib/api";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function PreviewScreen() {
  const { width } = useWindowDimensions();
  const narrow = width < 900;

  const [images, setImages] = useState<StorageImage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedUri, setSelectedUri] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<"library" | "drafts">("library");
  const [randomLoading, setRandomLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    // Check if library screen passed us a URI
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("previewUri");
      if (stored) {
        setSelectedUri(stored);
        sessionStorage.removeItem("previewUri");
      }
    }
    loadImages();
    loadDrafts();
  }, []));

  async function loadImages() {
    setLoadingImages(true);
    try {
      const { items } = await api.images();
      setImages(items);
    } catch {}
    setLoadingImages(false);
  }

  async function loadDrafts() {
    try {
      const { drafts: d } = await api.drafts();
      setDrafts(d);
    } catch {}
  }

  async function pickRandom() {
    setRandomLoading(true);
    try {
      // Pick from library randomly
      if (images.length > 0) {
        const pick = images[Math.floor(Math.random() * images.length)];
        setSelectedUri(pick.publicUrl);
      }
    } catch {}
    setRandomLoading(false);
  }

  const mockupSection = (
    <View style={styles.mockupSection}>
      <IPhoneMockup imageUri={selectedUri} />
      <View style={styles.randomRow}>
        <Btn label="Random from Library" onPress={pickRandom} loading={randomLoading} small variant="outline" />
        {selectedUri && (
          <Btn label="Clear" onPress={() => setSelectedUri(undefined)} small variant="ghost" />
        )}
      </View>
    </View>
  );

  const pickerSection = (
    <View style={styles.picker}>
      <View style={styles.pickerTabs}>
        <Pressable onPress={() => setActiveTab("library")} style={[styles.pickerTab, activeTab === "library" && styles.pickerTabActive]}>
          <Text style={[styles.pickerTabLabel, activeTab === "library" && styles.pickerTabLabelActive]}>Library ({images.length})</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("drafts")} style={[styles.pickerTab, activeTab === "drafts" && styles.pickerTabActive]}>
          <Text style={[styles.pickerTabLabel, activeTab === "drafts" && styles.pickerTabLabelActive]}>Drafts ({drafts.length})</Text>
        </Pressable>
      </View>

      {activeTab === "library" && (
        <ScrollView contentContainerStyle={styles.pickerGrid}>
          {loadingImages && <ActivityIndicator color={C.accent} style={{ margin: 20 }} />}
          {images.map(img => (
            <Pressable key={img.storagePath} onPress={() => setSelectedUri(img.publicUrl)}>
              <Image
                source={{ uri: img.publicUrl }}
                style={[styles.pickerThumb, selectedUri === img.publicUrl && styles.pickerThumbSel]}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {activeTab === "drafts" && (
        <ScrollView contentContainerStyle={styles.pickerGrid}>
          {drafts.map(d => {
            const uri = `${API_BASE}/content/drafts/${d.filename}`;
            return (
              <Pressable key={d.id} onPress={() => {
                setSelectedUri(uri);
              }}>
                <Image
                  source={{ uri }}
                  style={[styles.pickerThumb, selectedUri === uri && styles.pickerThumbSel]}
                  resizeMode="cover"
                />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  if (narrow) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={styles.toolbar}>
          <Text style={S.h1}>Preview</Text>
        </View>
        {mockupSection}
        {pickerSection}
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Text style={S.h1}>Preview</Text>
        <Text style={[S.body, { marginLeft: 8 }]}>Tap an image to load it into the mockup</Text>
      </View>
      <View style={styles.split}>
        <View style={styles.left}>{mockupSection}</View>
        <View style={styles.right}>{pickerSection}</View>
      </View>
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
  split: { flex: 1, flexDirection: "row" },
  left: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  right: { width: 320 },

  mockupSection: {
    alignItems: "center",
    gap: 16,
    padding: 16,
  },
  randomRow: { flexDirection: "row", gap: 8 },

  picker: { flex: 1 },
  pickerTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pickerTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  pickerTabActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  pickerTabLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  pickerTabLabelActive: { color: C.accent },
  pickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    gap: 4,
  },
  pickerThumb: {
    width: 74,
    height: 74,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "transparent",
  },
  pickerThumbSel: { borderColor: C.accent },
});
