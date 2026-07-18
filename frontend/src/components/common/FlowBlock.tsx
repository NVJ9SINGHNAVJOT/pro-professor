import { lazy, Suspense, useMemo } from "react";
import { toFlowEdges, toFlowNodes } from "@/modules/diagram/adapter/ReactFlowAdapter";
import { NODE_TYPES, type LayoutEntry, type NodeId, type SemEdge, type SemNode } from "@/modules/diagram/types";

const DiagramRenderer = lazy(() => import("@/modules/diagram/renderer/DiagramRenderer"));

/* Tolerant input shape for a ```reactflow-json fence — an LLM/user writes:
 * { "nodes": [{ "id": "a", "label": "Start", "position": {"x": 0, "y": 0} }],
 *   "edges": [{ "source": "a", "target": "b", "label": "next" }] } */
interface RawNode {
  id: string;
  label?: string;
  type?: string;
  position?: { x: number; y: number };
  data?: { label?: string };
}

interface RawEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

/**
 * Maps the tolerant fence JSON onto the diagram domain shape (semantic + layout),
 * so the fence renders through the same adapter/renderer as `.diagram` documents.
 * Unknown node types fall back to "service"; edges default to "curved" (the
 * bezier look the fence always had). w/h of 0 = "size auto" (see adapter).
 */
const parseDefinition = (code: string): { nodes: SemNode[]; edges: SemEdge[]; layout: Record<NodeId, LayoutEntry> } | null => {
  try {
    const raw = JSON.parse(code) as { nodes?: RawNode[]; edges?: RawEdge[] };
    if (!Array.isArray(raw.nodes)) return null;

    const layout: Record<NodeId, LayoutEntry> = {};
    const nodes: SemNode[] = raw.nodes.map((node) => {
      const id = String(node.id);
      if (node.position) layout[id] = { x: node.position.x, y: node.position.y, w: 0, h: 0 };
      return {
        id,
        type: node.type && NODE_TYPES.includes(node.type) ? node.type : "service",
        label: node.data?.label ?? node.label ?? id,
      };
    });
    const edges: SemEdge[] = (raw.edges ?? []).map((edge, index) => ({
      id: edge.id ?? `e${index}-${edge.source}-${edge.target}`,
      source: String(edge.source),
      target: String(edge.target),
      type: "curved",
      ...(edge.label !== undefined ? { label: edge.label } : {}),
    }));
    return { nodes, edges, layout };
  } catch {
    return null;
  }
};

/**
 * Renders a ```reactflow-json fenced block as a draggable (ephemeral) diagram.
 * Invalid JSON falls back to showing the raw source (same pattern as Mermaid).
 */
const FlowBlock = ({ code }: { code: string }) => {
  const parsed = useMemo(() => parseDefinition(code), [code]);

  if (!parsed) {
    return (
      <code className="block whitespace-pre-wrap rounded-xl border border-dashed border-neutral-700 p-3 caption-small-regular text-neutral-500">
        {code}
      </code>
    );
  }
  return (
    <Suspense
      fallback={<span className="block rounded-xl border border-neutral-800 p-3 caption-small-regular text-neutral-500">Loading diagram…</span>}
    >
      {/* ephemeral mode is uncontrolled (defaultNodes) — key by source so edits remount with fresh content */}
      <DiagramRenderer key={code} nodes={toFlowNodes(parsed.nodes, parsed.layout)} edges={toFlowEdges(parsed.edges)} ephemeral />
    </Suspense>
  );
};

export default FlowBlock;
