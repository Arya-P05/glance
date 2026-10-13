import { readTypographyDefaults } from "./typography-defaults.js";
import { normalizeCaptionLayout, normalizeMediumCaptionLayout } from './motivational-generator.js';

// Every new caption starts in the same position; the editor handles adjustments.
export function defaultCaptionPlacement() {
  const typography = readTypographyDefaults() || {};
  return {
    layout: normalizeCaptionLayout({ textColor: '#050505', ...typography }),
    mediumLayout: normalizeMediumCaptionLayout({ textColor: '#050505', ...typography }),
    feedbackIds: [],
  };
}
