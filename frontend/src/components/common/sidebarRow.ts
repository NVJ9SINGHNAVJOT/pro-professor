import type { ClassValue } from "clsx";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── The left sidebar's shared row language ───────────────────────────────────
 * Chat history, the note explorer and the diagram tree are three different lists
 * that should feel like one control. They don't share a row component — their
 * rows are a NavLink, a NavLink with tag chips, and a draggable tree node — so
 * what is shared is the *look* (these tokens) and the row's one piece of real
 * behavior (`SidebarRowMenu`, its own file so Fast Refresh keeps working).
 *
 * Layout contract: wrap each row in `SIDEBAR_ROW_WRAPPER`, give the clickable
 * element `sidebarRow()`, and wrap the whole row in `<SidebarRowMenu>` if it has
 * actions — they open on right-click, so the row itself is the target and
 * nothing is reserved or revealed on hover for them.
 */

/** Vertical rhythm for a list of rows — the gap that keeps hover states from merging. */
export const SIDEBAR_LIST = "flex flex-col gap-y-1";

/**
 * Holds an icon column open on rows that have no icon for it.
 *
 * Every row in a tree lays out as [disclosure][icon][label]. A folder fills both columns, a leaf
 * fills only the second, and a placeholder like "Empty" fills neither — without the blanks their
 * labels start at three different offsets inside one list.
 */
export const SIDEBAR_ICON_SLOT = "size-4 shrink-0";

/**
 * Nesting indent, applied as a **margin on the row's wrapper** rather than padding on the row.
 *
 * Padding would leave the row's box — and so its hover and drop fills — spanning the full sidebar
 * width, with the highlight bleeding across the empty indent to the left edge. As a margin, the
 * fill starts where the row visually starts.
 *
 * One level is exactly one icon column (`size-4` plus the row's `gap-x-2`), so a child's disclosure
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

export interface SidebarRowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Renders red — reserved for the one destructive action in a menu, listed last. */
  destructive?: boolean;
}
