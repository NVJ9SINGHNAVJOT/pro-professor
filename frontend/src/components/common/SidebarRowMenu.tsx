import { useState, type ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { SidebarRowAction } from "@/components/common/sidebar";

interface SidebarRowMenuProps {
  /** Named for screen readers: "Actions for My Diagram". */
  label: string;
  actions: SidebarRowAction[];
  /** Suppresses the menu while the row is in another mode — a folder being renamed inline. */
  disabled?: boolean;
  /** The row this menu belongs to. Right-clicking anywhere on it opens the menu. */
  children: ReactNode;
}

/**
 * A sidebar row's actions, on right-click.
 *
 * Wraps the row rather than sitting beside it: with no `⋯` button there is nothing to reveal on
 * hover, nothing to reserve a lane for, and no button nested inside the row's own link — the whole
 * row is the target. See `sidebar.ts` for the layout contract.
 */
const SidebarRowMenu = ({ label, actions, disabled, children }: SidebarRowMenuProps) => {
  /**
   * Counts right-clicks, purely to key the content below.
   *
   * Radix keeps the click point in a *ref* behind a fixed virtual anchor, so a content element that
   * is still mounted from the last open — its exit animation outlives the reopen — is never
   * re-measured, and the menu reappears at the previous cursor position. Remounting it per
   * right-click forces Popper to read the point that was just recorded.
   */
  const [opens, setOpens] = useState(0);

  return (
    // Non-modal so a right-click on another row is not swallowed by the blocker a modal menu lays
    // over the page: the open menu dismisses and the row under the cursor opens its own, in one
    // gesture, the way a file explorer behaves.
    <ContextMenu modal={false}>
      {/* `asChild` so the row stays the element it already is — a link, a button, a draggable div —
          instead of gaining a wrapper that would break the list's layout. */}
      <ContextMenuTrigger asChild disabled={disabled} onContextMenu={() => setOpens((n) => n + 1)}>
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent key={opens} aria-label={`Actions for ${label}`} className="w-auto min-w-40">
        {actions.map((action) => (
          <ContextMenuItem
            key={action.label}
            variant={action.destructive === true ? "destructive" : "default"}
            onSelect={() => action.onSelect()}
            className="cursor-pointer px-2 py-1.5 para-small-medium"
          >
            <action.icon className="size-4" />
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default SidebarRowMenu;
