import type { ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

interface NodeShellProps {
  icon: ReactNode;
  label: string;
  selected?: boolean;
  /** Per-type accent classes for the icon (e.g. "text-sky-400"). */
  iconClassName?: string;
}

/** Shared chrome for all registered node types: card, icon, label, left/right handles. */
const NodeShell = ({ icon, label, selected, iconClassName }: NodeShellProps) => (
  <div
    className={cn(
      "flex h-full min-w-36 items-center gap-2 rounded-xl border bg-neutral-900/90 px-3 py-2 shadow-sm",
      selected ? "border-sky-500" : "border-neutral-700",
    )}
  >
    <Handle type="target" position={Position.Left} className="!bg-neutral-500" />
    <span className={cn("shrink-0", iconClassName)}>{icon}</span>
    <span className="caption-small-medium truncate text-neutral-200">{label}</span>
    <Handle type="source" position={Position.Right} className="!bg-neutral-500" />
  </div>
);

export default NodeShell;
