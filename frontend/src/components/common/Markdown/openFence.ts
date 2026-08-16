/* ── Finding a code fence left open ──────────────────────────────────────────
 * A fenced block with no closing fence is not a syntax error: CommonMark runs it
 * to the end of the input, so `remark` hands back a normal `code` node carrying
 * a half-written body. That is exactly what happens on every token of a
 * streaming reply, and for a ```mermaid fence it means the renderer is asked to
 * draw a diagram that isn't finished being written.
 *
 * The fence markers only exist in the raw source — react-markdown passes the
 * block's *body* to the component — so this has to run before parsing.
 */

/** Indent + three-or-more backticks/tildes + optional info string. Twin of lintMarkdown's. */
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

export interface OpenFence {
  /** Offset of the opening fence line — everything before it is complete markdown. */
  start: number;
  /** Offset just past the opening fence line, where the block's body begins. */
  contentStart: number;
  /** The info string, lowercased and trimmed: `mermaid` for ```` ```mermaid ````. */
  lang: string;
}

/**
 * The fence still open at the end of `source`, or null when every fence is closed.
 *
 * Closing rules are CommonMark's, matching the scanner in
 * `modules/notes/editor/lintMarkdown.ts`: a closer must use the same character, be at least as long
 * as the opener, and carry no info string. (That one is line-oriented and reports line numbers for
 * the Problems list; this one reports offsets so the source can be split. Kept separate rather than
 * merged, because that one's shape is pinned by its own tests.)
 */
export function openFence(source: string): OpenFence | null {
  const lines = source.split("\n");
  let fence: { char: string; size: number; start: number; contentStart: number; lang: string } | null = null;
  let offset = 0;

  for (const line of lines) {
    const lineEnd = offset + line.length + 1; // +1 for the "\n" that split() removed
    const match = FENCE_LINE.exec(line);
    if (match) {
      const [, marker, info] = match;
      if (!fence) {
        fence = {
          char: marker[0],
          size: marker.length,
          start: offset,
          contentStart: lineEnd,
          lang: info.trim().toLowerCase(),
        };
      } else if (marker[0] === fence.char && marker.length >= fence.size && info.trim() === "") {
        fence = null;
      }
    }
    offset = lineEnd;
  }

  return fence === null ? null : { start: fence.start, contentStart: fence.contentStart, lang: fence.lang };
}
