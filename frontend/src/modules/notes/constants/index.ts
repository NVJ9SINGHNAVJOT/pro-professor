import { CodeIcon, ColumnsIcon, EyeIcon } from "lucide-react";
import type { NoteViewMode } from "@/modules/notes/types";

/** Leading YAML frontmatter block — the preview renders only the body. */
export const FRONTMATTER_BLOCK = /^---\s*\n[\s\S]*?\n---\s*\n?/;

export const FENCED_CODE = /^(```|~~~)[\s\S]*?^\1\s*$/gm;
export const INLINE_CODE = /`[^`\n]*`/g;

/** `[[Target]]` / `![[Target]]`, matching the backend LinkParser. */
export const WIKI_REF = /!?\[\[([^[\]|#]+)[^[\]]*\]\]/g;

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** A Markdown ATX heading line (`#` through `######`). */
export const HEADING_LINE = /^(#{1,6})\s+(.+)$/;

/** Outline panel indentation per heading depth (px). */
export const OUTLINE_INDENT_PX = 12;

/** Debounce before firing the server keyword search (ms). */
export const SEARCH_DEBOUNCE_MS = 250;

/** Delay before scrolling the preview to a heading, so it re-renders first (ms). */
export const HEADING_SCROLL_DELAY_MS = 150;

/** Suffix marking a `![[name.diagram]]` embed target as a diagram rather than a note/image. */
export const DIAGRAM_SUFFIX = ".diagram";

export const MERMAID_TEMPLATE = "\n```mermaid\ngraph TD\n  A[Start] --> B[Next]\n```\n";
export const REACTFLOW_TEMPLATE =
  '\n```reactflow-json\n{\n  "nodes": [\n    { "id": "a", "label": "Start", "position": { "x": 0, "y": 0 } },\n    { "id": "b", "label": "Next", "position": { "x": 200, "y": 100 } }\n  ],\n  "edges": [{ "source": "a", "target": "b" }]\n}\n```\n';

export const VIEW_MODES: { mode: NoteViewMode; label: string; icon: typeof CodeIcon }[] = [
  { mode: "source", label: "Source only", icon: CodeIcon },
  { mode: "split", label: "Split view", icon: ColumnsIcon },
  { mode: "preview", label: "Preview only", icon: EyeIcon },
];
