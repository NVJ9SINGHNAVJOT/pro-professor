import {
  CodeIcon,
  ColumnsIcon,
  EyeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MegaphoneIcon,
  MinusIcon,
  SigmaIcon,
  TableIcon,
  TextQuoteIcon,
  WaypointsIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NoteViewMode } from "@/modules/notes/types";

/** Leading YAML frontmatter block — the preview renders only the body. */
export const FRONTMATTER_BLOCK = /^---\s*\n[\s\S]*?\n---\s*\n?/;

/**
 * Cap on the note text a chat turn carries. Trimming is the client's job — it is the side that
 * knows whether a selection is in play — and one local model's context window has to hold this
 * plus the whole thread.
 */
export const NOTE_CONTEXT_MAX_CHARS = 12000;

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

export const VIEW_MODES: { mode: NoteViewMode; label: string; icon: typeof CodeIcon }[] = [
  { mode: "source", label: "Source only", icon: CodeIcon },
  { mode: "split", label: "Split view", icon: ColumnsIcon },
  { mode: "preview", label: "Preview only", icon: EyeIcon },
];

/** One slash-menu block: `snippet` replaces the typed `/query`; `‸` marks the caret. */
export interface SlashCommand {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  snippet: string;
}

export const TABLE_TEMPLATE = "| Column | Column |\n| --- | --- |\n| ‸ |  |\n";

/** Blocks offered when `/` is typed at the start of a line (see SlashMenu). */
export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", label: "Heading 1", hint: "#", icon: Heading1Icon, snippet: "# " },
  { id: "h2", label: "Heading 2", hint: "##", icon: Heading2Icon, snippet: "## " },
  { id: "h3", label: "Heading 3", hint: "###", icon: Heading3Icon, snippet: "### " },
  { id: "h4", label: "Heading 4", hint: "####", icon: Heading4Icon, snippet: "#### " },
  { id: "bullet", label: "Bullet list", hint: "-", icon: ListIcon, snippet: "- " },
  { id: "numbered", label: "Numbered list", hint: "1.", icon: ListOrderedIcon, snippet: "1. " },
  { id: "task", label: "Task list", hint: "- [ ]", icon: ListTodoIcon, snippet: "- [ ] " },
  { id: "quote", label: "Quote", hint: ">", icon: TextQuoteIcon, snippet: "> " },
  { id: "callout", label: "Callout", hint: "> [!note]", icon: MegaphoneIcon, snippet: "> [!note] ‸\n> " },
  { id: "table", label: "Table", hint: "| |", icon: TableIcon, snippet: TABLE_TEMPLATE },
  { id: "divider", label: "Divider", hint: "---", icon: MinusIcon, snippet: "---\n" },
  { id: "wikilink", label: "Wiki link", hint: "[[…]]", icon: LinkIcon, snippet: "[[‸]]" },
  { id: "embed", label: "Embed note / image", hint: "![[…]]", icon: ImageIcon, snippet: "![[‸]]" },
  { id: "math", label: "Math block", hint: "$$", icon: SigmaIcon, snippet: "$$\n‸\n$$\n" },
  { id: "code", label: "Code block", hint: "```", icon: CodeIcon, snippet: "```\n‸\n```\n" },
  {
    id: "mermaid",
    label: "Mermaid diagram",
    hint: "```mermaid",
    icon: WaypointsIcon,
    snippet: MERMAID_TEMPLATE.trimStart(),
  },
];
