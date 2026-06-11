import React, { useEffect, useRef } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { C } from "../lib/theme";
import { useJobStream } from "../lib/useJobStream";

interface Props {
  jobId: string | null;
  onDone?: (exitCode: number | null) => void;
}

export function JobLog({ jobId, onDone }: Props) {
  const { lines, done, exitCode, running } = useJobStream(jobId);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (done && onDone) onDone(exitCode);
  }, [done]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [lines.length]);

  if (!jobId) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.dot, running ? styles.dotRunning : done && exitCode === 0 ? styles.dotOk : styles.dotFail]} />
        <Text style={styles.status}>
          {running ? "running…" : exitCode === 0 ? "completed" : `failed (exit ${exitCode})`}
        </Text>
      </View>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {lines.length === 0 && <Text style={styles.empty}>Waiting for output…</Text>}
        {lines.map((line, i) => (
          <Text key={i} style={[styles.line, line.startsWith("[err]") && styles.errLine]}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0D0D0D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotRunning: { backgroundColor: C.warning },
  dotOk: { backgroundColor: C.success },
  dotFail: { backgroundColor: C.danger },
  status: {
    color: C.textSecondary,
    fontSize: 11,
    fontFamily: "monospace",
  },
  scroll: { maxHeight: 320 },
  scrollContent: { padding: 12, gap: 2 },
  empty: { color: C.textMuted, fontSize: 12, fontFamily: "monospace" },
  line: { color: "#B8FFB8", fontSize: 12, fontFamily: "monospace", lineHeight: 18 },
  errLine: { color: "#FF8888" },
});
