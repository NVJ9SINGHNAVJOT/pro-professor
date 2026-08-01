/* ── Markdown problem detection ───────────────────────────────────────────────
 * Markdown never fails to parse: a mistake renders as something else rather than
 * raising anything, so nothing tells the writer that their table became a
 * paragraph or that their frontmatter was dropped. These checks look for the
 * structural slips that change a note silently, and report them against the
 * note's own line numbers so the panel can drop the caret on the offending line.
 *
 * Pure over the raw source — frontmatter included, nothing stripped — because
 * the line numbers have to line up with the textarea.
 */

import { DIAGRAM_SUFFIX, INLINE_CODE, WIKI_REF } from "@/modules/notes/constants";
import { isImageTarget } from "@/modules/notes/utils";

export type ProblemSeverity = "error" | "warning" | "info";

export interface Problem {
  /** 1-based line in the raw note source, so it maps straight onto the editor. */
  line: number;
  severity: ProblemSeverity;
  message: string;
}

/** An opening or closing code fence: indent + three-or-more backticks/tildes + optional info string. */
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
/** `#`–`######` with no space before the text — renders as plain text, not a heading. */
const HEADING_NO_SPACE = /^(#{1,6})([^#\s].*)$/;
/** A callout marker line: `> [!type]`. */
const CALLOUT_LINE = /^\s*>\s*\[!(\w+)\]/;
/** One cell of a table's `|---|` separator row. */
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;
/** A top-level frontmatter `key: value` line — YAML needs the space after the colon. */
const YAML_PAIR = /^[^:\s][^:]*:(\s|$)/;

/** Callout types with a colour in markdown.css; anything else falls back to the default blue. */
const CALLOUT_TYPES = new Set([
  "note",
  "info",
  "tip",
  "hint",
  "important",
  "success",
  "check",
  "done",
  "warning",
  "caution",
  "attention",
  "danger",
  "error",
  "bug",
  "failure",
  "question",
  "help",
  "faq",
  "example",
  "quote",
  "cite",
]);

const isTableRow = (line: string) => {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && (trimmed.match(/\|/g)?.length ?? 0) >= 2;
};

const tableCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");

const isDelimiterRow = (line: string | undefined) =>
  line !== undefined && isTableRow(line) && tableCells(line).every((cell) => DELIMITER_CELL.test(cell));

/**
 * Index of the first body line. Mirrors the backend's anchored block regex
 * (Frontmatter.BLOCK): the opener has to be line 1 and it has to close, or there
 * is no frontmatter block at all and the whole note is body.
 */
function frontmatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

/**
 * Frontmatter mistakes are the only ones that lose data: the server parses the
 * block with SnakeYAML and, when that throws, treats the note as having none —
 * silently dropping the title and tags it was carrying.
 */
function checkFrontmatter(lines: string[], problems: Problem[]) {
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (close === -1) {
      problems.push({
        line: 1,
        severity: "error",
        message: "Frontmatter block is never closed — add a `---` line. Until then its title and tags are ignored.",
      });
      return;
    }
    for (let i = 1; i < close; i++) {
      const line = lines[i];
      if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
      // YAML forbids tabs in indentation (inside a value they are fine).
      if (/^ *\t/.test(line)) {
        problems.push({
          line: i + 1,
          severity: "error",
          message: "Indented with a tab — YAML forbids tabs, so the whole block is dropped, title and tags with it.",
        });
        continue;
      }
      // Indented lines are legal continuations — nested keys, list items, block
      // scalars — so only top-level lines have to be `key: value` pairs.
      if (/^\s/.test(line)) continue;
      if (!YAML_PAIR.test(line)) {
        problems.push({
          line: i + 1,
          severity: "warning",
          message: "Not a `key: value` pair — invalid YAML drops the whole block, title and tags with it.",
        });
      }
    }
    return;
  }
  // A block that starts a line or two down never registers: the parser anchors it to line 1.
  const firstContent = lines.findIndex((line) => line.trim() !== "");
  if (
    firstContent > 0 &&
    lines[firstContent].trim() === "---" &&
    lines.slice(firstContent + 1).some((line) => line.trim() === "---")
  ) {
    problems.push({
      line: firstContent + 1,
      severity: "warning",
      message: "Frontmatter must start on line 1 — below one it reads as a divider and its title and tags are ignored.",
    });
  }
}

/**
 * Structural problems in a note's Markdown, in line order.
 *
 * @param content    the raw note source, frontmatter included
 * @param linkExists resolves a wiki-link target to an existing note; omit to skip the link checks
 */
export function lintMarkdown(content: string, linkExists?: (target: string) => boolean): Problem[] {
  const problems: Problem[] = [];
  const lines = content.split("\n");
  checkFrontmatter(lines, problems);

  let fence: { char: string; size: number; line: number } | null = null;
  /** Line of the `$$` that is still waiting for its pair, or null outside a math block. */
  let mathOpenLine: number | null = null;
  const reportedLinks = new Set<string>();

  for (let i = frontmatterEnd(lines); i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = FENCE_LINE.exec(line);
    if (fenceMatch) {
      const [, marker, info] = fenceMatch;
      if (!fence) {
        fence = { char: marker[0], size: marker.length, line: i + 1 };
      } else if (marker[0] === fence.char && marker.length >= fence.size && info.trim() === "") {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const heading = HEADING_NO_SPACE.exec(line);
    if (heading) {
      // A single `#` before one unbroken word is an inline tag (`#project`), not a broken heading.
      const isTag = heading[1].length === 1 && !/\s/.test(heading[2].trim());
      if (!isTag) {
        problems.push({
          line: i + 1,
          severity: "warning",
          message: "Add a space after `#` — without it this renders as plain text, not a heading.",
        });
      }
    }

    const callout = CALLOUT_LINE.exec(line);
    if (callout && !CALLOUT_TYPES.has(callout[1].toLowerCase())) {
      problems.push({
        line: i + 1,
        severity: "info",
        message: `Unknown callout type "${callout[1]}" — it renders in the default blue. Try note, tip, success, warning, danger, question, example or quote.`,
      });
    }

    // Only the header row is checked: the rows under it are matched against it, and a
    // delimiter row is itself a table row, so neither is mistaken for a new header.
    if (isTableRow(line) && !isTableRow(lines[i - 1] ?? "")) {
      if (!isDelimiterRow(lines[i + 1])) {
        problems.push({
          line: i + 1,
          severity: "error",
          message: "Table header has no `|---|` separator row below it — this renders as a paragraph of pipes.",
        });
      } else if (tableCells(lines[i + 1]).length !== tableCells(line).length) {
        problems.push({
          line: i + 1,
          severity: "warning",
          message: `Header has ${tableCells(line).length} columns but the separator row has ${tableCells(lines[i + 1]).length} — the extra columns are dropped.`,
        });
      }
    }

    const blockDelimiters = (line.match(/\$\$/g) ?? []).length;
    for (let k = 0; k < blockDelimiters; k++) {
      mathOpenLine = mathOpenLine === null ? i + 1 : null;
    }
    // Inline `$…$` only outside a block, and only when a `$` opens onto something that
    // looks like math — otherwise every stray price ("costs $5") would be a problem.
    if (mathOpenLine === null && blockDelimiters === 0) {
      const dollars = (line.match(/\$/g) ?? []).length;
      if (dollars % 2 === 1 && /\$[^\s\d]/.test(line)) {
        problems.push({
          line: i + 1,
          severity: "warning",
          message: "Unbalanced `$` — an inline math delimiter is left open, so the rest of the line renders as text.",
        });
      }
    }

    if (linkExists) {
      for (const match of line.replace(INLINE_CODE, "").matchAll(WIKI_REF)) {
        const target = match[1].trim();
        const key = target.toLowerCase();
        // Images resolve to uploads and `.diagram` targets to the diagram module — neither is a note.
        if (!target || isImageTarget(target) || target.endsWith(DIAGRAM_SUFFIX) || reportedLinks.has(key)) continue;
        if (!linkExists(target)) {
          reportedLinks.add(key);
          problems.push({
            line: i + 1,
            severity: "info",
            message: `"${target}" doesn't exist yet — the link opens a blank note.`,
          });
        }
      }
    }
  }

  if (fence) {
    problems.push({
      line: fence.line,
      severity: "error",
      message: "Code fence opened here is never closed — everything below it renders as code.",
    });
  }
  if (mathOpenLine !== null) {
    problems.push({
      line: mathOpenLine,
      severity: "error",
      message: "`$$` math block opened here is never closed.",
    });
  }

  return problems.sort((a, b) => a.line - b.line);
}
