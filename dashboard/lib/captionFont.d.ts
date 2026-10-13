export const DEFAULT_LETTER_SPACING: number;
export function layoutCaptionGlyphs(text: string, size: number, letterSpacing?: number): {
  glyphs: { path: string; x: number; scale: number; rise: number }[];
  width: number;
  unsupported: string[];
};

export const LOCKED_TYPOGRAPHY: Readonly<{smallFontRatio: number; bigFontRatio: number; letterSpacingEm: number}>;
export const CAPTION_LINE_OFFSET_RATIO: number;
export function captionLineTops(width: number, height: number, layout: {yRatio: number; smallYRatio?: number}): {small: number; big: number};
export function moveCaptionLine<T extends {xRatio: number; yRatio: number; smallXRatio?: number; bigXRatio?: number; smallYRatio?: number}>(width: number, height: number, layout: T, line: 'small' | 'big', dx: number, dy: number): T;
