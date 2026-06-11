import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { C } from "../../lib/theme";
import { WidgetSmall } from "./WidgetSmall";
import { WidgetMedium } from "./WidgetMedium";
import { WidgetLarge } from "./WidgetLarge";

type WidgetSize = "small" | "medium" | "large" | "app";

interface Props {
  imageUri?: string;
  caption?: { smallText: string; bigText: string } | null;
}

export function IPhoneMockup({ imageUri, caption }: Props) {
  const [size, setSize] = useState<WidgetSize>("medium");

  return (
    <View style={styles.wrapper}>
      {/* Size tabs */}
      <View style={styles.tabs}>
        {(["small", "medium", "large", "app"] as WidgetSize[]).map(s => (
          <Pressable
            key={s}
            onPress={() => setSize(s)}
            style={[styles.tab, size === s && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, size === s && styles.tabLabelActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {/* iPhone frame */}
      <View style={styles.phone}>
        {/* Notch area */}
        <View style={styles.topBar}>
          <Text style={styles.timeText}>9:41</Text>
          <View style={styles.notch} />
          <View style={styles.topBarRight}>
            <Text style={styles.statusIcon}>●●●</Text>
          </View>
        </View>

        {/* Screen content */}
        <View style={styles.screen}>
          {size === "app" && (
            <View style={styles.appView}>
              <Text style={styles.appText}>
                Add the widget to your home screen to see a new image every day.
              </Text>
            </View>
          )}

          {size === "small" && (
            <View style={styles.homeScreen}>
              <View style={styles.wallpaperDim} />
              <Text style={styles.homeClock}>9:41</Text>
              <Text style={styles.homeDate}>Thursday, June 11</Text>
              <View style={styles.widgetArea}>
                <WidgetSmall imageUri={imageUri} caption={caption} />
              </View>
            </View>
          )}

          {size === "medium" && (
            <View style={styles.homeScreen}>
              <View style={styles.wallpaperDim} />
              <Text style={styles.homeClock}>9:41</Text>
              <Text style={styles.homeDate}>Thursday, June 11</Text>
              <View style={styles.widgetArea}>
                <WidgetMedium imageUri={imageUri} caption={caption} />
              </View>
            </View>
          )}

          {size === "large" && (
            <ScrollView contentContainerStyle={styles.homeScreen}>
              <View style={styles.wallpaperDim} />
              <Text style={styles.homeClock}>9:41</Text>
              <Text style={styles.homeDate}>Thursday, June 11</Text>
              <View style={styles.widgetArea}>
                <WidgetLarge imageUri={imageUri} caption={caption} />
              </View>
            </ScrollView>
          )}
        </View>

        {/* Home indicator */}
        <View style={styles.homeIndicatorArea}>
          <View style={styles.homeIndicator} />
        </View>
      </View>
    </View>
  );
}

const PHONE_W = 375;
const PHONE_H = 812;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 16,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 3,
    gap: 2,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabActive: { backgroundColor: C.accent },
  tabLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  tabLabelActive: { color: C.bg },

  // iPhone shell
  phone: {
    width: PHONE_W,
    height: PHONE_H,
    backgroundColor: "#1A1A1A",
    borderRadius: 55,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#3A3A3A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
  },
  topBar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    justifyContent: "space-between",
    backgroundColor: "transparent",
    zIndex: 10,
  },
  timeText: { color: "#fff", fontSize: 15, fontWeight: "600", width: 45 },
  notch: {
    width: 120,
    height: 34,
    backgroundColor: "#000",
    borderRadius: 20,
    position: "absolute",
    top: 8,
    alignSelf: "center",
    left: "50%",
    marginLeft: -60,
  },
  topBarRight: { width: 45, alignItems: "flex-end" },
  statusIcon: { color: "#fff", fontSize: 9 },

  screen: {
    flex: 1,
    backgroundColor: "#000",
  },

  // App view (ContentView.swift recreation)
  appView: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  appText: {
    color: "#000",
    fontSize: 17,
    textAlign: "center",
    lineHeight: 24,
  },

  // Home screen (widget views)
  homeScreen: {
    flex: 1,
    backgroundColor: "#1C1C2E",
    alignItems: "center",
    paddingTop: 20,
  },
  wallpaperDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  homeClock: {
    color: "#fff",
    fontSize: 72,
    fontWeight: "200",
    lineHeight: 80,
  },
  homeDate: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 24,
  },
  widgetArea: {
    paddingHorizontal: 16,
    width: "100%",
    alignItems: "center",
  },

  homeIndicatorArea: {
    height: 34,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  homeIndicator: {
    width: 134,
    height: 5,
    backgroundColor: "#fff",
    borderRadius: 3,
    opacity: 0.3,
  },
});
