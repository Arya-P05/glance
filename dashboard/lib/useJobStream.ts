import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

export type JobStreamState = {
  lines: string[];
  done: boolean;
  exitCode: number | null;
  running: boolean;
};

type JobSnapshot = {
  id: string;
  type: string;
  status: "running" | "done" | "failed";
  exitCode: number | null;
  startedAt: number;
  lines: string[];
};

type CachedJob = {
  lines: string[];
  done: boolean;
  exitCode: number | null;
  cachedAt: number;
};

const CACHE_PREFIX = "glance.jobLog.";
const MAX_CACHED_LINES = 2000;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function cacheKey(jobId: string) {
  return `${CACHE_PREFIX}${jobId}`;
}

function readCachedJob(jobId: string): CachedJob | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(jobId));
    return raw ? JSON.parse(raw) as CachedJob : null;
  } catch {
    return null;
  }
}

function writeCachedJob(jobId: string, cached: CachedJob) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(cacheKey(jobId), JSON.stringify({
      ...cached,
      lines: cached.lines.slice(-MAX_CACHED_LINES),
      cachedAt: Date.now(),
    }));
  } catch {
    // Local storage is best-effort; the server still remains the source of truth.
  }
}

export function useJobStream(jobId: string | null): JobStreamState {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const linesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!jobId) {
      linesRef.current = [];
      setLines([]);
      setDone(false);
      setExitCode(null);
      return;
    }

    const activeJobId = jobId;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function setLineState(next: string[]) {
      linesRef.current = next;
      setLines(next);
    }

    function setSnapshotState(snapshot: { lines: string[]; done: boolean; exitCode: number | null }) {
      setLineState(snapshot.lines);
      setDone(snapshot.done);
      setExitCode(snapshot.exitCode);
      writeCachedJob(activeJobId, {
        lines: snapshot.lines,
        done: snapshot.done,
        exitCode: snapshot.exitCode,
        cachedAt: Date.now(),
      });
    }

    const cached = readCachedJob(activeJobId);
    if (cached) {
      setSnapshotState(cached);
    } else {
      setSnapshotState({ lines: [], done: false, exitCode: null });
    }

    async function fetchSnapshot(): Promise<JobSnapshot | null> {
      const res = await fetch(`${API_BASE}/api/jobs/${activeJobId}`);
      if (!res.ok) return null;
      return await res.json() as JobSnapshot;
    }

    function connect(since: number) {
      if (cancelled) return;
      let replayIndex = 0;
      const es = new EventSource(`${API_BASE}/api/jobs/${activeJobId}/stream?since=${since}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.done) {
            const nextDone = true;
            const nextExitCode = msg.exitCode ?? null;
            setDone(nextDone);
            setExitCode(nextExitCode);
            writeCachedJob(activeJobId, {
              lines: linesRef.current,
              done: nextDone,
              exitCode: nextExitCode,
              cachedAt: Date.now(),
            });
            es.close();
          } else if (msg.line) {
            if (replayIndex < since && linesRef.current[replayIndex] === msg.line) {
              replayIndex += 1;
              return;
            }
            setLineState([...linesRef.current, msg.line]);
            writeCachedJob(activeJobId, {
              lines: linesRef.current,
              done: false,
              exitCode: null,
              cachedAt: Date.now(),
            });
          }
        } catch {
          // Ignore malformed SSE payloads and keep the stream open.
        }
      };

      es.onerror = () => {
        es.close();
        if (cancelled) return;
        reconnectTimer = setTimeout(() => {
          void hydrateAndConnect();
        }, 1200);
      };
    }

    async function hydrateAndConnect() {
      try {
        const snapshot = await fetchSnapshot();
        if (cancelled || !snapshot) return;
        const snapshotDone = snapshot.status !== "running";
        setSnapshotState({
          lines: snapshot.lines,
          done: snapshotDone,
          exitCode: snapshot.exitCode,
        });
        if (!snapshotDone) connect(snapshot.lines.length);
      } catch {
        if (!cancelled) {
          reconnectTimer = setTimeout(() => connect(linesRef.current.length), 1200);
        }
      }
    }

    void hydrateAndConnect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [jobId]);

  return { lines, done, exitCode, running: !!jobId && !done };
}
