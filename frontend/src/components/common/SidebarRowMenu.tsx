import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SidebarRowAction } from "@/components/common/sidebarRow";
import { cn } from "@/lib/utils";

interface SidebarRowMenuProps {
  /** Named for screen readers: "Actions for My Diagram". */
  label: string;
  actions: SidebarRowAction[];
}

/**
 * The `⋯` overflow menu at the right edge of a sidebar row — the one place a row's actions live,
 * so rows stay quiet no matter how many actions they grow.
 *
 * Rendered as a **sibling** of the row, not a child: the row is already a link or a button, and a
 * button inside either is invalid HTML. See `sidebarRow.ts` for the layout contract.
 */
const SidebarRowMenu = ({ label, actions }: SidebarRowMenuProps) => (
  <DropdownMenu>
    {/* An inset flex column rather than `top-1/2 -translate-y-1/2`: it centres the trigger against
        rows of any height without a transform, which would put the icon on its own compositing
        layer and render it blurry. */}
    <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center">
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        // The row underneath navigates or expands on click; this button does neither.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "pointer-events-auto cursor-pointer rounded p-1",
          "text-neutral-400 hover:bg-neutral-700 hover:text-white",
          // Hidden until hover — but kept visible while open, or it would vanish the moment the
          // pointer left the row to reach it.
          //
          // Snapped, not faded: a *transitioning* opacity promotes the icon to its own layer,
          // which drops subpixel antialiasing and renders it visibly blurry mid-fade.
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
        )}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
    </div>

    {/* Opens beside the row, into the empty canvas, instead of over the list it belongs to. The
        sidebar is too narrow for a menu to drop below without burying the next few rows. */}
    <DropdownMenuContent side="right" align="start" className="w-auto min-w-40">
      {actions.map((action) => (
        <DropdownMenuItem
          key={action.label}
          variant={action.destructive === true ? "destructive" : "default"}
          onSelect={() => action.onSelect()}
          className="cursor-pointer px-2 py-1.5 para-small-medium"
        >
          <action.icon className="size-4" />
          {action.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default SidebarRowMenu;
