import { EdgeLabelRenderer } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

interface EdgeLabelProps {
  label: EdgeProps["label"];
  x: number;
  y: number;
}

/** Shared floating label for custom edges, centered on the path midpoint. */
const EdgeLabel = ({ label, x, y }: EdgeLabelProps) => {
  if (!label) return null;
  return (
    <EdgeLabelRenderer>
      <span
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        className="nodrag nopan caption-small-regular absolute rounded-md bg-neutral-900/90 px-1.5 py-0.5 text-neutral-400"
      >
        {label}
      </span>
    </EdgeLabelRenderer>
  );
};

export default EdgeLabel;
