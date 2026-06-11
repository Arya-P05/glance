import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from "react-native";
import { C } from "../lib/theme";

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost" | "outline";
  small?: boolean;
}

export function Btn({ label, onPress, loading, disabled, variant = "primary", small }: Props) {
  const is = {
    primary: variant === "primary",
    danger: variant === "danger",
    ghost: variant === "ghost",
    outline: variant === "outline",
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        is.primary && styles.primary,
        is.danger && styles.danger,
        is.ghost && styles.ghost,
        is.outline && styles.outline,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={is.primary ? C.bg : C.accent} />
        : <Text style={[styles.label, is.ghost && styles.ghostLabel, is.outline && styles.outlineLabel, is.danger && styles.dangerLabel, small && styles.smallLabel]}>{label}</Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  small: { paddingHorizontal: 10, paddingVertical: 6 },
  primary: { backgroundColor: C.accent },
  danger: { backgroundColor: C.danger },
  ghost: { backgroundColor: "transparent" },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  label: { color: C.bg, fontSize: 13, fontWeight: "600" },
  smallLabel: { fontSize: 12 },
  ghostLabel: { color: C.textSecondary },
  outlineLabel: { color: C.textPrimary },
  dangerLabel: { color: "#fff" },
});
