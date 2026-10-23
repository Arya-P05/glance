import { api, Draft } from "./api";

// Session caches survive route unmounts; a full page reload starts fresh.
export function createReviewListCache(fetchItems: () => Promise<Draft[]>) {
  let cached: Draft[] | null = null;
  let revision = 0;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const set = (update: Draft[] | ((items: Draft[]) => Draft[])) => {
    cached = typeof update === "function" ? update(cached ?? []) : update;
    revision++;
    listeners.forEach(listener => listener());
  };

  return {
    get: () => cached,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set,
    refresh: (): Promise<void> => {
      if (pending) return pending;
      const startedAtRevision = revision;
      pending = fetchItems().then(items => {
        // Don't overwrite edits or resurrect removed items with an older response.
        if (revision === startedAtRevision) set(items);
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}

export const backgroundsCache = createReviewListCache(async () => (await api.backgrounds()).backgrounds);
export const draftsCache = createReviewListCache(async () => (await api.drafts()).drafts);
