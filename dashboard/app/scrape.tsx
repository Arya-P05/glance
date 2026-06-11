import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, Switch } from "react-native";
import { api, SyncOptions } from "../lib/api";
import { JobLog } from "../components/JobLog";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function ScrapeScreen() {
  const [username, setUsername] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [maxPosts, setMaxPosts] = useState("50");
  const [bulk, setBulk] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function runSync() {
    setLoading(true);
    setLastResult(null);
    setJobId(null);
    try {
      const opts: SyncOptions = {
        bulk,
        maxPosts: parseInt(maxPosts, 10) || 50,
      };
      if (username.trim()) opts.username = username.trim();
      if (sessionId.trim()) opts.sessionId = sessionId.trim();
      const { jobId: id } = await api.sync(opts);
      setJobId(id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={S.h1}>Scrape</Text>
      <Text style={[S.body, { marginTop: 4, marginBottom: 24 }]}>
        Sync Instagram posts to Supabase
      </Text>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Instagram Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Leave blank to use INSTAGRAM_USERNAME from .env"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Session ID <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.input}
            value={sessionId}
            onChangeText={setSessionId}
            placeholder="INSTAGRAM_SESSIONID cookie value"
            placeholderTextColor={C.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Without a session ID, Instagram limits to ~12 posts. Add your sessionid cookie for full access.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Max Posts</Text>
          <TextInput
            style={[styles.input, { width: 120 }]}
            value={maxPosts}
            onChangeText={setMaxPosts}
            keyboardType="number-pad"
            placeholder="50"
            placeholderTextColor={C.textMuted}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Bulk Mode</Text>
            <Text style={styles.hint}>
              {bulk
                ? "Full import: scrolls the entire profile. Takes longer."
                : "Incremental: syncs only new posts since last run."}
            </Text>
          </View>
          <Switch
            value={bulk}
            onValueChange={setBulk}
            trackColor={{ false: C.border, true: C.accentDim }}
            thumbColor={bulk ? C.accent : C.textMuted}
          />
        </View>
      </View>

      <View style={{ marginTop: 24 }}>
        <Btn
          label={bulk ? "Start Bulk Import" : "Start Incremental Sync"}
          onPress={runSync}
          loading={loading}
        />
      </View>

      {lastResult && (
        <View style={[styles.resultBox, lastResult.startsWith("✓") ? styles.ok : styles.fail]}>
          <Text style={[styles.resultText, lastResult.startsWith("✓") ? styles.okText : styles.failText]}>
            {lastResult}
          </Text>
        </View>
      )}

      <JobLog
        jobId={jobId}
        onDone={code => setLastResult(
          code === 0 ? "✓ Sync complete. Check the Library for new posts." : "✗ Sync failed — check log above."
        )}
      />

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Two-phase bulk import</Text>
        <Text style={styles.infoBody}>
          For very large accounts, use the terminal:{"\n"}
          {"  "}npm run collect-links  →  saves shortcodes locally{"\n"}
          {"  "}npm run import-links   →  fetches & uploads images
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 28, paddingBottom: 60 },
  form: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 20,
  },
  field: { gap: 6 },
  label: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  optional: { color: C.textMuted, fontWeight: "400" },
  input: {
    backgroundColor: C.bg,
    color: C.textPrimary,
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  hint: { color: C.textMuted, fontSize: 11, lineHeight: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  toggleLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  resultBox: {
    marginTop: 14,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  ok: { backgroundColor: C.successDim, borderColor: C.success },
  fail: { backgroundColor: C.dangerDim, borderColor: C.danger },
  resultText: { fontSize: 13 },
  okText: { color: C.success },
  failText: { color: C.danger },
  infoBox: {
    marginTop: 24,
    backgroundColor: C.surfaceHigh,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  infoTitle: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  infoBody: { color: C.textMuted, fontSize: 12, lineHeight: 20 },
});
