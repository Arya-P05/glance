import { Stack, useRouter } from "expo-router";
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Home, MediaImage, Frame, List, Sparks, Download, Import, Eye, Settings,
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

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandName}>glance</Text>
      </View>

      <View style={styles.nav}>
        {NAV.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const navStyle = StyleSheet.flatten([styles.navItem, active ? styles.navItemActive : null]);
          const labelStyle = StyleSheet.flatten([styles.navLabel, active ? styles.navLabelActive : null]);
          return (
            <Pressable
              key={item.href}
              style={navStyle}
              onPress={() => router.push(item.href as any)}
            >
              <item.Icon
                color={active ? C.accent : C.textMuted}
                width={16}
                height={16}
                strokeWidth={1.8}
              />
              <Text style={labelStyle}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerDot} />
        <Text style={styles.footerText}>localhost:3847</Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const showSidebar = isWeb && width > 600;

  if (showSidebar) {
    return (
      <View style={styles.root}>
        <Sidebar />
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
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  brandName: { color: C.textPrimary, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },

  nav: { gap: 2, paddingHorizontal: 8 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
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
  footerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  footerText: { color: C.textMuted, fontSize: 11 },

  content: { flex: 1, backgroundColor: C.bg },
});
