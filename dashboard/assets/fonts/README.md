# Reference caption lettering

`caption-font.json` contains SVG glyph outlines and advance widths from Archivo Black, sourced from https://github.com/google/fonts/tree/main/ofl/archivoblack. See ArchivoBlack-OFL.txt for the included license. Glyphs are unmodified font coordinates; the shared layout helper applies tracking and raises the asterisk to approximate the reference lettering.

Both the dashboard and backend import `lib/captionFont.js` and use these same paths. Rendering never depends on installed fonts or browser font substitution. This is a measured visual approximation of the flattened reference image, not a confirmed identification of its original typeface.

The accepted calibration is fixed in `captionFont.js`: first line 29.44px and second line 53.5px at 1024px image width. The line tops are separated by 55.36px at that width (measured as 34.6px on the 640px reference canvas). These values scale with output width and cannot be changed by saved layout metadata or API settings. Each line retains its own horizontal center; vertical dragging moves the pair together.
