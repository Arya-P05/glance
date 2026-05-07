# Glance iOS Design System

Glance is a quiet widget companion. The app should feel like a control room for a single daily visual moment, not a feed, gallery, or productivity dashboard.

## Product Principles

- **One object at a time.** The current widget photo is the center of the product. Secondary features must support that object without competing with it.
- **Low ceremony.** Prefer direct words, light gestures, and small controls over explanatory panels.
- **Soft confidence.** The interface can be sparse, but it should never feel broken. Empty, loading, and failed states need calm feedback.
- **Memory, not management.** Recents and metadata are useful when they help users revisit a moment. Avoid heavy organization, folders, tags, likes, or feed mechanics.
- **Widget first.** The home-screen widget is the primary experience. The app exists to install, preview, share, tune, and recover what the widget shows.

## Visual Language

- **Background:** pure black (`#000000`) across the main app and sheets.
- **Foreground:** white with opacity steps instead of multiple hues.
- **Type:** San Francisco system font only.
- **Case:** sentence case, mostly lowercase, short phrases.
- **Corners:** photo corners are soft but restrained: `16pt` continuous radius.
- **Spacing:** generous vertical whitespace; horizontal padding is usually `24-28pt`.
- **Color accents:** use accent color only for transient feedback.
  - Success: soft green.
  - Warning/failure: soft amber.

## Type Scale

- Intro/onboarding/supporting text: `15-18pt`, regular.
- Primary sheet title: `20pt`, semibold.
- Actions: `16pt`, regular.
- Index labels: `12pt`, monospaced.
- Metadata: `13-14pt`, regular, high transparency.

## Components

### Photo Preview

- Square crop.
- Centered, with a slight optical left bias preserved from the current app.
- Uses `scaledToFill`, clips overflow, and applies a continuous `16pt` radius.
- Empty state stays in the same square footprint.

### Text Actions

- Inline lowercase words separated by a middle dot.
- Default opacity is `0.52` when enabled and `0.22` when unavailable.
- Success/failure uses a short color pulse and small vertical motion.
- Add new text actions only when they operate on the current photo or reveal a small secondary surface.

### Sheets

- Black background, dark color scheme.
- Drag indicator visible.
- Centered content when informational.
- Use compact controls; avoid card-heavy settings.

### Recents

- Recents are a recovery surface, not a destination.
- Use a small grid with square thumbnails.
- Keep the cap small.
- No visible labels on every tile; metadata can appear in the detail sheet.

## Interaction Rules

- Tap actions should produce immediate haptic or visual feedback when possible.
- Background widget refresh timing should be explained only where users choose cadence.
- Destructive or complex settings do not belong in the main surface.
- If a feature needs more than a short phrase to explain, it probably does not fit Glance.

## Current Update Direction

The next update should add:

- Current-photo context: caption and last refreshed time, shown quietly.
- A recent glances surface capped to a small local history.
- Reuse of existing save/copy/share affordances for current and recent photos.
- Shared constants for type, opacity, colors, radius, and spacing.

Avoid:

- Social actions.
- Full-screen feeds.
- Bright palettes.
- Decorative gradients.
- Complex onboarding.
- Persistent badges, gamification, or analytics.
