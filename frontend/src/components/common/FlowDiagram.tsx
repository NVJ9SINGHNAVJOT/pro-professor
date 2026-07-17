import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface FlowDiagramProps {
  nodes: Node[];
  edges: Edge[];
}

/**
 * The actual React Flow canvas — split from {@link FlowBlock} so `@xyflow/react`
 * loads lazily (like Mermaid) and stays out of the main bundle. Nodes are
 * draggable; the diagram source is not mutated by dragging.
 */
const FlowDiagram = ({ nodes, edges }: FlowDiagramProps) => (
  <span className="block h-96 overflow-hidden rounded-xl border border-neutral-800">
    <ReactFlow defaultNodes={nodes} defaultEdges={edges} colorMode="dark" fitView proOptions={{ hideAttribution: true }}>
      <Background />
      <Controls />
    </ReactFlow>
  </span>
);

export default FlowDiagram;
