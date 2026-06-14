import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { api, Stats, JobSummary } from "../lib/api";
import { StatCard } from "../components/StatCard";
import { Btn } from "../components/Btn";
import { C, S } from "../lib/theme";

export default function OverviewScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const [s, j] = await Promise.all([api.stats(), api.jobs()]);
      setStats(s);
      setJobs(j.jobs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={S.h1}>Overview</Text>
      <Text style={[S.body, { marginTop: 4, marginBottom: 24 }]}>
        Glance content dashboard
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠ Cannot reach admin server — is it running?{"\n"}{error}</Text>
        </View>
      )}

      {stats && (
        <>
          <Text style={[S.label, { marginBottom: 10 }]}>Published</Text>
          <View style={styles.grid}>
            <StatCard label="Active Posts" value={stats.activePosts} accent onPress={() => router.push("/library")} />
            <StatCard label="Total in DB" value={stats.totalPosts} sub={`${stats.storageFiles} in storage`} />
          </View>

          <Text style={[S.label, { marginTop: 24, marginBottom: 10 }]}>Local Queue</Text>
          <View style={styles.grid}>
            <StatCard label="Drafts" value={stats.drafts} accent={stats.drafts > 0} onPress={() => router.push("/drafts")} />
            <StatCard label="Backgrounds" value={stats.backgrounds} accent={stats.backgrounds > 0} onPress={() => router.push("/backgrounds")} />
            <StatCard label="Saved Prompts" value={stats.prompts} onPress={() => router.push("/prompts")} />
            <StatCard label="Discarded" value={stats.discarded} sub="archived" />
          </View>
        </>
      )}

      <Text style={[S.label, { marginTop: 28, marginBottom: 12 }]}>Quick Actions</Text>
      <View style={styles.actions}>
        <Btn label="Run Sync" onPress={() => router.push("/scrape")} variant="outline" />
        <Btn label="Generate" onPress={() => router.push("/generate")} variant="outline" />
        {stats && stats.drafts > 0 && (
          <Btn label={`Publish ${stats.drafts} Draft${stats.drafts !== 1 ? "s" : ""}`} onPress={() => router.push("/drafts")} />
        )}
        <Btn label="Refresh" onPress={load} loading={loading} variant="ghost" />
      </View>

      {jobs.length > 0 && (
        <>
          <Text style={[S.label, { marginTop: 28, marginBottom: 12 }]}>Recent Jobs</Text>
          <View style={styles.jobList}>
            {jobs.slice(0, 8).map(job => (
              <View key={job.id} style={styles.jobRow}>
                <View style={[styles.jobDot,
                  job.status === "running" ? styles.dotRunning :
                  job.status === "done" ? styles.dotDone : styles.dotFail
                ]} />
                <Text style={styles.jobType}>{job.type}</Text>
                <Text style={styles.jobStatus}>{job.status}</Text>
                <Text style={styles.jobTime}>{new Date(job.startedAt).toLocaleTimeString()}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 28, paddingBottom: 60 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  errorBox: {
    backgroundColor: C.dangerDim,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.danger,
  },
  errorText: { color: C.danger, fontSize: 13 },
  jobList: { gap: 2 },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  jobDot: { width: 7, height: 7, borderRadius: 4 },
  dotRunning: { backgroundColor: C.warning },
  dotDone: { backgroundColor: C.success },
  dotFail: { backgroundColor: C.danger },
  jobType: { color: C.textPrimary, fontSize: 13, flex: 1 },
  jobStatus: { color: C.textMuted, fontSize: 12 },
  jobTime: { color: C.textMuted, fontSize: 11 },
});
