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
