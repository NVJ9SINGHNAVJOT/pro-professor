/* ── The note-edit protocol ───────────────────────────────────────────────────
 * The model answers in ordinary prose and, when a change is warranted, emits one
 * or more delimited blocks. This file is the only thing that knows the wire
 * format: it turns a reply — possibly still streaming, possibly cut off — into an
 * ordered list of segments the panel renders in place.
 *
 * Tags rather than Aider-style `<<<<<<< SEARCH` / `=======` markers because notes
 * are Markdown, where `=======` and `-------` are setext heading underlines and
 * `---` opens frontmatter. `<transcript>…</transcript>` on the chat side is the
 * same idiom.
 */

/** One proposed change. `replace` is the surgical case; the other two are its endpoints. */
export type NoteEdit =
  | { op: "replace"; find: string; replace: string }
  | { op: "append"; text: string }
  | { op: "rewrite"; text: string };

/**
 * A reply, in the order the model wrote it — so a card renders exactly where its
 * explanation left off. `pending` is a block the model has opened but not finished:
 * it keeps the raw tags out of the thread while the reply streams, and if the stream
 * ends there it stays a placeholder rather than becoming something acceptable.
 */
export type ReplySegment =
  | { kind: "prose"; text: string }
  | { kind: "edit"; edit: NoteEdit }
  | { kind: "pending" };

/**
 * Tags that begin a block. `<find>` is here because models routinely drop the `<edit>` wrapper and
 * emit the pair on its own — observed on the first real run against an 8B model — and a bare pair
 * is unambiguous enough to honour rather than throw away.
 */
const OPENERS = ["<edit>", "<find>", "<append>", "<rewrite>"] as const;

/** The wrapper tags — what an `<edit>` body may not run past. `<find>` belongs *inside* one. */
const BLOCK_OPENERS = ["<edit>", "<append>", "<rewrite>"] as const;

/**
 * Strips the one newline that follows an opening tag and the one that precedes a
 * closing tag, because the model writes tags on their own lines. Nothing else is
 * trimmed — leading whitespace is indentation, and indentation is load-bearing in
 * Markdown lists and fences.
 */
const unwrap = (raw: string) => raw.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");

/** The earliest of `tags` at or after `from`, or null. */
function nextOpener<T extends string>(reply: string, from: number, tags: readonly T[]): { at: number; tag: T } | null {
  let best: { at: number; tag: T } | null = null;
  for (const tag of tags) {
    const at = reply.indexOf(tag, from);
    if (at !== -1 && (best === null || at < best.at)) best = { at, tag };
  }
  return best;
}

/** Pushes `text` as a prose segment unless it is only whitespace. */
function pushProse(segments: ReplySegment[], text: string) {
  if (text.trim() !== "") segments.push({ kind: "prose", text });
}

/**
 * Reads a `<find>`/`<replace>` pair starting at `from`, and reports where it ended so the scan can
 * resume past it. Null when either half hasn't arrived yet.
 */
function readReplace(reply: string, from: number, limit: number): { edit: NoteEdit; end: number } | null {
  const body = reply.slice(from, limit);
  const find = /<find>([\s\S]*?)<\/find>/.exec(body);
  const replace = /<replace>([\s\S]*?)<\/replace>/.exec(body);
  if (!find || !replace) return null;
  return {
    edit: { op: "replace", find: unwrap(find[1]), replace: unwrap(replace[1]) },
    end: from + replace.index + replace[0].length,
  };
}

/** Steps past a closing tag sitting immediately after `from`, ignoring whitespace between. */
function skipCloser(reply: string, from: number, tag: string): number {
  const rest = reply.slice(from);
  const match = new RegExp(`^\\s*${tag}`).exec(rest);
  return match === null ? from : from + match[0].length;
}

/**
 * Splits a reply into prose and proposed edits.
 *
 * Called on every streamed token, so it stays a single forward scan with no backtracking — the
 * panel memoizes it per message.
 *
 * Forgiving by design, because the reply is the output of a small local model: a malformed block
 * that is nonetheless *finished* is dropped and the scan carries on, and only an unfinished one
 * stops it. Anything that can't be read is simply never offered as an edit — the note is never at
 * risk from a parse, only from an accepted card.
 */
export function parseNoteEdits(reply: string): ReplySegment[] {
  const segments: ReplySegment[] = [];
  let cursor = 0;

  for (;;) {
    const opener = nextOpener(reply, cursor, OPENERS);
    if (opener === null) {
      pushProse(segments, reply.slice(cursor));
      return segments;
    }
    pushProse(segments, reply.slice(cursor, opener.at));
    const bodyStart = opener.at + opener.tag.length;

    // A bare pair the model emitted without its wrapper. Consume any stray `</edit>` after it, so a
    // half-written wrapper doesn't leave a closing tag sitting in the prose.
    if (opener.tag === "<find>") {
      const pair = readReplace(reply, opener.at, reply.length);
      if (pair === null) {
        segments.push({ kind: "pending" });
        return segments;
      }
      segments.push({ kind: "edit", edit: pair.edit });
      cursor = skipCloser(reply, pair.end, "</edit>");
      continue;
    }

    if (opener.tag === "<edit>") {
      // The body stops at the next *wrapper*, so a forgotten `</edit>` can't swallow the rest.
      const closer = reply.indexOf("</edit>", bodyStart);
      const following = nextOpener(reply, bodyStart, BLOCK_OPENERS);
      const closed = closer !== -1 && (following === null || closer < following.at);
      const limit = Math.min(closer === -1 ? reply.length : closer, following === null ? reply.length : following.at);
      const pair = readReplace(reply, bodyStart, limit);
      if (pair !== null) {
        segments.push({ kind: "edit", edit: pair.edit });
        cursor = closed ? closer + "</edit>".length : pair.end;
        continue;
      }
      // Closed but unreadable — the model wrote a block that says nothing (it has been seen echoing
      // the instructions' own placeholder). Drop it and keep scanning; there may be a real one after.
      if (closed) {
        cursor = closer + "</edit>".length;
        continue;
      }
      segments.push({ kind: "pending" });
      return segments;
    }

    const tagName = opener.tag === "<append>" ? "append" : "rewrite";
    const closer = reply.indexOf(`</${tagName}>`, bodyStart);
    if (closer === -1) {
      segments.push({ kind: "pending" });
      return segments;
    }
    segments.push({ kind: "edit", edit: { op: tagName, text: unwrap(reply.slice(bodyStart, closer)) } });
    cursor = closer + `</${tagName}>`.length;
  }
}

/** The edits in a reply, in order — what "Accept all" walks and what the ordinals index. */
export const editsOf = (segments: ReplySegment[]): NoteEdit[] =>
  segments.flatMap((segment) => (segment.kind === "edit" ? [segment.edit] : []));

/**
 * The reply with its blocks removed — what the per-message apply menu writes into the note.
 * Inserting the raw `content` there would paste the tags in with it.
 */
export const proseOf = (segments: ReplySegment[]): string =>
  segments
    .flatMap((segment) => (segment.kind === "prose" ? [segment.text.trim()] : []))
    .join("\n\n")
    .trim();
