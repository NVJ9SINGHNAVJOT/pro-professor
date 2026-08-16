/* ── Finding an edit's target in the buffer ───────────────────────────────────
 * An edit is anchored by the text it quotes, never by offsets: the model is looking
 * at a copy of the note taken when the turn was sent, and the buffer keeps moving
 * while it writes. Re-finding at accept time is what lets an edit still land after
 * you have typed above it — and what makes a genuinely changed span refuse rather
 * than overwrite the wrong text.
 */

export interface EditRange {
  start: number;
  end: number;
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (text: string) => text.replace(REGEX_META, "\\$&");

/**
 * Locates the text an edit quotes, or null when it is no longer there.
 *
 * Two passes. Exact first. Then one that ignores each line's **trailing** whitespace
 * on both sides, because local models drop trailing spaces constantly and a Markdown
 * hard break (two trailing spaces) is invisible in the reply they were shown. Leading
 * whitespace is never relaxed — it is list nesting and fence indentation.
 *
 * First occurrence wins, matching how an AI edit has always been spliced here; the
 * system prompt is what asks the model to quote enough context to be unique.
 */
export function locateEdit(buffer: string, find: string): EditRange | null {
  if (find === "") return null;

  const exact = buffer.indexOf(find);
  if (exact !== -1) return { start: exact, end: exact + find.length };

  const pattern = find
    .split("\n")
    .map((line) => escapeRegex(line.replace(/[ \t]+$/, "")) + "[ \\t]*")
    .join("\n");
  const loose = new RegExp(pattern).exec(buffer);
  return loose === null ? null : { start: loose.index, end: loose.index + loose[0].length };
}

/** 1-based line of `offset`, for the line number on a card's header. */
export const lineNumberAt = (buffer: string, offset: number) => buffer.slice(0, offset).split("\n").length;
