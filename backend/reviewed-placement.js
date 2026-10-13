import { normalizeCaptionLayout, normalizeMediumCaptionLayout } from './motivational-generator.js';

// Every new caption starts in the same position; the editor handles adjustments.
export function defaultCaptionPlacement() {
  return {
    layout: normalizeCaptionLayout({ textColor: '#050505' }),
    mediumLayout: normalizeMediumCaptionLayout({ textColor: '#050505' }),
    feedbackIds: [],
  };
}
