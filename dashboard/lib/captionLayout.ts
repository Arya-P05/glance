export type CaptionTextColor = "#050505" | "#ffffff";

export interface CaptionLayout {
  xRatio: number;
  yRatio: number;
  textColor: CaptionTextColor;
}

export interface CaptionText {
  smallText: string;
  bigText: string;
}

export const DEFAULT_CAPTION_LAYOUT: CaptionLayout = {
  xRatio: 0.5,
  yRatio: 0.36,
  textColor: "#050505",
};

/** Gap between small and big lines — keep in sync with backend overlayCaption. */
export const CAPTION_LINE_GAP_RATIO = 0.02;

export const CAPTION_FONT_FAMILY = "Arial Black, Arial, Helvetica, sans-serif";

export function normalizeCaptionLayout(layout?: Partial<CaptionLayout> | null): CaptionLayout {
  const xRatio = Number(layout?.xRatio);
  const yRatio = Number(layout?.yRatio);
  const textColor = layout?.textColor === "#ffffff" ? "#ffffff" : "#050505";
  return {
    xRatio: Number.isFinite(xRatio) ? clamp(xRatio, 0.08, 0.92) : DEFAULT_CAPTION_LAYOUT.xRatio,
    yRatio: Number.isFinite(yRatio) ? clamp(yRatio, 0.08, 0.88) : DEFAULT_CAPTION_LAYOUT.yRatio,
    textColor,
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

export function captionFontSizes(frameWidth: number, caption: CaptionText) {
  const maxTextWidth = frameWidth * 0.76;
  return {
    smallSize: fitTextSize(caption.smallText, Math.round(frameWidth * 0.034), maxTextWidth),
    bigSize: fitTextSize(caption.bigText, Math.round(frameWidth * 0.079), maxTextWidth),
  };
}

/** Top-left caption block rect for a square frame (yRatio = top of small line). */
export function captionBlockRect(frameSize: number, layout: CaptionLayout, caption: CaptionText) {
  const { smallSize, bigSize } = captionFontSizes(frameSize, caption);
  const maxTextWidth = frameSize * 0.76;
  const centerX = frameSize * layout.xRatio;
  const topY = frameSize * layout.yRatio;
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

/** Map square-poster text position into a cover-cropped widget frame. */
export function captionPositionInFrame(
  frameWidth: number,
  frameHeight: number,
  layout: CaptionLayout,
  caption: CaptionText,
  sourceSize = 1024
) {
  const scale = Math.max(frameWidth / sourceSize, frameHeight / sourceSize);
  const scaledSize = sourceSize * scale;
  const offsetX = (frameWidth - scaledSize) / 2;
  const offsetY = (frameHeight - scaledSize) / 2;
  const { smallSize, bigSize } = captionFontSizes(scaledSize, caption);
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
