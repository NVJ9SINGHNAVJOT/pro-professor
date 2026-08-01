/**
 * Syntax the Markdown renderer's remark transforms match on. Global rather than notes-module
 * constants because `Markdown` is a shared component — chat renders it too.
 */

/** `> [!type] Optional title` — the callout marker opening a blockquote. */
export const CALLOUT_MARKER = /^\[!(\w+)\][+-]?[ \t]*([^\n]*)\n?([\s\S]*)$/;

/** Splits a text node on `[[Target]]` / `![[Target]]`; the capture group keeps the refs in the parts. */
export const WIKI_SPLIT = /(!?\[\[[^[\]]+\]\])/;

/** Pulls the `!`, target and alias out of one such ref. */
export const WIKI_PARTS = /^(!?)\[\[([^[\]|]+?)(?:\|([^[\]]*))?\]\]$/;

/** Synthetic hrefs the wiki transform emits; the `a` override routes them to the host module. */
export const WIKI_LINK_PREFIX = "#wiki:";
export const WIKI_EMBED_PREFIX = "#wiki-embed:";
