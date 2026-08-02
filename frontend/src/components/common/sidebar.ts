import type { ClassValue } from "clsx";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── The left sidebar's shared language ───────────────────────────────────────
 * Chat history, the note explorer, the diagram tree and settings are four
 * different sidebars that should feel like one panel. They don't share a
 * component — one collapses, one nests, one is a fixed list — so what is shared
 * is the *look*: these tokens, plus `SidebarRowMenu` / `SidebarSection` /
 * `MainNavbar` (components, so their own files — a module that mixes components
 * with constants breaks Fast Refresh).
 *
 * Layout contract: `sidebarShell` + `sidebarShellInner` for a collapsing
 * sidebar, `MainNavbar` as its first child, `sidebarNavRow()` for the fixed
 * controls above the list, then `SIDEBAR_LIST` around rows that each get
 * `SIDEBAR_ROW_WRAPPER` + `sidebarRow()` — wrapped in `<SidebarRowMenu>` if the
 * row has actions, which open on right-click, so the row itself is the target
 * and nothing is reserved or revealed on hover for them.
 */

/* ── Shell ────────────────────────────────────────────────────────────────── */

/** Every sidebar is exactly this wide — the collapse animation measures against it. */
export const SIDEBAR_WIDTH = "w-67.5";

/** The sidebar surface: full height, its own overflow, the app's sidebar fill. */
export const SIDEBAR_SURFACE = "h-full shrink-0 overflow-hidden bg-chat-sidebar text-white";

/** The stack inside a sidebar — the `MainNavbar` header band, then its sections. */
export const SIDEBAR_STACK = "flex flex-col gap-y-2";

/**
 * The collapsing sidebar's outer element (chat / notes / diagrams), which animates its width to
 * zero. Its child is `sidebarShellInner`, which keeps the full width and fades instead — with the
 * width on one element only, the content would reflow as the pane closes rather than slide out.
 *
 * Settings doesn't collapse: it is one element, `cn(SIDEBAR_SURFACE, SIDEBAR_STACK, SIDEBAR_WIDTH)`.
 */
export const sidebarShell = (isOpen: boolean, className?: ClassValue) =>
  cn(SIDEBAR_SURFACE, "transition-all duration-300 ease-in-out", isOpen ? SIDEBAR_WIDTH : "w-0", className);

/** The inner half of `sidebarShell` — holds its width while the outer one closes, and fades. */
export const sidebarShellInner = (isOpen: boolean, className?: ClassValue) =>
  cn(
    SIDEBAR_STACK,
    SIDEBAR_WIDTH,
    "h-full transition-opacity duration-300",
    isOpen ? "opacity-100" : "opacity-0",
    className,
  );

/* ── Rows ─────────────────────────────────────────────────────────────────── */

/** Vertical rhythm for a list of rows — the gap that keeps hover states from merging. */
export const SIDEBAR_LIST = "flex flex-col gap-y-1";

/**
 * Holds an icon column open on rows that have no icon for it.
 *
 * Every row in a tree lays out as [disclosure][icon][label]. A folder fills both columns, a leaf
 * fills only the second, and a placeholder like "Empty" fills neither — without the blanks their
 * labels start at three different offsets inside one list.
 *
 * The slot is one line tall (`1lh`) rather than square: on an `items-start` row — a note with tag
 * chips stacked under its title — a 16px slot would pin the icon to the top of the row instead of
 * the middle of the title. An SVG's viewBox centers the 16px glyph inside the taller box for us, so
 * the icon lands on the title's optical center at any row height, and single-line rows are unchanged.
 */
export const SIDEBAR_ICON_SLOT = "h-[1lh] w-4 shrink-0";

/**
 * Nesting indent, applied as a **margin on the row's wrapper** rather than padding on the row.
 *
 * Padding would leave the row's box — and so its hover and drop fills — spanning the full sidebar
 * width, with the highlight bleeding across the empty indent to the left edge. As a margin, the
 * fill starts where the row visually starts.
 *
 * One level is exactly one icon column (`w-4` plus the row's `gap-x-2`), so a child's disclosure
 * chevron lands where its parent's icon sits and the levels read as a straight ladder.
 */
export const SIDEBAR_INDENT_PX = 24;
export const sidebarIndent = (depth: number) => depth * SIDEBAR_INDENT_PX;

/**
 * Scopes the row's hover state, which its inner chips read as `group-hover:`. It is also the
 * context-menu trigger, so `SidebarRowMenu` stamps `data-state="open"` here — see `sidebarRow`.
 */
export const SIDEBAR_ROW_WRAPPER = "group";

/** One row. */
export const sidebarRow = (isActive?: boolean, className?: ClassValue) =>
  cn(
    "flex w-full cursor-pointer items-center gap-x-2 rounded-lg px-2 py-1.5",
    "text-left para-small-medium text-neutral-300 transition-colors",
    "hover:bg-neutral-800/70 hover:text-white",
    // Holds the hover fill while this row's context menu is open, so it stays obvious which row the
    // menu is acting on once the pointer has moved off it and onto the menu.
    "group-data-[state=open]:bg-neutral-800/70 group-data-[state=open]:text-white",
    isActive && "bg-neutral-800 text-white",
    className,
  );

/**
 * A navigation row: the app menu's links, the settings sections, each sidebar's "New …" button.
 *
 * Roomier than `sidebarRow` and with a solid hover fill — there are only ever a handful of these,
 * fixed above the list, whereas rows are a long scannable column that has to stay dense. Like a row
 * it sits back at `text-neutral-300` until hovered or active; a "New …" button is its pane's one
 * primary action, so it opts up to `text-white`.
 */
export const sidebarNavRow = (isActive?: boolean, className?: ClassValue) =>
  cn(
    "flex cursor-pointer items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium text-neutral-300 transition-colors",
    "hover:bg-neutral-800 hover:text-white",
    isActive && "bg-neutral-800 text-white",
    className,
  );

export interface SidebarRowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Renders red — reserved for the one destructive action in a menu, listed last. */
  destructive?: boolean;
}
