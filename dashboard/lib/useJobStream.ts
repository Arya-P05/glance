import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

export type JobStreamState = {
  lines: string[];
  done: boolean;
  exitCode: number | null;
  running: boolean;
};

export function useJobStream(jobId: string | null): JobStreamState {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;
    setLines([]);
    setDone(false);
    setExitCode(null);

    const es = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.done) {
          setDone(true);
          setExitCode(msg.exitCode);
          es.close();
        } else if (msg.line) {
          setLines(prev => [...prev, msg.line]);
        }
      } catch {}
    };

    es.onerror = () => {
      setDone(true);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [jobId]);

  return { lines, done, exitCode, running: !!jobId && !done };
}
