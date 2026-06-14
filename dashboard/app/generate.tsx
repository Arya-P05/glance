import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, Pressable, Switch } from "react-native";
import { api, GenerateOptions } from "../lib/api";
import { JobLog } from "../components/JobLog";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

type Mode = "images" | "prompts";
type Size = "1024x1024" | "1536x1024" | "1024x1536";

const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: "images", label: "Backgrounds", desc: "Stage clean images for review" },
  { id: "prompts", label: "Prompts Only", desc: "Save scene prompts for later use" },
];

const SIZES: Size[] = ["1024x1024", "1536x1024", "1024x1536"];

const GENERATE_JOB_KEY = "generate_job";
const LEGACY_SESSION_KEY = "generate_jobId";

type SavedGenerateJob = {
  id: string;
  mode?: Mode;
  savedAt?: number;
};

function resultMessage(mode: Mode, code: number | null) {
  if (code !== 0) return "Job failed. Check the log above.";
  return mode === "prompts" ? "Done. Check Prompts." : "Done. Check Backgrounds.";
}

function readSavedGenerateJob(): SavedGenerateJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(GENERATE_JOB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedGenerateJob;
      if (parsed?.id) return parsed;
    }
  } catch {}

  const legacy = window.sessionStorage?.getItem(LEGACY_SESSION_KEY);
  return legacy ? { id: legacy } : null;
}

function saveGenerateJob(id: string, mode: Mode) {
  if (typeof window === "undefined") return;
  const payload: SavedGenerateJob = { id, mode, savedAt: Date.now() };
  window.localStorage?.setItem(GENERATE_JOB_KEY, JSON.stringify(payload));
  window.sessionStorage?.setItem(LEGACY_SESSION_KEY, id);
}

function clearSavedGenerateJob() {
  if (typeof window === "undefined") return;
  window.localStorage?.removeItem(GENERATE_JOB_KEY);
  window.sessionStorage?.removeItem(LEGACY_SESSION_KEY);
}

export default function GenerateScreen() {
  const [count, setCount] = useState("5");
  const [mode, setMode] = useState<Mode>("images");
  const [size, setSize] = useState<Size>("1024x1024");
  const [model, setModel] = useState("gpt-image-2");
  const [promptModel, setPromptModel] = useState("gpt-4.1-mini");
  const [dryRun, setDryRun] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restoreJob() {
      const saved = readSavedGenerateJob();
      if (saved?.id) {
        try {
          const job = await api.job(saved.id);
          if (cancelled) return;
          if (job.type === "generate") {
            setJobId(job.id);
            if (saved.mode) setMode(saved.mode);
            if (job.status !== "running") setLastResult(resultMessage(saved.mode ?? mode, job.exitCode));
            return;
          }
        } catch {
          clearSavedGenerateJob();
        }
      }

      try {
        const { jobs } = await api.jobs();
        if (cancelled) return;
        const runningGenerate = jobs.find(job => job.type === "generate" && job.status === "running");
        if (runningGenerate) {
          setJobId(runningGenerate.id);
          saveGenerateJob(runningGenerate.id, mode);
        }
      } catch {}
    }

    void restoreJob();
    return () => { cancelled = true; };
  }, []);

  async function run() {
    setLoading(true);
    setLastResult(null);
    setJobId(null);
    clearSavedGenerateJob();
    try {
      const opts: GenerateOptions = {
        count: parseInt(count, 10) || 5,
        mode,
        model,
        promptModel,
        size,
        dryRun,
      };
      const { jobId: id } = await api.generate(opts);
      setJobId(id);
      saveGenerateJob(id, mode);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={S.h1}>Generate</Text>
      <Text style={[S.body, { marginTop: 4, marginBottom: 24 }]}>
        Create background candidates using OpenAI
      </Text>

      {/* Mode selector */}
      <Text style={[S.label, { marginBottom: 10 }]}>Pipeline Mode</Text>
      <View style={styles.modeGrid}>
        {MODES.map(m => (
          <Pressable
            key={m.id}
            onPress={() => setMode(m.id)}
            style={[styles.modeCard, mode === m.id && styles.modeCardActive]}
          >
            <Text style={[styles.modeLabel, mode === m.id && styles.modeLabelActive]}>{m.label}</Text>
            <Text style={styles.modeDesc}>{m.desc}</Text>
          </Pressable>
        ))}
      </View>

      {/* Count */}
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={[S.label, { marginBottom: 6 }]}>Count</Text>
          <TextInput
            style={styles.input}
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            placeholder="5"
            placeholderTextColor={C.textMuted}
          />
        </View>

        {/* Size */}
        <View style={styles.field}>
          <Text style={[S.label, { marginBottom: 6 }]}>Image Size</Text>
          <View style={styles.segmented}>
            {SIZES.map(s => (
              <Pressable
                key={s}
                onPress={() => setSize(s)}
                style={[styles.seg, size === s && styles.segActive]}
              >
                <Text style={[styles.segLabel, size === s && styles.segLabelActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Models */}
      <Text style={[S.label, { marginTop: 20, marginBottom: 10 }]}>Models</Text>
      <View style={styles.modelGrid}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Image Model</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            placeholderTextColor={C.textMuted}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Prompt Model</Text>
          <TextInput
            style={styles.input}
            value={promptModel}
            onChangeText={setPromptModel}
            placeholderTextColor={C.textMuted}
          />
        </View>
      </View>

      {/* Dry Run */}
      <View style={[styles.dryRow]}>
        <Text style={S.body}>Dry run (preview only, no API calls)</Text>
        <Switch
          value={dryRun}
          onValueChange={setDryRun}
          trackColor={{ false: C.border, true: C.accentDim }}
          thumbColor={dryRun ? C.accent : C.textMuted}
        />
      </View>

      {/* Run */}
      <View style={{ marginTop: 24 }}>
        <Btn
          label={(() => {
            const n = parseInt(count) || 0;
            const s = n !== 1 ? "s" : "";
            if (dryRun) return `Preview ${n} Scene${s}`;
            if (mode === "prompts") return `Generate ${n} Prompt${s}`;
            return `Generate ${n} Background${s}`;
          })()}
          onPress={run}
          loading={loading}
        />
      </View>

      {lastResult && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{lastResult}</Text>
        </View>
      )}

      <JobLog jobId={jobId} onDone={(code) => {
        if (jobId) saveGenerateJob(jobId, mode);
        setLastResult(resultMessage(mode, code));
      }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 28, paddingBottom: 60 },
  modeGrid: { flexDirection: "row", gap: 10, marginBottom: 24, flexWrap: "wrap" },
  modeCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 2,
    borderColor: C.border,
    gap: 4,
  },
  modeCardActive: { borderColor: C.accent, backgroundColor: "#111A0A" },
  modeLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  modeLabelActive: { color: C.accent },
  modeDesc: { color: C.textMuted, fontSize: 11 },
  row: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  field: { flex: 1, minWidth: 160 },
  fieldLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: C.surface,
    color: C.textPrimary,
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmented: { flexDirection: "row", gap: 4 },
  seg: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  segActive: { backgroundColor: C.accent, borderColor: C.accent },
  segLabel: { color: C.textMuted, fontSize: 10 },
  segLabelActive: { color: C.bg, fontWeight: "700" },
  modelGrid: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  dryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  resultBox: {
    marginTop: 14,
    backgroundColor: C.successDim,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.success,
  },
  resultText: { color: C.success, fontSize: 13 },
});
