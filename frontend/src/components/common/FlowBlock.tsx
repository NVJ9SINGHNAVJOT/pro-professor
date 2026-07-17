import { lazy, Suspense, useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";

const FlowDiagram = lazy(() => import("@/components/common/FlowDiagram"));

/* Tolerant input shape for a ```reactflow-json fence — an LLM/user writes:
 * { "nodes": [{ "id": "a", "label": "Start", "position": {"x": 0, "y": 0} }],
 *   "edges": [{ "source": "a", "target": "b", "label": "next" }] } */
interface RawNode {
  id: string;
  label?: string;
  position?: { x: number; y: number };
  data?: { label?: string };
}

interface RawEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

const parseDefinition = (code: string): { nodes: Node[]; edges: Edge[] } | null => {
  try {
    const raw = JSON.parse(code) as { nodes?: RawNode[]; edges?: RawEdge[] };
    if (!Array.isArray(raw.nodes)) return null;
    const nodes: Node[] = raw.nodes.map((node, index) => ({
      id: String(node.id),
      // fall back to a simple grid so definitions without coordinates still render
      position: node.position ?? { x: (index % 4) * 200, y: Math.floor(index / 4) * 120 },
      data: { label: node.data?.label ?? node.label ?? String(node.id) },
    }));
    const edges: Edge[] = (raw.edges ?? []).map((edge, index) => ({
      id: edge.id ?? `e${index}-${edge.source}-${edge.target}`,
      source: String(edge.source),
      target: String(edge.target),
      label: edge.label,
    }));
    return { nodes, edges };
  } catch {
    return null;
  }
};

/**
 * Renders a ```reactflow-json fenced block as a draggable node diagram.
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
      <FlowDiagram nodes={parsed.nodes} edges={parsed.edges} />
    </Suspense>
  );
};

export default FlowBlock;
