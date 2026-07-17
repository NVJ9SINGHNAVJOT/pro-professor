import type { OutlineItem } from "@/modules/notes/types";

const FRONTMATTER_BLOCK = /^---\s*\n[\s\S]*?\n---\s*\n?/;

/** Removes the leading YAML frontmatter block — the preview renders only the body. */
export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_BLOCK, "");
}

const FENCED_CODE = /^(```|~~~)[\s\S]*?^\1\s*$/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const WIKI_REF = /!?\[\[([^[\]|#]+)[^[\]]*\]\]/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** True when a wiki-embed target is an image file rather than a note title. */
export function isImageTarget(target: string): boolean {
  return IMAGE_EXT.test(target);
}

/** Unique outbound wiki-link/embed targets (outside code, matching the backend LinkParser). */
export function extractWikiRefs(content: string): string[] {
  const text = stripFrontmatter(content).replace(FENCED_CODE, "").replace(INLINE_CODE, "");
  const targets: string[] = [];
  for (const match of text.matchAll(WIKI_REF)) {
    const target = match[1].trim();
    if (target && !isImageTarget(target) && !targets.some((t) => t.toLowerCase() === target.toLowerCase())) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * Extracts one heading's section for `![[Note#Heading]]` transclusion: from the
 * matching heading (case-insensitive) until the next heading of the same or a
 * higher level. Falls back to the full body when the heading isn't found.
 */
export function extractSection(body: string, heading: string): string {
  const lines = body.split("\n");
  const wanted = heading.trim().toLowerCase();
  let start = -1;
  let depth = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
    if (!match) continue;
    if (start === -1) {
      if (match[2].trim().toLowerCase() === wanted) {
        start = i;
        depth = match[1].length;
      }
    } else if (match[1].length <= depth) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? body : lines.slice(start).join("\n");
}

/** Extracts the note's headings (outside fenced code blocks) for the outline panel. */
export function extractOutline(content: string): OutlineItem[] {
  const outline: OutlineItem[] = [];
  let inFence = false;
  for (const line of stripFrontmatter(content).split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) outline.push({ depth: match[1].length, text: match[2].trim() });
  }
  return outline;
}
