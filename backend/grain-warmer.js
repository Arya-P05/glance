import { prepareGrain } from './image-grain.js';

// Runs independently of dashboard navigation. Polling also discovers images
// created by separate generation processes; no extra rendering per UI visit.
export function startGrainWarmer(db, bucket, {
  prepare = prepareGrain, intervalMs = 60_000,
  onError = error => console.warn('Grain background preparation:', error.message),
} = {}) {
  let stopped = false;
  let timer;
  let warmed = new Map();
  async function sweep() {
    const live = new Map();
    try {
      for (let offset = 0; !stopped; offset += 100) {
        const { data, error } = await db.from('backgrounds')
          .select('id, storage_path, metadata').eq('status', 'pending')
          .order('created_at', { ascending: true }).order('id')
          .range(offset, offset + 99);
        if (error) throw error;
        for (const row of data ?? []) {
          if (stopped) break;
          const key = row.metadata?.grain?.originalStoragePath || row.storage_path;
          const last = warmed.get(key);
          if (last && Date.now() - last < 30 * 60_000) {
            live.set(key, last);
            continue;
          }
          try {
            await prepare(db, bucket, row);
            live.set(key, Date.now());
          } catch (error) { onError(error); }
        }
        if (!data || data.length < 100) break;
      }
      warmed = live;
    } catch (error) { onError(error); }
    if (!stopped) {
      timer = setTimeout(sweep, intervalMs);
      timer.unref?.();
    }
  }
  void sweep();
  return () => { stopped = true; clearTimeout(timer); };
}
