const runtimeEnv =
  typeof globalThis !== "undefined"
    ? ((globalThis as any).process?.env ?? {})
    : {};

export const API_BASE = runtimeEnv.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3847";

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
  deleteImage: (opts: { id: string; storagePath: string }) =>
    request<{ removedStorage: number; removedRows: number }>("/api/delete", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  setImageStatus: (paths: string[], status: "active" | "inactive") =>
    request<{ updated: number; status: string }>("/api/images/set-status", {
      method: "POST",
      body: JSON.stringify({ paths, status }),
    }),

  instagramStatus: () => request<InstagramStatus>("/api/instagram/status"),
  carousels: () => request<{ carousels: InstagramCarousel[] }>("/api/carousels"),
  carousel: (id: string) => request<{ carousel: InstagramCarousel }>(`/api/carousels/${id}`),
  createCarousel: (opts: { title?: string; caption?: string; postIds: string[]; status?: "draft" | "ready" }) =>
    request<{ carousel: InstagramCarousel }>("/api/carousels", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  updateCarousel: (id: string, opts: { title?: string; caption?: string; postIds?: string[]; status?: "draft" | "ready" }) =>
    request<{ carousel: InstagramCarousel }>(`/api/carousels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(opts),
    }),
  duplicateCarousel: (id: string) =>
    request<{ carousel: InstagramCarousel }>(`/api/carousels/${id}/duplicate`, { method: "POST" }),
  archiveCarousel: (id: string) =>
    request<{ carousel: InstagramCarousel }>(`/api/carousels/${id}/archive`, { method: "POST" }),
  postCarouselNow: (id: string) =>
    request<{ jobId: string }>(`/api/carousels/${id}/post-now`, { method: "POST" }),
  exportCarousel: (id: string) =>
    request<{ package: InstagramCarouselPackage }>(`/api/carousels/${id}/export`),
  markCarouselPosted: (id: string, opts?: { permalink?: string }) =>
    request<{ carousel: InstagramCarousel }>(`/api/carousels/${id}/mark-posted`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),

  drafts: () => request<{ drafts: Draft[] }>("/api/drafts"),
  backgrounds: () => request<{ backgrounds: Draft[] }>("/api/backgrounds"),
  publishDraft: (opts: { id?: string; all?: boolean; count?: number; status?: "active" | "inactive" }) =>
    request<PublishDraftResult>("/api/drafts/publish", { method: "POST", body: JSON.stringify(opts) }),
  discardDraft: (opts: { id?: string; all?: boolean }) =>
    request<{ success: boolean; updated: number; ids: string[] }>("/api/drafts/discard", { method: "POST", body: JSON.stringify(opts) }),
  discardBackground: (opts: { id?: string; dbId?: string; all?: boolean }) =>
    request<{ success: boolean; updated: number; ids: string[] }>("/api/backgrounds/discard", { method: "POST", body: JSON.stringify(opts) }),
  generateBackgroundMessages: (opts: { id: string; captionModel?: string }) =>
    request<{
      success: boolean;
      id: string;
      rawImageUrl: string;
      captionOptions: CaptionText[];
      selectedCaptionIndex: number;
      captionPrompt: string;
      captionModel: string;
    }>("/api/backgrounds/message-options", { method: "POST", body: JSON.stringify(opts) }),
  reviseBackground: (opts: { id: string; instruction: string; imageModel?: string; size?: string }) =>
    request<{
      success: boolean;
      background: Draft;
      imageModel: string;
      revisionPrompt: string;
    }>("/api/backgrounds/revise", { method: "POST", body: JSON.stringify(opts) }),
  approveBackground: (opts: {
    id: string;
    caption: CaptionText;
    captionOptions?: CaptionText[];
    selectedCaptionIndex?: number;
    captionModel?: string;
    captionPrompt?: string;
    layout: CaptionLayout;
    mediumLayout: MediumCaptionLayout;
  }) =>
    request<{
      success: boolean;
      id: string;
      imageUrl: string;
      mediumImageUrl: string;
      rawImageUrl: string;
      caption: CaptionText;
      captionOptions?: CaptionText[];
      selectedCaptionIndex?: number;
      captionLayout: CaptionLayout;
      mediumCaptionLayout: MediumCaptionLayout;
      captionModel: string;
    }>("/api/backgrounds/approve", { method: "POST", body: JSON.stringify(opts) }),
  renderDraftCaption: (opts: {
    id: string;
    layout: CaptionLayout;
    mediumLayout: MediumCaptionLayout;
    caption?: CaptionText;
  }) =>
    request<{
      success: boolean;
      id: string;
      imageUrl: string;
      mediumImageUrl: string;
      caption: CaptionText;
      captionLayout: CaptionLayout;
      mediumCaptionLayout: MediumCaptionLayout;
    }>("/api/drafts/render-caption", { method: "POST", body: JSON.stringify(opts) }),
  prompts: () => request<{ prompts: Prompt[] }>("/api/prompts"),
  deletePrompts: (ids: string[]) =>
    request<{ success: boolean; deleted: number; ids: string[] }>("/api/prompts/delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

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
  backgrounds: number;
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

export type InstagramCarouselStatus = "draft" | "ready" | "posting" | "posted" | "failed" | "archived";

export interface InstagramCarouselItem {
  id: string;
  carouselId: string;
  postId: string;
  position: number;
  storagePathSnapshot: string;
  captionSnapshot: string | null;
  createdAt: string;
  post: StorageImage | null;
}

export interface InstagramCarousel {
  id: string;
  title: string;
  caption: string;
  status: InstagramCarouselStatus;
  instagramMediaId: string | null;
  permalink: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
  items: InstagramCarouselItem[];
}

export interface InstagramCarouselPackageItem {
  position: number;
  postId: string;
  storagePath: string;
  url: string;
  filename: string;
}

export interface InstagramCarouselPackage {
  id: string;
  title: string;
  caption: string;
  status: InstagramCarouselStatus;
  items: InstagramCarouselPackageItem[];
}

export interface InstagramStatus {
  configured: boolean;
  connected: boolean;
  publishEnabled: boolean;
  accountId: string | null;
  graphApiBase: string;
  graphApiVersion: string;
  missing?: string[];
  username?: string | null;
  error?: string;
}

export interface CaptionLayout {
  xRatio: number;
  yRatio: number;
  textColor: "#050505" | "#ffffff" | null;
  fontScale?: number;
  smallFontScale?: number;
  bigFontScale?: number;
  textSizeMode?: "together" | "separate";
}

export interface MediumCaptionLayout extends CaptionLayout {
  cropXRatio: number;
  cropYRatio: number;
}

export interface CaptionText {
  smallText: string;
  bigText: string;
}

export interface DraftMeta {
  filename?: string;
  caption?: CaptionText;
  captionOptions?: CaptionText[] | null;
  selectedCaptionIndex?: number;
  captionPrompt?: string | null;
  captionLayout?: CaptionLayout | null;
  mediumCaptionLayout?: MediumCaptionLayout | null;
  mediumStoragePath?: string | null;
  mediumImageUrl?: string | null;
  scene?: Record<string, string>;
  generatedAt?: string;
  imageModel?: string;
  promptModel?: string;
  captionModel?: string;
  size?: string;
  revision?: {
    sourceName?: string;
    sourceStoragePath?: string;
    instruction?: string;
    prompt?: string;
    generatedAt?: string;
  };
  publishedAt?: string;
  storagePath?: string;
}

export interface Draft {
  id: string;
  dbId?: string;
  filename: string;
  imageUrl: string;
  rawImageUrl?: string | null;
  meta: DraftMeta | null;
}

export type PublishDraftResult =
  | { success: true; id: string; storagePath: string; status: "active" | "inactive" }
  | { jobId: string };

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
  mode?: "prompts" | "images";
  model?: string;
  promptModel?: string;
  size?: string;
  dryRun?: boolean;
  idea?: string;
  directionMode?: "series" | "exact";
  styleRecipe?: "none" | "alpine-techwear" | "animal-nature-selfie";
  subject?: string;
  location?: string;
  gender?: string;
  gear?: string;
  action?: string;
  cameraLook?: "auto" | "2000s-digital" | "cheap-flash" | "disposable" | "fisheye" | "night-out" | "sunset" | "raw-iphone";
  vibePreset?: "auto" | "iconic" | "chaos" | "night-out" | "outdoors" | "animal-chaos" | "street-racer" | "dressy-flash";
  styleNotes?: string;
  promptIds?: string[];
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
