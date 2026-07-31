import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarToggleProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Names the thing being collapsed, for the tooltip and screen readers. */
  label: string;
  className?: string;
}

/**
 * Collapse/expand control for a left sidebar.
 *
 * Belongs in the *main pane's* top bar, never inside the sidebar it controls — a button that
 * collapses with its own panel leaves no way back. One button both ways, as in the chat screen.
 */
const SidebarToggle = ({ isOpen, onToggle, label, className }: SidebarToggleProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={`${isOpen ? "Collapse" : "Expand"} ${label}`}
    title={`${isOpen ? "Collapse" : "Expand"} ${label}`}
    className={cn(
      "shrink-0 cursor-pointer rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white",
      className,
    )}
  >
    {isOpen ? <PanelLeftCloseIcon className="size-4.5" /> : <PanelLeftOpenIcon className="size-4.5" />}
  </button>
);

export default SidebarToggle;
