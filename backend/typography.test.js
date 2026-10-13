import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readTypographyDefaults } from './typography-defaults.js';
import { captionFontSizes, normalizeCaptionLayout, normalizeMediumCaptionLayout, overlayCaption, overlayMediumCaption } from './motivational-generator.js';

const sizes = { smallFontRatio: .02875, bigFontRatio: 53.5 / 1024 };
test('calibration is available without a local settings file and cannot be overridden', () => {
  assert.deepEqual(readTypographyDefaults(), { ...sizes, letterSpacingEm: -.07 });
  for (const normalize of [normalizeCaptionLayout, normalizeMediumCaptionLayout]) {
    const layout = normalize({ smallFontRatio: .2, bigFontRatio: .2, fontScale: 1.8 });
    assert.equal(layout.smallFontRatio, sizes.smallFontRatio);
    assert.equal(layout.bigFontRatio, sizes.bigFontRatio);
    assert.deepEqual(captionFontSizes(1024, {}, layout), { smallSize: 29.44, bigSize: 53.5 });
  }
  assert.deepEqual(captionFontSizes(1024, {}, 2), { smallSize: 29.44, bigSize: 53.5 });
});
test('locked sizes never shrink for longer captions and scale with output width', () => {
  const layout = normalizeCaptionLayout(sizes);
  const short = captionFontSizes(1024, { smallText: 'hi', bigText: 'world' }, layout);
  const long = captionFontSizes(1024, { smallText: 'a'.repeat(90), bigText: 'b'.repeat(90) }, layout);
  assert.deepEqual(short, long);
  assert.deepEqual(short, { smallSize: 29.44, bigSize: 53.5 });
  const half = captionFontSizes(512, { smallText: 'hi', bigText: 'world' }, layout);
  assert.equal(half.smallSize * 2, short.smallSize);
  assert.equal(half.bigSize * 2, short.bigSize);
});
test('both formats round-trip independent positions and preserve legacy layouts', () => {
  const positions = { smallXRatio: .2, smallYRatio: .1, bigXRatio: .8, bigYRatio: .6 };
  for (const normalize of [normalizeCaptionLayout, normalizeMediumCaptionLayout]) {
    const layout = normalize({ ...sizes, ...positions });
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(layout))), layout);
    for (const [key, value] of Object.entries(positions)) assert.equal(layout[key], value);
    assert.equal(normalize({ xRatio: .3, yRatio: .4 }).bigYRatio, undefined);
  }
});
test('square and wide exports retain independent horizontal positions and locked vertical spacing', async () => {
  const background = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const layout = { ...sizes, smallXRatio: .2, smallYRatio: .1, bigXRatio: .8, bigYRatio: .6, textColor: '#050505' };
  for (const render of [overlayCaption, overlayMediumCaption]) {
    const output = await render(background, { smallText: 'top', bigText: 'bottom' }, layout);
    const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let first = 0, second = 0, misplaced = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels] > 80) continue;
      if (x < info.width * .4 && y < info.height * .3) first++;
      else if (x > info.width * .5 && y > info.height * .1 && y < info.height * .4) second++;
      else misplaced++;
    }
    assert.ok(first > 100); assert.ok(second > 100); assert.equal(misplaced, 0);
  }
});

test('vertical gap ignores stale second-line positions and scales with image width', async () => {
  const { captionLineTops, CAPTION_LINE_OFFSET_RATIO } = await import('../dashboard/lib/captionFont.js');
  for (const [width, height] of [[640, 640], [1024, 1024], [1024, 482]]) {
    const initial = captionLineTops(width, height, { yRatio: .2, smallYRatio: .3, bigYRatio: .9 });
    const moved = captionLineTops(width, height, { yRatio: .4, smallYRatio: .5, bigYRatio: .1 });
    assert.ok(Math.abs(initial.big - initial.small - width * CAPTION_LINE_OFFSET_RATIO) < 1e-10);
    assert.ok(Math.abs(moved.big - initial.big - (moved.small - initial.small)) < 1e-10);
  }
  assert.deepEqual(captionLineTops(640, 640, { yRatio: 153 / 640 }), { small: 153, big: 187.6 });
});

test('preview and export share bundled outlines, spacing and raised punctuation', async () => {
  const { layoutCaptionGlyphs } = await import('../dashboard/lib/captionFont.js');
  const normal = layoutCaptionGlyphs('f* their opinion.', 40);
  const double = layoutCaptionGlyphs('f* their opinion.', 80);
  assert.equal(double.width, normal.width * 2);
  assert.equal(normal.glyphs[1].rise, 6);
  assert.ok(normal.glyphs.every(glyph => typeof glyph.path === 'string'));
  assert.ok(layoutCaptionGlyphs('their opinion.', 40, -.07).width < layoutCaptionGlyphs('their opinion.', 40, 0).width);
  assert.deepEqual(layoutCaptionGlyphs('hello 🙂', 40).unsupported, ['🙂']);
});

test('dragging either line changes only its X and moves both Y positions equally, including at edges', async () => {
  const { moveCaptionLine, captionLineTops } = await import('../dashboard/lib/captionFont.js');
  const initial = { xRatio: .5, yRatio: .3, smallXRatio: .2, bigXRatio: .8 };
  for (const line of ['small', 'big']) {
    const moved = moveCaptionLine(640, 640, initial, line, 32, 64);
    assert.equal(moved.smallXRatio, line === 'small' ? .25 : .2);
    assert.ok(Math.abs(moved.bigXRatio - (line === 'big' ? .85 : .8)) < 1e-10);
    const before = captionLineTops(640, 640, initial), after = captionLineTops(640, 640, moved);
    assert.equal(after.small - before.small, 64);
    assert.ok(Math.abs(after.big - before.big - 64) < 1e-10);
    for (const dy of [-10000, 10000]) {
      const edge = captionLineTops(640, 640, moveCaptionLine(640, 640, initial, line, 0, dy));
      assert.ok(edge.small >= 0 && edge.big + 640 * sizes.bigFontRatio <= 640);
      assert.ok(Math.abs(edge.big - edge.small - 34.6) < 1e-10);
    }
  }
});
