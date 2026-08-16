/* ── Line diff ────────────────────────────────────────────────────────────────
 * What an edit card draws. Hand-rolled rather than a dependency: this project
 * carries two frontend libraries on purpose (mermaid, Excalidraw) and a line LCS
 * is smaller than the wrapper would be.
 */

export interface DiffRow {
  type: "same" | "add" | "del";
  text: string;
}

/** A run of unchanged lines that `collapseUnchanged` folded away. */
export interface DiffGap {
  type: "gap";
  hidden: number;
}

/**
 * Cell budget for the LCS table. A whole-note `<rewrite>` on a long note would
 * otherwise allocate a table quadratic in its length and lock the tab up; past this
 * the diff degrades to "all of it changed", which is honest for a rewrite that big.
 */
const MAX_CELLS = 4_000_000;

/** Splits for diffing. A trailing newline would otherwise show up as a phantom empty line. */
const toLines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/**
 * Longest-common-subsequence line diff, oldest-first.
 *
 * Deletions are emitted before insertions at each divergence, so a card reads as
 * "this became that" top to bottom.
 */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = toLines(before);
  const b = toLines(after);

  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ type: "del" as const, text })), ...b.map((text) => ({ type: "add" as const, text }))];
  }

  // lcs[i][j] = length of the LCS of a[i…] and b[j…], as one flat row-major table.
  const width = b.length + 1;
  const lcs = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      rows.push({ type: "del", text: a[i] });
      i++;
    } else {
      rows.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < a.length) rows.push({ type: "del", text: a[i++] });
  while (j < b.length) rows.push({ type: "add", text: b[j++] });
  return rows;
}

/**
 * Folds long runs of unchanged lines, keeping `context` of them on each side of every
 * change. A whole-note rewrite is otherwise a card you have to scroll to find the two
 * lines that moved.
 */
export function collapseUnchanged(rows: DiffRow[], context = 2): (DiffRow | DiffGap)[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.type === "same") return;
    for (let i = Math.max(0, index - context); i <= Math.min(rows.length - 1, index + context); i++) keep[i] = true;
  });

  const out: (DiffRow | DiffGap)[] = [];
  let hidden = 0;
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (hidden > 0) {
        out.push({ type: "gap", hidden });
        hidden = 0;
      }
      out.push(row);
    } else {
      hidden++;
    }
  });
  if (hidden > 0) out.push({ type: "gap", hidden });
  return out;
}
