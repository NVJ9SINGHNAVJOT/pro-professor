/** Tuning for the shared components in `components/common` — debounces and viewport bounds. */

/** ⌘K palette: long enough that a fast typist issues one request per word, not one per letter. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Mermaid: re-parsing on every keystroke is wasted work — settle briefly before rendering. */
export const MERMAID_RERENDER_DEBOUNCE_MS = 200;

/**
 * DiagramViewport zoom bounds. Mermaid emits at `width: 100%`, so scale 1 is already "fit to
 * width" — a wide graph (the note network especially) arrives fitted and therefore tiny. The
 * useful direction is *in*, so the ceiling is high and each press is a big jump rather than a
 * nudge; getting from fitted to readable shouldn't take a dozen clicks.
 */
export const VIEWPORT_MIN_SCALE = 0.25;
export const VIEWPORT_MAX_SCALE = 12;
export const VIEWPORT_ZOOM_STEP = 1.5;

/**
 * The graph view's own ceiling. The note network is the extreme case of the above: every note is a
 * node on one canvas, so fitted it's a strip of unreadable labels and even 12× leaves them small.
 * It gets a much higher ceiling than a hand-written fence, which never needs one.
 */
export const GRAPH_VIEW_MAX_SCALE = 100;
