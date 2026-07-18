import { ReactFlow, Background, Controls } from "@xyflow/react";
import type { Edge, Node, OnMoveEnd, OnNodesChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "@/modules/diagram/nodes/registry";
import { edgeTypes } from "@/modules/diagram/edges/registry";
import { cn } from "@/lib/utils";

interface DiagramRendererProps {
  nodes: Node[];
  edges: Edge[];
  /**
   * Ephemeral mode (fence embeds): RF owns the state uncontrolled, so nodes can
   * be dragged to untangle but nothing is ever committed anywhere.
   * Controlled mode (canvas): the domain owns the state via props + handlers.
   */
  ephemeral?: boolean;
  onNodesChange?: OnNodesChange;
  onMoveEnd?: OnMoveEnd;
  className?: string;
}

/**
 * The ONLY React Flow mount in the app. Every diagram — fence embed, wiki
 * embed, editor canvas — renders through here so RF can never become a second
 * source of truth. Import lazily; this module carries the RF runtime + styles.
 */
const DiagramRenderer = ({ nodes, edges, ephemeral, onNodesChange, onMoveEnd, className }: DiagramRendererProps) => {
  const interactive = onNodesChange !== undefined;
  return (
    <span className={cn("block h-96 overflow-hidden rounded-xl border border-neutral-800", className)}>
      <ReactFlow
        {...(ephemeral
          ? { defaultNodes: nodes, defaultEdges: edges }
          : {
              nodes,
              edges,
              onNodesChange,
              onMoveEnd,
              nodesDraggable: interactive,
              elementsSelectable: interactive,
              nodesConnectable: false,
              snapToGrid: interactive,
              snapGrid: [16, 16] as [number, number],
              // deletion must go through command thunks, never RF's built-in key handling
              deleteKeyCode: null,
            })}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </span>
  );
};

export default DiagramRenderer;
