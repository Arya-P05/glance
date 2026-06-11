export const C = {
  bg: "#0A0A0A",
  surface: "#141414",
  surfaceHigh: "#1E1E1E",
  border: "#2A2A2A",
  borderLight: "#333333",
  accent: "#C8FF6E",       // lime green
  accentDim: "#6A8C3A",
  textPrimary: "#F5F5F5",
  textSecondary: "#888888",
  textMuted: "#555555",
  danger: "#FF5555",
  dangerDim: "#3D1515",
  success: "#4CAF50",
  successDim: "#1A3D1A",
  warning: "#FFB347",
  sidebarW: 220,
} as const;

export const S = {
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  label: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  h1: {
    color: C.textPrimary,
    fontSize: 22,
    fontWeight: "700" as const,
  },
  h2: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  body: {
    color: C.textSecondary,
    fontSize: 13,
  },
} as const;
