import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { C } from "../lib/theme";

interface Props {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  onPress?: () => void;
}

export function StatCard({ label, value, sub, accent, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, accent && styles.accent, pressed && styles.pressed]}>
      <Text style={[styles.value, accent && styles.accentValue]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 120,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 4,
  },
  accent: {
    borderColor: C.accentDim,
    backgroundColor: "#111A0A",
  },
  pressed: { opacity: 0.75 },
  value: {
    color: C.textPrimary,
    fontSize: 28,
    fontWeight: "700",
  },
  accentValue: { color: C.accent },
  label: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sub: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
