import type { CaptionLayout, MediumCaptionLayout, CaptionText } from './captionLayout';

export type EditorRecovery = {
  caption: CaptionText;
  layout: CaptionLayout;
  mediumLayout: MediumCaptionLayout;
  mediumRejected: boolean;
  mediumReason: string;
  context?: {
    options: CaptionText[];
    selectedCaptionIndex: number;
    captionReason: string;
    placementReason: string;
  };
};

const prefix = 'glance:caption-recovery:v1:';
const captionValid = (value: any): value is CaptionText => value && typeof value.smallText === 'string' && typeof value.bigText === 'string';

export function readEditorRecovery(key: string, version: string): EditorRecovery | null {
  try {
    const raw = globalThis.localStorage?.getItem(prefix + key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (item.version !== version || !captionValid(item.state?.caption)) return null;
    const state = item.state;
    if (!state.layout || !state.mediumLayout || typeof state.mediumRejected !== 'boolean' || typeof state.mediumReason !== 'string') return null;
    if (state.context && (!Array.isArray(state.context.options) || !state.context.options.every(captionValid)
      || !Number.isInteger(state.context.selectedCaptionIndex) || state.context.selectedCaptionIndex < 0
      || state.context.selectedCaptionIndex >= state.context.options.length
      || typeof state.context.captionReason !== 'string' || typeof state.context.placementReason !== 'string')) return null;
    return state;
  } catch { return null; }
}

export function writeEditorRecovery(key: string, version: string, state: EditorRecovery): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(prefix + key, JSON.stringify({ version, state }));
    return true;
  } catch { return false; }
}

export function clearEditorRecovery(key: string) {
  try { globalThis.localStorage?.removeItem(prefix + key); } catch { /* Saving the poster already succeeded. */ }
}
