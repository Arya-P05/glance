import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, Image } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Home, MediaImage, Frame, List, Sparks, Download, Import, Eye, Settings, NavArrowLeft, AlbumCarousel,
} from "iconoir-react-native";
import { C } from "../lib/theme";

type NavIcon = React.ComponentType<{ color?: string; width?: number; height?: number; strokeWidth?: number }>;

const NAV: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/",           label: "Overview",    Icon: Home },
  { href: "/generate",   label: "Generate",    Icon: Sparks },
  { href: "/prompts",    label: "Prompts",     Icon: List },
  { href: "/backgrounds",label: "Backgrounds", Icon: MediaImage },
  { href: "/drafts",     label: "Drafts",      Icon: Frame },
  { href: "/library",    label: "Library",     Icon: MediaImage },
  { href: "/carousels",  label: "Carousels",   Icon: AlbumCarousel },
  { href: "/preview",    label: "Preview",     Icon: Eye },
  { href: "/scrape",     label: "Scrape",      Icon: Download },
  { href: "/import",     label: "Import",      Icon: Import },
  { href: "/maintenance",label: "Maintenance", Icon: Settings },
];

const SIDEBAR_STORAGE_KEY = "glance.sidebarCollapsed";
const APP_ICON = require("../assets/mobile-app-icon.png");

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      <View style={styles.brand}>
        {collapsed ? (
          <Pressable
            accessibilityLabel="Open sidebar"
            onPress={onToggle}
            style={styles.logoSlot}
          >
            <Image source={APP_ICON} style={styles.logoImage} />
          </Pressable>
        ) : (
          <>
            <View style={styles.brandTitle}>
              <View style={styles.logoSlot}>
                <Image source={APP_ICON} style={styles.logoImage} />
              </View>
              <Text style={styles.brandName}>glance</Text>
            </View>
            <Pressable
              accessibilityLabel="Close sidebar"
              onPress={onToggle}
              style={styles.sidebarToggle}
            >
              <NavArrowLeft color={C.textSecondary} width={16} height={16} strokeWidth={2} />
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.nav}>
        {NAV.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const navStyle = StyleSheet.flatten([
            styles.navItem,
            active ? styles.navItemActive : null,
          ]);
          const labelStyle = StyleSheet.flatten([styles.navLabel, active ? styles.navLabelActive : null]);
          return (
            <Pressable
              key={item.href}
              accessibilityLabel={item.label}
              style={navStyle}
              onPress={() => router.push(item.href as any)}
            >
              <View style={styles.navIconSlot}>
                <item.Icon
                  color={active ? C.accent : C.textMuted}
                  width={16}
                  height={16}
                  strokeWidth={1.8}
                />
              </View>
              {!collapsed && <Text style={labelStyle}>{item.label}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerDotSlot}>
          <View style={styles.footerDot} />
        </View>
        {!collapsed && <Text style={styles.footerText}>localhost:3847</Text>}
      </View>
    </View>
  );
}

export default function RootLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const showSidebar = isWeb && width > 600;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;
    setSidebarCollapsed(window.localStorage?.getItem(SIDEBAR_STORAGE_KEY) === "true");
  }, [isWeb]);

  function toggleSidebar() {
    setSidebarCollapsed((nextCollapsed) => {
      const value = !nextCollapsed;
      if (isWeb && typeof window !== "undefined") {
        window.localStorage?.setItem(SIDEBAR_STORAGE_KEY, String(value));
      }
      return value;
    });
  }

  if (showSidebar) {
    return (
      <View style={styles.root}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.surface },
          headerTintColor: C.textPrimary,
          contentStyle: { backgroundColor: C.bg },
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: C.bg },
  sidebar: {
    width: C.sidebarW,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingTop: 24,
    paddingBottom: 16,
    justifyContent: "space-between",
    overflow: "hidden",
    transitionProperty: "width" as any,
    transitionDuration: "180ms" as any,
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" as any,
  },
  sidebarCollapsed: {
    width: 54,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 38,
    paddingHorizontal: 8,
    marginBottom: 28,
  },
  brandTitle: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  logoImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  brandName: { color: C.textPrimary, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  logoSlot: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sidebarToggle: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHigh,
  },

  nav: { gap: 2, paddingHorizontal: 8 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 8,
    transitionProperty: "width, background-color" as any,
    transitionDuration: "180ms" as any,
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" as any,
  },
  navIconSlot: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  navItemActive: { backgroundColor: C.surfaceHigh },
  navLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  navLabelActive: { color: C.textPrimary },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    paddingHorizontal: 8,
  },
  footerDotSlot: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  footerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  footerText: { color: C.textMuted, fontSize: 11, marginLeft: 6 },

  content: { flex: 1, backgroundColor: C.bg },
});
