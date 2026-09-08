/**
 * The `ART` logotype, from the brand manual (deck p. 9).
 *
 * Real vector geometry, extracted with `pdftocairo -svg` and normalised to a
 * tight viewBox — not a trace. Eleven simple closed polygons whose union forms
 * the mark; the counters of `A` and `R` are the negative space between them,
 * so no fill rule is load-bearing and the default `nonzero` is correct.
 *
 * Path data lives here rather than inline in the component to keep the JSX
 * readable, and as data rather than a `.svg` file because the mark is inlined
 * for `currentColor` and SVGR is not configured.
 */
export const ART_MARK_VIEWBOX = "0 0 1099.48 251.31";

export const ART_MARK_PATHS = [
  "M 488.8 125.65 L 772.77 125.65 L 772.77 182.2 L 498.22 182.2 Z",
  "M 660.09 150.79 L 710.2 251.31 L 779.06 251.31 L 728.95 150.79 Z",
  "M 100.37 50.26 L 50.26 150.79 L 50.11 150.79 L 0 251.31 L 68.86 251.31 L 119.12 150.79 L 169.23 50.26 Z",
  "M 339.27 251.3 L 402.09 251.3 L 402.09 0 L 339.27 0 Z",
  "M 420.94 251.3 L 483.77 251.3 L 483.77 0 L 420.94 0 Z",
  "M 709.95 150.78 L 772.77 150.78 L 772.77 0 L 709.95 0 Z",
  "M 100.52 56.54 L 402.09 56.54 L 402.09 0 L 100.52 0 Z",
  "M 420.94 56.54 L 772.78 56.54 L 772.78 0 L 420.94 0 Z",
  "M 785.34 56.54 L 1099.48 56.54 L 1099.48 0 L 785.34 0 Z",
  "M 334.24 125.65 L 82.55 125.65 L 50.26 182.2 L 324.82 182.2 Z",
  "M 911 72.25 L 911 251.3 L 973.82 251.3 L 973.82 61.78 Z",
];

/**
 * The gas-fill shield (deck p. 17).
 *
 * Two subpaths with opposite winding, so the check knocks out under the
 * default `nonzero` — verified by rasterising. Do not add a `fill-rule`.
 */
export const GAS_SHIELD_VIEWBOX = "0 0 98.96 123.66";
export const GAS_SHIELD_PATH =
  "M 44.86 82.93 L 20.75 60 L 29.63 50.66 L 43.66 64 L 68.89 33.12 L 78.88 41.28 Z M 49.48 0 L 0 8.21 L 0 78.41 L 49.48 123.66 L 98.96 78.41 L 98.96 8.21 Z";
