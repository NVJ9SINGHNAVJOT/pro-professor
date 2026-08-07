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
  NetworkIcon,
  SigmaIcon,
  TableIcon,
  TextQuoteIcon,
  WaypointsIcon,
  WorkflowIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GraphRenderer, NoteViewMode } from "@/modules/notes/types";

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

/** Left padding reserved for the editor's gutter, on both the textarea and its mirror. */
export const EDITOR_GUTTER = "3.25rem";

/** Typography the textarea and its mirror MUST share — any divergence desyncs the line boxes. */
export const EDITOR_TEXT_STYLE = "p-4 font-mono text-[13px] leading-relaxed";

/**
 * Room a problem tooltip needs below a line before it flips above it. Approximate — a few px of
 * slack beats measuring, which would need a render to measure and a second to place.
 */
export const TOOLTIP_CLEARANCE = 96;

/** Matches the problem tooltip's max-w-80, for keeping it off the right edge. */
export const TOOLTIP_MAX_WIDTH = 320;

/** Gap between the caret's line and the slash menu, whichever side it lands on (px). */
export const CARET_GAP = 4;

/** Keeps the slash menu off the pane's edges when the caret sits near them (px). */
export const EDGE_MARGIN = 8;

/** Right rail width: where it opens, and the bounds the drag handle clamps to (px). */
export const RAIL_DEFAULT_WIDTH = 320;
export const RAIL_MIN_WIDTH = 260;
export const RAIL_MAX_WIDTH = 720;

/** Proposal review block height: where it opens and how far its drag handle may shrink it (px). */
export const PROPOSAL_DEFAULT_HEIGHT = 256;
export const PROPOSAL_MIN_HEIGHT = 96;
/**
 * Room the proposal block leaves for the rest of the tab when dragged to its tallest (px) — the
 * composer plus a sliver of thread. Without it the drag could swallow its own send button.
 */
export const PROPOSAL_RESERVED_HEIGHT = 168;

/** Delay before scrolling the preview to a heading, so it re-renders first (ms). */
export const HEADING_SCROLL_DELAY_MS = 150;

/** How long one pane keeps ownership of a split-view scroll before the other may drive again (ms). */
export const SCROLL_SYNC_RELEASE_MS = 120;

/** Suffix marking a `![[name.diagram]]` embed target as a diagram rather than a note/image. */
export const DIAGRAM_SUFFIX = ".diagram";

/** Starter diagram; the numbered edges are the house notation (skills/pro-professor-notes/SKILL.md). */
export const MERMAID_TEMPLATE =
  "\n```mermaid\nflowchart TD\n  A[Start] -->|1| B{Branch?}\n  B -->|2a| C[Yes]\n  B -->|2b| D[No]\n  C -->|3| E[Done]\n  D -->|3| E\n```\n";

export const VIEW_MODES: { mode: NoteViewMode; label: string; icon: typeof CodeIcon }[] = [
  { mode: "source", label: "Source only", icon: CodeIcon },
  { mode: "split", label: "Split view", icon: ColumnsIcon },
  { mode: "preview", label: "Preview only", icon: EyeIcon },
];

/* ── Graph view ─────────────────────────────────────────────────────────────────────────────── */

/** The graph view's two renderers, driving the header's segmented control (twin of VIEW_MODES). */
export const GRAPH_RENDERERS: { renderer: GraphRenderer; label: string; icon: typeof CodeIcon }[] = [
  { renderer: "interactive", label: "Interactive graph", icon: NetworkIcon },
  { renderer: "mermaid", label: "Hierarchy (Mermaid)", icon: WorkflowIcon },
];

/**
 * Force tuning. `forceLink.strength` is deliberately left at d3's default (`1/min(degree)`) — it is
 * degree-aware, so a hub doesn't get yanked apart by its own links, and no constant beats it.
 */
export const GRAPH_LINK_DISTANCE = 60;
/**
 * Extra link length per unit of √degree at the busier end. A hub with forty spokes needs a far
 * bigger radius than a pair of notes needs a gap: at a flat distance its children land on a ring
 * with a few pixels each and collapse into an unreadable knot.
 */
export const GRAPH_LINK_DISTANCE_PER_DEGREE = 16;
export const GRAPH_CHARGE = -260;
/**
 * Repulsion range cap. Without it every node pushes every other one however far apart they are, so
 * distant clusters shove each other around the canvas — and it is what keeps the Barnes–Hut
 * approximation cheap on a large network.
 */
export const GRAPH_CHARGE_MAX = 900;
export const GRAPH_COLLIDE_PADDING = 4;
/**
 * Pull toward the world origin, as `forceX`/`forceY` rather than `forceCenter`. `forceCenter`
 * re-centres by *translating every node* each tick, which fights pinned nodes and silently moves
 * the whole world out from under a persisted camera — a reload would restore a viewport aimed at
 * nothing. Gravity keeps world coordinates stable, and still reels in disconnected notes, which
 * charge alone would send to infinity.
 */
export const GRAPH_GRAVITY = 0.03;

/** Alpha to re-energise the layout with: a settled graph nudged by an edit, and during a drag. */
export const GRAPH_WARM_ALPHA = 0.15;
export const GRAPH_DRAG_ALPHA = 0.3;
/** Spread for a node with no position to inherit — see `seedPositions`. */
export const GRAPH_SEED_JITTER = 60;

export const GRAPH_MIN_ZOOM = 0.08;
export const GRAPH_MAX_ZOOM = 8;
export const GRAPH_ZOOM_STEP = 1.4;
/** Wheel delta → zoom factor, as `exp(-dy * this)`, so zooming is smooth and multiplicative. */
export const GRAPH_ZOOM_SENSITIVITY = 0.002;
/** Padding around the bounding box when fitting the graph to the viewport (px). */
export const GRAPH_FIT_PADDING = 60;
/**
 * Ceiling on how far *fitting* may zoom in. Framing a two-node local graph would otherwise fill the
 * pane with two enormous circles; the wheel still goes all the way to `GRAPH_MAX_ZOOM` by hand.
 */
export const GRAPH_FIT_MAX_ZOOM = 1.5;

export const GRAPH_NODE_MIN_RADIUS = 4;
export const GRAPH_NODE_MAX_RADIUS = 14;
/** Extra screen-space slop around a node, so a small dot is still easy to grab at any zoom. */
export const GRAPH_HOVER_SLOP = 6;
/** Total pointer travel below which a press counts as a click rather than a drag (px). */
export const GRAPH_CLICK_SLOP_PX = 4;

/** How far unhighlighted nodes fade while a node is hovered. */
export const GRAPH_DIM_ALPHA = 0.15;
/** Per-frame easing steps — ~150ms for a filter cross-fade, ~120ms for the hover spotlight. */
export const GRAPH_FADE_STEP = 0.15;
export const GRAPH_DIM_STEP = 0.2;
/** Camera flight to a filtered subgraph, in frames (~300ms). */
export const GRAPH_TWEEN_FRAMES = 18;

/** Labels are unreadable below this zoom, so they're drawn only above it (or when highlighted). */
export const GRAPH_LABEL_MIN_ZOOM = 0.55;
export const GRAPH_LABEL_MAX_CHARS = 28;
export const GRAPH_LOCAL_DEPTH_MAX = 3;

/**
 * Node colours. Canvas takes `fillStyle` strings, so Tailwind classes can't reach it — this is the
 * same forced JS-side palette as `mermaid.initialize({ theme: "dark" })` and `<Excalidraw theme="dark">`.
 * Picked from Tailwind's 400 ramp so they sit with the `amber-400` already used elsewhere, and
 * assigned by a hash of the tag (see `tagColor`) so a tag keeps its colour without being persisted.
 * `GraphFilterPanel`'s legend swatches read this same array — one source of truth for canvas and DOM.
 */
export const GRAPH_TAG_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#4ade80",
  "#fbbf24",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
  "#a3e635",
];
/** Untagged notes — neutral-500. */
export const GRAPH_NODE_COLOR = "#737373";
/** An unresolved `[[target]]`: dimmer, and drawn as a dashed ring rather than a filled dot. */
export const GRAPH_MISSING_COLOR = "#525252";
export const GRAPH_EDGE_COLOR = "#404040";
export const GRAPH_ACCENT_COLOR = "#ffffff";
export const GRAPH_LABEL_COLOR = "#d4d4d4";
export const GRAPH_LABEL_FONT = "11px Inter, sans-serif";

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
