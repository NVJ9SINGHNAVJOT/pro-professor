/* ── Pure Markdown text transforms ────────────────────────────────────────────
 * Every toolbar button, slash-menu pick, and editor keystroke helper is a pure
 * function over the textarea's { value, selectionStart, selectionEnd } — no DOM,
 * no React — so each transform is unit-testable and the screen only has to
 * apply the returned state back to the textarea.
 */

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** A pure editor transform — what palette entries and shortcuts apply to the textarea. */
export type TextAction = (state: TextState) => TextState;

/** Caret marker inside block snippets — U+2038 so real content (table pipes!) never collides. */
export const CARET_MARKER = "‸";

/** A Markdown heading prefix (`#`–`######` + space). */
const HEADING_PREFIX = /^(#{1,6}) /;
/** An unordered list item: indent + `- `. */
const BULLET_PREFIX = /^(\s*)- /;
/** An ordered list item: indent + `N. `. */
const ORDERED_PREFIX = /^(\s*)(\d+)\. /;
/** A quote line: optional indent + `> `. */
const QUOTE_PREFIX = /^(\s*)> /;
/** One indent level (two spaces), matching common Markdown nesting. */
const INDENT = "  ";

/* ── Line helpers ────────────────────────────────────────────────────────── */

/** Index of the first character of the line containing `offset`. */
const lineStartAt = (value: string, offset: number) => value.lastIndexOf("\n", offset - 1) + 1;

/** Index just past the last character of the line containing `offset` (excludes the newline). */
const lineEndAt = (value: string, offset: number) => {
  const next = value.indexOf("\n", offset);
  return next === -1 ? value.length : next;
};

/**
 * Applies a per-line mapping to every line touched by the selection and
 * re-derives the selection: the start shifts with its own line's prefix delta
 * (never before the line start), the end shifts with the total delta.
 */
function transformSelectedLines(state: TextState, map: (line: string, index: number) => string): TextState {
  const blockStart = lineStartAt(state.value, state.selectionStart);
  const blockEnd = lineEndAt(state.value, state.selectionEnd);
  const lines = state.value.slice(blockStart, blockEnd).split("\n");
  const mapped = lines.map(map);

  const firstDelta = mapped[0].length - lines[0].length;
  const totalDelta = mapped.reduce((sum, line, i) => sum + line.length - lines[i].length, 0);
  const value = state.value.slice(0, blockStart) + mapped.join("\n") + state.value.slice(blockEnd);
  return {
    value,
    selectionStart: Math.max(blockStart, state.selectionStart + firstDelta),
    selectionEnd: Math.max(blockStart, state.selectionEnd + totalDelta),
  };
}

/** Strips any list/quote/heading block prefix from a line, keeping the indent. */
const stripBlockPrefix = (line: string) =>
  line
    .replace(HEADING_PREFIX, "")
    .replace(BULLET_PREFIX, "$1")
    .replace(ORDERED_PREFIX, "$1")
    .replace(QUOTE_PREFIX, "$1");

const isBlank = (line: string) => line.trim() === "";

/* ── Block transforms ────────────────────────────────────────────────────── */

/** Sets the selected line(s) to `#·level`; if every line already has that exact level, toggles it off. */
export function setHeading(state: TextState, level: 1 | 2 | 3 | 4 | 5 | 6): TextState {
  const marker = "#".repeat(level) + " ";
  const blockStart = lineStartAt(state.value, state.selectionStart);
  const blockEnd = lineEndAt(state.value, state.selectionEnd);
  const lines = state.value.slice(blockStart, blockEnd).split("\n");
  const allAtLevel = lines.every((line) => isBlank(line) || line.startsWith(marker));
  return transformSelectedLines(state, (line) => {
    if (isBlank(line)) return line;
    const body = line.replace(HEADING_PREFIX, "");
    return allAtLevel ? body : marker + body;
  });
}

/** Toggles `- ` bullets on the selected line(s); ordered items are converted, blank lines skipped. */
export function toggleBulletList(state: TextState): TextState {
  const blockStart = lineStartAt(state.value, state.selectionStart);
  const blockEnd = lineEndAt(state.value, state.selectionEnd);
  const lines = state.value.slice(blockStart, blockEnd).split("\n");
  const allBullets = lines.every((line) => isBlank(line) || BULLET_PREFIX.test(line));
  return transformSelectedLines(state, (line) => {
    if (isBlank(line)) return line;
    if (allBullets) return line.replace(BULLET_PREFIX, "$1");
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    return `${indent}- ${stripBlockPrefix(line).slice(indent.length)}`;
  });
}

/** Toggles `1.`/`2.`… numbering on the selected line(s), renumbering top to bottom. */
export function toggleNumberedList(state: TextState): TextState {
  const blockStart = lineStartAt(state.value, state.selectionStart);
  const blockEnd = lineEndAt(state.value, state.selectionEnd);
  const lines = state.value.slice(blockStart, blockEnd).split("\n");
  const allOrdered = lines.every((line) => isBlank(line) || ORDERED_PREFIX.test(line));
  let number = 0;
  return transformSelectedLines(state, (line) => {
    if (isBlank(line)) return line;
    if (allOrdered) return line.replace(ORDERED_PREFIX, "$1");
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    number += 1;
    return `${indent}${number}. ${stripBlockPrefix(line).slice(indent.length)}`;
  });
}

/** Indents the selected line(s) one level (two spaces) — how sub-lists are made. */
export function indent(state: TextState): TextState {
  return transformSelectedLines(state, (line) => (isBlank(line) ? line : INDENT + line));
}

/** Removes up to one indent level from the selected line(s). */
export function outdent(state: TextState): TextState {
  return transformSelectedLines(state, (line) =>
    line.startsWith(INDENT) ? line.slice(INDENT.length) : line.replace(/^ /, ""),
  );
}

/** Toggles `> ` quoting on the selected line(s). */
export function toggleQuote(state: TextState): TextState {
  const blockStart = lineStartAt(state.value, state.selectionStart);
  const blockEnd = lineEndAt(state.value, state.selectionEnd);
  const lines = state.value.slice(blockStart, blockEnd).split("\n");
  const allQuoted = lines.every((line) => isBlank(line) || QUOTE_PREFIX.test(line));
  return transformSelectedLines(state, (line) => {
    if (isBlank(line)) return line;
    if (allQuoted) return line.replace(QUOTE_PREFIX, "$1");
    const indentPart = /^\s*/.exec(line)?.[0] ?? "";
    return `${indentPart}> ${line.slice(indentPart.length)}`;
  });
}

/** Wraps the selection in a fenced code block (or inserts an empty fence with the caret inside). */
export function insertCodeBlock(state: TextState): TextState {
  const selected = state.value.slice(state.selectionStart, state.selectionEnd);
  const before = state.value.slice(0, state.selectionStart);
  const after = state.value.slice(state.selectionEnd);
  const needsLeadingBreak = before !== "" && !before.endsWith("\n");
  const open = `${needsLeadingBreak ? "\n" : ""}\`\`\`\n`;
  const close = `\n\`\`\`${after.startsWith("\n") || after === "" ? "" : "\n"}`;
  const caret = state.selectionStart + open.length;
  return {
    value: before + open + selected + close + after,
    selectionStart: caret,
    selectionEnd: caret + selected.length,
  };
}

/* ── Inline transforms ───────────────────────────────────────────────────── */

/** Wraps/unwraps the selection with an inline marker (`**` bold, `*` italic, `` ` `` code). */
export function wrapInline(state: TextState, marker: string): TextState {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const selected = value.slice(start, end);

  // unwrap when the marker already encloses the selection (inside or just outside it)
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  if (value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker) {
    return {
      value: value.slice(0, start - marker.length) + selected + value.slice(end + marker.length),
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    };
  }
  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    selectionStart: start + marker.length,
    selectionEnd: end + marker.length,
  };
}

/* ── Enter inside a list ─────────────────────────────────────────────────── */

/**
 * Enter inside a list item continues the list: a new `- ` / next-number prefix
 * at the same indent. On an EMPTY item it backs out instead — outdents one
 * level if nested, otherwise removes the prefix (Obsidian/Notion behavior).
 * Returns null when the caret isn't in a list item (let the default Enter run).
 */
export function continueListOnEnter(state: TextState): TextState | null {
  if (state.selectionStart !== state.selectionEnd) return null;
  const caret = state.selectionStart;
  const start = lineStartAt(state.value, caret);
  const end = lineEndAt(state.value, caret);
  const line = state.value.slice(start, end);

  const bullet = BULLET_PREFIX.exec(line);
  const ordered = ORDERED_PREFIX.exec(line);
  if (!bullet && !ordered) return null;

  const indentPart = (bullet ?? ordered)![1];
  const prefixLength = bullet ? bullet[0].length : ordered![0].length;
  const item = line.slice(prefixLength);

  if (item.trim() === "") {
    // empty item: outdent one level, or exit the list entirely at top level
    const replacement =
      indentPart.length >= INDENT.length ? indentPart.slice(INDENT.length) + line.slice(indentPart.length) : "";
    return {
      value: state.value.slice(0, start) + replacement + state.value.slice(end),
      selectionStart: start + replacement.length,
      selectionEnd: start + replacement.length,
    };
  }

  const nextPrefix = bullet ? `${indentPart}- ` : `${indentPart}${Number(ordered![2]) + 1}. `;
  const inserted = `\n${nextPrefix}`;
  return {
    value: state.value.slice(0, caret) + inserted + state.value.slice(caret),
    selectionStart: caret + inserted.length,
    selectionEnd: caret + inserted.length,
  };
}

/* ── Block insertion (slash menu) ────────────────────────────────────────── */

/**
 * Replaces the slash-command range (the `/` + what was typed after it) with a
 * block snippet, placing the caret at the snippet's `‸` marker (or its end).
 */
export function replaceRange(state: TextState, from: number, to: number, snippet: string): TextState {
  const caretMarker = snippet.indexOf(CARET_MARKER);
  const text =
    caretMarker === -1 ? snippet : snippet.slice(0, caretMarker) + snippet.slice(caretMarker + CARET_MARKER.length);
  const caret = from + (caretMarker === -1 ? text.length : caretMarker);
  return {
    value: state.value.slice(0, from) + text + state.value.slice(to),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/* ── Applying a result ───────────────────────────────────────────────────── */

/**
 * The single span of `before` that has to be replaced — and what to replace it with — to get
 * `after`: the common prefix and suffix trimmed off both sides.
 *
 * Transforms rebuild the whole value, but the textarea must only be *edited* where it actually
 * changed. NotesScreen writes that edit through `execCommand`, and the edit's width is what the
 * browser records as one undo step: replacing the entire note would make Cmd+Z restore the note's
 * previous text as a single blob, and would wipe the selection of everything the user didn't touch.
 */
export function changedRange(before: string, after: string): { start: number; end: number; text: string } {
  const limit = Math.min(before.length, after.length);
  let start = 0;
  while (start < limit && before[start] === after[start]) start += 1;
  // Stop the suffix scan at `start` from both sides, or a repeated character
  // ("ab" → "aab") would be counted into the prefix and the suffix at once.
  const maxTail = Math.min(before.length, after.length) - start;
  let tail = 0;
  while (tail < maxTail && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return { start, end: before.length - tail, text: after.slice(start, after.length - tail) };
}
