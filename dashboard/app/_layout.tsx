import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, Image } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Home, MediaImage, Frame, List, Sparks, Download, Import, Eye, Settings, NavArrowLeft,
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
      <View style={[styles.brand, collapsed && styles.brandCollapsed]}>
        {collapsed ? (
          <Pressable
            accessibilityLabel="Open sidebar"
            onPress={onToggle}
            style={styles.collapsedLogoButton}
          >
            <Image source={APP_ICON} style={styles.logoImage} />
          </Pressable>
        ) : (
          <>
            <View style={styles.brandTitle}>
              <Image source={APP_ICON} style={styles.logoImage} />
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

      <View style={[styles.nav, collapsed && styles.navCollapsed]}>
        {NAV.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const navStyle = StyleSheet.flatten([
            styles.navItem,
            collapsed ? styles.navItemCollapsed : null,
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
              <item.Icon
                color={active ? C.accent : C.textMuted}
                width={16}
                height={16}
                strokeWidth={1.8}
              />
              {!collapsed && <Text style={labelStyle}>{item.label}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.footer, collapsed && styles.footerCollapsed]}>
        <View style={styles.footerDot} />
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
    transitionProperty: "width" as any,
    transitionDuration: "180ms" as any,
    transitionTimingFunction: "ease" as any,
  },
  sidebarCollapsed: {
    width: 54,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  brandCollapsed: {
    flexDirection: "column",
    paddingHorizontal: 8,
    justifyContent: "center",
    marginBottom: 20,
  },
  brandTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  logoImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  brandName: { color: C.textPrimary, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  collapsedLogoButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: C.surfaceHigh,
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
  navCollapsed: { alignItems: "center", paddingHorizontal: 6 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    transitionProperty: "width, background-color" as any,
    transitionDuration: "180ms" as any,
    transitionTimingFunction: "ease" as any,
  },
  navItemCollapsed: {
    width: 38,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  navItemActive: { backgroundColor: C.surfaceHigh },
  navLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  navLabelActive: { color: C.textPrimary },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
  },
  footerCollapsed: { justifyContent: "center", paddingHorizontal: 0 },
  footerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  footerText: { color: C.textMuted, fontSize: 11 },

  content: { flex: 1, backgroundColor: C.bg },
});
