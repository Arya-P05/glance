import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, Image } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Home, MediaImage, Frame, List, Sparks, Import, Settings, NavArrowLeft, AlbumCarousel, Check,
} from "iconoir-react-native";
import { C } from "../lib/theme";

type NavIcon = React.ComponentType<{ color?: string; width?: number; height?: number; strokeWidth?: number }>;

const NAV: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/",           label: "Overview",    Icon: Home },
  { href: "/generate",   label: "Generate",    Icon: Sparks },
  { href: "/prompts",    label: "Prompts",     Icon: List },
  { href: "/backgrounds",label: "Backgrounds", Icon: MediaImage },
  { href: "/approved-backgrounds", label: "Approved", Icon: Check },
  { href: "/drafts",     label: "Drafts",      Icon: Frame },
  { href: "/library",    label: "Library",     Icon: MediaImage },
  { href: "/carousels",  label: "Post queue",   Icon: List },
  { href: "/carousel-editor", label: "Create carousel", Icon: AlbumCarousel },
  { href: "/import",     label: "Import",      Icon: Import },
  { href: "/maintenance",label: "Maintenance", Icon: Settings },
];

const SIDEBAR_STORAGE_KEY = "glance.sidebarCollapsed";
const APP_ICON = require("../assets/mobile-app-icon.png");

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const expanded = !collapsed || hovered || focused;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function togglePinned() {
    setHovered(false);
    setFocused(false);
    onToggle();
  }

  return (
    <div
      data-testid="sidebar"
      onPointerEnter={event => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={event => {
        if (event.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      style={{ position: "relative", width: collapsed ? 54 : C.sidebarW, flexShrink: 0, zIndex: 10 }}
    >
    <View style={[
      styles.sidebar,
      !expanded && styles.sidebarCollapsed,
      (reduceMotion || focused) && { transitionDuration: "0ms" } as any,
    ]}>
      <View style={styles.brand}>
        <View style={styles.brandTitle}>
          <Pressable accessibilityLabel={collapsed ? "Pin sidebar open" : "Collapse sidebar"} onPress={togglePinned} style={styles.logoSlot}>
            <Image source={APP_ICON} style={styles.logoImage} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.brandName, { opacity: expanded ? 1 : 0 }]}>glance</Text>
        </View>
        <Pressable
          accessibilityLabel={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
          onPress={togglePinned}
          style={[styles.sidebarToggle, { opacity: expanded ? 1 : 0 }]}
        >
          <NavArrowLeft color={C.textSecondary} width={16} height={16} strokeWidth={2} style={{ transform: [{ rotate: collapsed ? "180deg" : "0deg" }] }} />
        </Pressable>
      </View>

      <View style={styles.nav}>
        {NAV.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const navStyle = StyleSheet.flatten([
            styles.navItem,
            active ? styles.navItemActive : null,
          ]);
          const labelStyle = StyleSheet.flatten([styles.navLabel, active ? styles.navLabelActive : null, { opacity: expanded ? 1 : 0 }, (reduceMotion || focused) ? { transitionDuration: "0ms" } as any : null]);
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
              <Text numberOfLines={1} style={labelStyle}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

    </View>
    </div>
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
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: C.sidebarW,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingTop: 24,
    paddingBottom: 16,
    justifyContent: "flex-start",
    overflow: "hidden",
    transitionProperty: "width" as any,
    transitionDuration: "220ms" as any,
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" as any,
  },
  sidebarCollapsed: {
    width: 54,
  },
  brand: {
    width: C.sidebarW,
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

  nav: { gap: 2, paddingHorizontal: 8, width: C.sidebarW },
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
  navLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "500", transitionProperty: "opacity" as any, transitionDuration: "150ms" as any },
  navLabelActive: { color: C.textPrimary },

  content: { flex: 1, backgroundColor: C.bg },
});
