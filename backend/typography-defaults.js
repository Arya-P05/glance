import { LOCKED_TYPOGRAPHY } from '../dashboard/lib/captionFont.js';

// Source-controlled calibration applies everywhere, including fresh installs.
export function readTypographyDefaults() { return { ...LOCKED_TYPOGRAPHY }; }
