export type CaptionTextColor = "#050505" | "#ffffff";

export interface CaptionLayout {
  xRatio: number;
  yRatio: number;
  textColor: CaptionTextColor;
  fontScale: number;
}

export type CaptionLayoutInput =
  Partial<Omit<CaptionLayout, "textColor"> & { textColor: CaptionTextColor | null }>;

export interface MediumCaptionLayout extends CaptionLayout {
  cropXRatio: number;
  cropYRatio: number;
}

export type MediumCaptionLayoutInput =
  CaptionLayoutInput & Partial<Pick<MediumCaptionLayout, "cropXRatio" | "cropYRatio">>;

export interface CaptionText {
  smallText: string;
  bigText: string;
}

export const DEFAULT_CAPTION_LAYOUT: CaptionLayout = {
  xRatio: 0.5,
  yRatio: 0.3,
  textColor: "#050505",
  fontScale: 1,
};

export const DEFAULT_MEDIUM_CAPTION_LAYOUT: MediumCaptionLayout = {
  ...DEFAULT_CAPTION_LAYOUT,
  yRatio: 0.26,
  cropXRatio: 0.5,
  cropYRatio: 0.5,
};

/** Gap between small and big lines — keep in sync with backend overlayCaption. */
export const CAPTION_LINE_GAP_RATIO = 0.12;
export const CAPTION_SMALL_FONT_RATIO = 0.032;
export const CAPTION_BIG_FONT_RATIO = 0.06;

export const CAPTION_FONT_FAMILY = "Arial, Helvetica, sans-serif";

export function normalizeCaptionLayout(layout?: CaptionLayoutInput | null): CaptionLayout {
  const xRatio = Number(layout?.xRatio);
  const yRatio = Number(layout?.yRatio);
  const fontScale = Number(layout?.fontScale);
  const textColor = layout?.textColor === "#ffffff" ? "#ffffff" : "#050505";
  return {
    xRatio: Number.isFinite(xRatio) ? clamp(xRatio, 0.08, 0.92) : DEFAULT_CAPTION_LAYOUT.xRatio,
    yRatio: Number.isFinite(yRatio) ? clamp(yRatio, 0.08, 0.88) : DEFAULT_CAPTION_LAYOUT.yRatio,
    textColor,
    fontScale: Number.isFinite(fontScale) ? clamp(fontScale, 0.7, 1.45) : DEFAULT_CAPTION_LAYOUT.fontScale,
  };
}

export function normalizeMediumCaptionLayout(
  layout?: MediumCaptionLayoutInput | null,
  fallback?: CaptionLayoutInput | null
): MediumCaptionLayout {
  const textLayout = normalizeCaptionLayout({
    ...(fallback ?? DEFAULT_MEDIUM_CAPTION_LAYOUT),
    ...(layout ?? {}),
  });
  const cropXRatio = Number(layout?.cropXRatio);
  const cropYRatio = Number(layout?.cropYRatio);
  return {
    ...textLayout,
    cropXRatio: Number.isFinite(cropXRatio) ? clamp(cropXRatio, 0, 1) : DEFAULT_MEDIUM_CAPTION_LAYOUT.cropXRatio,
    cropYRatio: Number.isFinite(cropYRatio) ? clamp(cropYRatio, 0, 1) : DEFAULT_MEDIUM_CAPTION_LAYOUT.cropYRatio,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fitTextSize(text: string, targetSize: number, maxWidth: number) {
  const length = Math.max(1, text.length);
  const estimatedWidth = length * targetSize * 0.56;
  if (estimatedWidth <= maxWidth) return targetSize;
  return Math.max(Math.round(maxWidth * 0.036), Math.floor(targetSize * (maxWidth / estimatedWidth)));
}

export function captionFontSizes(frameWidth: number, caption: CaptionText, fontScale = 1) {
  const maxTextWidth = frameWidth * 0.66;
  return {
    smallSize: fitTextSize(caption.smallText, Math.round(frameWidth * CAPTION_SMALL_FONT_RATIO * fontScale), maxTextWidth),
    bigSize: fitTextSize(caption.bigText, Math.round(frameWidth * CAPTION_BIG_FONT_RATIO * fontScale), maxTextWidth),
  };
}

/** Top-left caption block rect for a square frame (yRatio = top of small line). */
export function captionBlockRect(frameSize: number, layout: CaptionLayout, caption: CaptionText) {
  return captionBlockRectForFrame(frameSize, frameSize, layout, caption);
}

/** Top-left caption block rect for any rendered frame (yRatio = top of small line). */
export function captionBlockRectForFrame(
  frameWidth: number,
  frameHeight: number,
  layout: CaptionLayout,
  caption: CaptionText
) {
  const { smallSize, bigSize } = captionFontSizes(frameWidth, caption, layout.fontScale);
  const maxTextWidth = frameWidth * 0.66;
  const centerX = frameWidth * layout.xRatio;
  const topY = frameHeight * layout.yRatio;
  return {
    left: centerX - maxTextWidth / 2,
    top: topY,
    width: maxTextWidth,
    centerX,
    topY,
    smallSize,
    bigSize,
    lineGap: Math.round(bigSize * CAPTION_LINE_GAP_RATIO),
    textColor: layout.textColor,
  };
}

export function sourceCropInFrame(
  frameWidth: number,
  frameHeight: number,
  cropXRatio = 0.5,
  cropYRatio = 0.5,
  sourceSize = 1024
) {
  const scale = Math.max(frameWidth / sourceSize, frameHeight / sourceSize);
  const scaledSize = sourceSize * scale;
  const overflowX = Math.max(0, scaledSize - frameWidth);
  const overflowY = Math.max(0, scaledSize - frameHeight);
  return {
    scaledSize,
    offsetX: -overflowX * clamp(cropXRatio, 0, 1),
    offsetY: -overflowY * clamp(cropYRatio, 0, 1),
  };
}

/** Map square-poster text position into a cover-cropped widget frame. */
export function captionPositionInFrame(
  frameWidth: number,
  frameHeight: number,
  layout: CaptionLayout,
  caption: CaptionText,
  sourceSize = 1024
) {
  const { scaledSize, offsetX, offsetY } = sourceCropInFrame(frameWidth, frameHeight, 0.5, 0.5, sourceSize);
  const { smallSize, bigSize } = captionFontSizes(scaledSize, caption, layout.fontScale);
  const x = offsetX + scaledSize * layout.xRatio;
  const y = offsetY + scaledSize * layout.yRatio;
  return {
    x,
    y,
    smallSize,
    bigSize,
    scaledSize,
    offsetX,
    offsetY,
  };
}
