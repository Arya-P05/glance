import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { C } from "../lib/theme";

type Props = {
  label?: string;
  keyHint: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "outline" | "ghost" | "danger";
  icon?: React.ReactNode;
};

export function ActionKey({ label, keyHint, onPress, loading, variant = "outline", icon }: Props) {
  const bg =
    variant === "primary" ? C.accent :
    variant === "danger"  ? C.danger :
    C.surface;
  const textColor =
    variant === "primary" ? C.bg :
    variant === "danger"  ? "#fff" :
    C.textSecondary;
  const borderColor =
    variant === "primary" ? C.accent :
    variant === "danger"  ? C.danger :
    C.border;
  const hintBg = variant === "primary" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)";
  const hintColor = variant === "primary" ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.8)";

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={[styles.btn, { backgroundColor: bg, borderColor, opacity: loading ? 0.5 : 1 }]}
    >
      {icon ?? <Text style={[styles.label, { color: textColor }]}>{label}</Text>}
      <View style={[styles.hint, { backgroundColor: hintBg }]}>
        <Text style={[styles.hintText, { color: hintColor }]}>{keyHint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  label: { fontWeight: "700", letterSpacing: 0.3 },
  hint: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hintText: { fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
});
