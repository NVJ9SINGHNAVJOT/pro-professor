/* ── Quoting mermaid labels that need it ─────────────────────────────────────
 * Mermaid's grammar uses (, [ and { to open node shapes, so it reads a bare one
 * inside a label as the start of a new node and the whole diagram fails — one
 * unquoted bracket anywhere kills every line. The fix is quoting the label:
 * B["Validate input (required fields)"].
 *
 * Models get this wrong constantly, and no amount of prompting has fixed it: an
 * 8B model given a worked example still emitted `-->|Commands (GET, SET)|`, and
 * when asked to repair that diagram it quoted a *different*, already-valid node.
 * So this repairs it mechanically instead.
 *
 * ⚠️ Only ever run this on a diagram that has ALREADY failed to parse, and always
 * re-parse the result before showing it. These are regexes over a grammar whose
 * delimiters are the very characters being quoted — `A[(Database)]` is a valid
 * cylinder, not a square node with parens in it — so the patterns below are
 * deliberately narrow and a re-parse is what makes a miss harmless.
 */

/** Characters that end a label token early unless the label is quoted. */
const NEEDS_QUOTING = /[()[\]{}#]/;

/** `-->|label|`, `-.->|label|`, `==>|label|` — the pipe pair is unambiguous. */
const EDGE_LABEL = /\|([^|\n]*)\|/g;

/**
 * `Id[label]` — but not the shape variants that open with a second bracket
 * (`[[subroutine]]`, `[(cylinder)]`, `[/parallelogram/]`, `[\trapezoid\]`), and not a
 * label already carrying a quote. Content may not contain a square bracket, so a
 * nested shape can never be swallowed.
 */
const SQUARE_LABEL = /(\w\s*)\[(?![[(/\\])([^[\]\n"]*)\]/g;

/** `Id{label}` — but not `{{hexagon}}`. */
const BRACE_LABEL = /(\w\s*)\{(?!\{)([^{}\n"]*)\}/g;

/** True when the text would end its label token early and isn't already quoted. */
const unquotedTrouble = (text: string) => NEEDS_QUOTING.test(text) && !text.includes('"');

/**
 * Wraps every label that needs quoting in double quotes, leaving everything else byte-identical.
 * Returns the source unchanged when there is nothing to fix, so callers can cheaply tell whether a
 * repair is even worth re-parsing.
 */
export function quoteMermaidLabels(source: string): string {
  return source
    .replace(EDGE_LABEL, (whole, label: string) => (unquotedTrouble(label) ? `|"${label.trim()}"|` : whole))
    .replace(SQUARE_LABEL, (whole, id: string, label: string) =>
      unquotedTrouble(label) ? `${id}["${label.trim()}"]` : whole,
    )
    .replace(BRACE_LABEL, (whole, id: string, label: string) =>
      unquotedTrouble(label) ? `${id}{"${label.trim()}"}` : whole,
    );
}
