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
 * element `sidebarRow()`, and drop `<SidebarRowMenu>` in as a sibling — never a
 * child. The menu is a button; nesting it inside the row's own link or button
 * would be invalid HTML, so it is positioned over the row instead. That is what
 * the row's right padding reserves space for.
 */

/** Vertical rhythm for a list of rows — the gap that keeps hover states from merging. */
export const SIDEBAR_LIST = "flex flex-col gap-y-1";

/** Positions the absolutely-placed menu and drives its hover reveal. */
export const SIDEBAR_ROW_WRAPPER = "group relative";

/**
 * One row. `pr-8` reserves the overflow menu's lane so a long title truncates
 * instead of sliding under it; a row with no menu reclaims it with `pr-2`.
 */
export const sidebarRow = (isActive?: boolean, className?: ClassValue) =>
  cn(
    "flex w-full cursor-pointer items-center gap-x-2 rounded-lg py-1.5 pl-2 pr-8",
    "text-left para-small-medium text-neutral-300 transition-colors",
    "hover:bg-neutral-800/70 hover:text-white",
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
