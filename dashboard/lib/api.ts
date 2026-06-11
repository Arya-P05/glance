export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  return res.json();
}

export const api = {
  stats: () => request<Stats>("/api/stats"),

  images: () => request<{ items: StorageImage[] }>("/api/images"),
  deleteImages: (paths: string[]) =>
    request<{ removedStorage: number; removedRows: number }>("/api/delete", {
      method: "POST",
      body: JSON.stringify({ paths }),
    }),
  setImageStatus: (paths: string[], status: "active" | "inactive") =>
    request<{ updated: number; status: string }>("/api/images/set-status", {
      method: "POST",
      body: JSON.stringify({ paths, status }),
    }),

  drafts: () => request<{ drafts: Draft[] }>("/api/drafts"),
  publishDraft: (opts: { id?: string; all?: boolean; count?: number; status?: "active" | "inactive" }) =>
    request<{ jobId: string }>("/api/drafts/publish", { method: "POST", body: JSON.stringify(opts) }),
  discardDraft: (opts: { id?: string; all?: boolean; count?: number }) =>
    request<{ jobId: string }>("/api/drafts/discard", { method: "POST", body: JSON.stringify(opts) }),

  prompts: () => request<{ prompts: Prompt[] }>("/api/prompts"),

  generate: (opts: GenerateOptions) =>
    request<{ jobId: string }>("/api/generate", { method: "POST", body: JSON.stringify(opts) }),

  sync: (opts: SyncOptions) =>
    request<{ jobId: string }>("/api/sync", { method: "POST", body: JSON.stringify(opts) }),

  jobs: () => request<{ jobs: JobSummary[] }>("/api/jobs"),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),

  previewImport: (input: string) =>
    request<{ items: ImportPreviewItem[] }>("/api/preview", { method: "POST", body: JSON.stringify({ input }) }),
  importPosts: (items: ImportPreviewItem[]) =>
    request<{ results: ImportResult[]; message: string }>("/api/import-posts", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),

  maintenancePrune: () => request<{ jobId: string }>("/api/maintenance/prune", { method: "POST" }),
  maintenanceMigrate: () => request<{ jobId: string }>("/api/maintenance/migrate", { method: "POST" }),
  maintenanceClear: () =>
    request<{ jobId: string }>("/api/maintenance/clear", {
      method: "POST",
      body: JSON.stringify({ confirm: "CLEAR" }),
    }),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Stats {
  totalPosts: number;
  activePosts: number;
  storageFiles: number;
  drafts: number;
  prompts: number;
  discarded: number;
}

export interface StorageImage {
  id: string;
  instagramId: string;
  storagePath: string;
  caption: string | null;
  createdAt: string;
  status: "active" | "inactive";
  publicUrl: string;
}

export interface DraftMeta {
  filename?: string;
  caption?: { smallText: string; bigText: string };
  scene?: Record<string, string>;
  generatedAt?: string;
  imageModel?: string;
  captionModel?: string;
  publishedAt?: string;
  storagePath?: string;
}

export interface Draft {
  id: string;
  filename: string;
  meta: DraftMeta | null;
}

export interface Prompt {
  id: string;
  filename: string;
  data: {
    scene?: Record<string, string>;
    scenePrompt?: string;
    generatedAt?: string;
  };
  imagePrompt: string | null;
}

export interface GenerateOptions {
  count?: number;
  mode?: "full" | "prompts" | "images";
  model?: string;
  promptModel?: string;
  captionModel?: string;
  size?: string;
  dryRun?: boolean;
}

export interface SyncOptions {
  bulk?: boolean;
  username?: string;
  sessionId?: string;
  maxPosts?: number;
}

export interface JobSummary {
  id: string;
  type: string;
  status: "running" | "done" | "failed";
  exitCode: number | null;
  startedAt: number;
  linesCount: number;
}

export interface Job extends JobSummary {
  lines: string[];
}

export interface ImportPreviewItem {
  shortcode: string;
  kind: "p" | "reel";
  media_index: number;
  media_count: number;
  caption: string | null;
  image_url?: string;
  previewDataUrl?: string;
  error?: string;
}

export interface ImportResult {
  shortcode: string;
  media_index: number;
  ok: boolean;
  storagePath?: string;
  error?: string;
}
