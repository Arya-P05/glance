// Shared outline geometry: no system-font lookup in the browser or image exporter.
const font = require('../assets/fonts/caption-font.json');
const DEFAULT_LETTER_SPACING = -0.07;
function layoutCaptionGlyphs(text, size, letterSpacing = DEFAULT_LETTER_SPACING) {
  const scale = size / font.unitsPerEm;
  const glyphs = [];
  let x = 0;
  const unsupported = [];
  for (const char of Array.from(text)) {
    const glyph = font.glyphs[char] || font.glyphs['?'];
    if (!font.glyphs[char]) unsupported.push(char);
    glyphs.push({ path: glyph.path, x, scale, rise: char === '*' ? size * .15 : 0 });
    x += glyph.advance * scale + letterSpacing * size;
  }
  return { glyphs, unsupported, width: Math.max(0, x - (glyphs.length ? letterSpacing * size : 0)) };
}
exports.layoutCaptionGlyphs = layoutCaptionGlyphs;
exports.DEFAULT_LETTER_SPACING = DEFAULT_LETTER_SPACING;

// Accepted reference: 640px canvas, line tops at 153px and 187.6px.
const LOCKED_TYPOGRAPHY = Object.freeze({
  smallFontRatio: .02875,
  bigFontRatio: 53.5 / 1024,
  letterSpacingEm: DEFAULT_LETTER_SPACING,
});
const CAPTION_LINE_OFFSET_RATIO = 34.6 / 640;
function captionLineTops(width, height, layout) {
  const small = height * (layout.smallYRatio ?? layout.yRatio);
  return { small, big: small + width * CAPTION_LINE_OFFSET_RATIO };
}
exports.LOCKED_TYPOGRAPHY = LOCKED_TYPOGRAPHY;
exports.CAPTION_LINE_OFFSET_RATIO = CAPTION_LINE_OFFSET_RATIO;
exports.captionLineTops = captionLineTops;

function moveCaptionLine(width, height, layout, line, dx, dy) {
  const tops = captionLineTops(width, height, layout);
  const offsetY = Math.max(-tops.small, Math.min(height - tops.big - width * LOCKED_TYPOGRAPHY.bigFontRatio, dy));
  const xKey = line === 'small' ? 'smallXRatio' : 'bigXRatio';
  return {
    ...layout,
    [xKey]: Math.max(0, Math.min(1, (layout[xKey] ?? layout.xRatio) + dx / width)),
    yRatio: (tops.small + offsetY) / height,
    smallYRatio: (tops.small + offsetY) / height,
    bigYRatio: (tops.big + offsetY) / height,
  };
}
exports.moveCaptionLine = moveCaptionLine;
