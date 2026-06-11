import { Stack, useRouter } from "expo-router";
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, StyleSheet as RNStyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";

const NAV = [
  { href: "/", label: "Overview", icon: "◉" },
  { href: "/library", label: "Library", icon: "⊞" },
  { href: "/drafts", label: "Drafts", icon: "✦" },
  { href: "/prompts", label: "Prompts", icon: "☰" },
  { href: "/generate", label: "Generate", icon: "✺" },
  { href: "/scrape", label: "Scrape", icon: "↓" },
  { href: "/import", label: "Import", icon: "⊕" },
  { href: "/preview", label: "Preview", icon: "◻" },
  { href: "/maintenance", label: "Maintenance", icon: "⚙" },
] as const;

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandMark}>⬡</Text>
        <Text style={styles.brandName}>glance</Text>
      </View>

      <View style={styles.nav}>
        {NAV.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href as string);
          const navStyle = StyleSheet.flatten([styles.navItem, active ? styles.navItemActive : null]);
          const iconStyle = StyleSheet.flatten([styles.navIcon, active ? styles.navIconActive : null]);
          const labelStyle = StyleSheet.flatten([styles.navLabel, active ? styles.navLabelActive : null]);
          return (
            <Pressable
              key={item.href}
              style={navStyle}
              onPress={() => router.push(item.href as any)}
            >
              <Text style={iconStyle}>{item.icon}</Text>
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
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: C.bg,
  },
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
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  brandMark: { color: C.accent, fontSize: 20 },
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
  navIcon: { color: C.textMuted, fontSize: 14, width: 20, textAlign: "center" },
  navIconActive: { color: C.accent },
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

  content: {
    flex: 1,
    backgroundColor: C.bg,
  },
});
