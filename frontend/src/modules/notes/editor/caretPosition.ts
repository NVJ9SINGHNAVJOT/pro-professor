/**
 * Pixel position of a caret offset inside a textarea, relative to the
 * textarea's border box (scroll already subtracted). Standard mirror-div
 * technique: clone the styles that affect text flow onto a hidden div, render
 * the text up to the offset, and measure a marker span at the caret.
 */

/** Style properties that determine where text wraps and lines land. */
const MIRRORED_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "wordSpacing",
] as const;

export interface CaretPosition {
  top: number;
  left: number;
  /** The rendered line height, so callers can place a menu below the caret line. */
  lineHeight: number;
}

export function measureCaret(textarea: HTMLTextAreaElement, offset: number): CaretPosition {
  const mirror = document.createElement("div");
  const computed = window.getComputedStyle(textarea);
  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = computed[property];
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordBreak = "break-word";
  mirror.style.overflow = "hidden";
  // getComputedStyle().width resolves to the CONTENT width, but `boxSizing` is copied over with it —
  // and under the border-box Tailwind sets globally that makes the mirror lay text out a whole
  // padding narrower than the textarea does, so it wraps in the wrong places and reports the caret
  // on the wrong line. clientWidth is the padding box, which is what border-box measures against
  // (and it excludes the scrollbar, which the textarea doesn't wrap under either).
  mirror.style.width = `${textarea.clientWidth}px`;

  mirror.textContent = textarea.value.slice(0, offset);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  const lineHeight = Number.parseFloat(computed.lineHeight) || marker.offsetHeight;
  document.body.removeChild(mirror);

  return { top, left, lineHeight };
}
