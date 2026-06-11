import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, Alert } from "react-native";
import { api } from "../lib/api";
import { JobLog } from "../components/JobLog";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

interface MaintenanceAction {
  id: string;
  title: string;
  description: string;
  buttonLabel: string;
  variant: "primary" | "outline" | "danger";
  confirm?: string;
  action: () => Promise<{ jobId: string }>;
}

export default function MaintenanceScreen() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [clearInput, setClearInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function run(actionId: string, fn: () => Promise<{ jobId: string }>) {
    setLoading(actionId);
    setJobId(null);
    setActiveAction(actionId);
    try {
      const { jobId: id } = await fn();
      setJobId(id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(null);
    }
  }

  const actions: MaintenanceAction[] = [
    {
      id: "prune",
      title: "Prune Orphan Posts",
      description: "Removes database rows whose files were deleted from Supabase Storage. Safe to run anytime — only deletes rows with missing images.",
      buttonLabel: "Prune Orphans",
      variant: "outline",
      action: api.maintenancePrune,
    },
    {
      id: "migrate",
      title: "Apply DB Migrations",
      description: "Runs pending SQL migrations against your Supabase database. Requires SUPABASE_DB_PASSWORD in .env.",
      buttonLabel: "Apply Migrations",
      variant: "outline",
      action: api.maintenanceMigrate,
    },
  ];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={S.h1}>Maintenance</Text>
      <Text style={[S.body, { marginTop: 4, marginBottom: 28 }]}>
        Database and storage management tools
      </Text>

      {/* Safe actions */}
      {actions.map(action => (
        <View key={action.id} style={styles.actionCard}>
          <Text style={styles.actionTitle}>{action.title}</Text>
          <Text style={styles.actionDesc}>{action.description}</Text>
          <View style={{ marginTop: 12 }}>
            <Btn
              label={action.buttonLabel}
              onPress={() => run(action.id, action.action)}
              loading={loading === action.id}
              variant={action.variant}
              small
            />
          </View>
          {activeAction === action.id && jobId && (
            <JobLog jobId={jobId} onDone={() => setActiveAction(null)} />
          )}
        </View>
      ))}

      {/* Destructive: Clear All */}
      <View style={[styles.actionCard, styles.dangerCard]}>
        <Text style={[styles.actionTitle, styles.dangerTitle]}>⚠ Clear All Posts</Text>
        <Text style={styles.actionDesc}>
          Deletes ALL files from Supabase Storage and ALL rows from the posts table.
          {"\n\n"}This is irreversible. Your published content will disappear from the iOS widget immediately.
        </Text>
        <View style={styles.confirmRow}>
          <TextInput
            style={styles.confirmInput}
            value={clearInput}
            onChangeText={setClearInput}
            placeholder='Type "CLEAR" to enable'
            placeholderTextColor={C.textMuted}
          />
          <Btn
            label="Clear Everything"
            variant="danger"
            small
            disabled={clearInput !== "CLEAR"}
            loading={loading === "clear"}
            onPress={() => {
              if (clearInput !== "CLEAR") return;
              run("clear", api.maintenanceClear);
              setClearInput("");
            }}
          />
        </View>
        {activeAction === "clear" && jobId && (
          <JobLog jobId={jobId} onDone={() => setActiveAction(null)} />
        )}
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Terminal commands</Text>
        <Text style={styles.infoCode}>
          {"npm run prune-orphans   # same as Prune Orphans above\n"}
          {"npm run migrate         # same as Apply Migrations above\n"}
          {"npm run clear-posts     # same as Clear All above"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 28, paddingBottom: 60, gap: 16 },
  actionCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
  },
  dangerCard: {
    backgroundColor: C.dangerDim,
    borderColor: C.danger,
  },
  actionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: 6 },
  dangerTitle: { color: C.danger },
  actionDesc: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },
  confirmRow: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "center" },
  confirmInput: {
    flex: 1,
    backgroundColor: C.bg,
    color: C.textPrimary,
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.danger,
  },
  infoBox: {
    backgroundColor: C.surfaceHigh,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
    marginTop: 8,
  },
  infoTitle: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  infoCode: { color: C.textMuted, fontSize: 12, fontFamily: "monospace", lineHeight: 22 },
});
