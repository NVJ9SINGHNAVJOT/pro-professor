import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { PRO_FONT_FAMILY, PRO_ROUGHNESS } from "@/modules/diagram/persistence/bundleIO";
import type { DiagramCommand, NodeStyle, ShapeKind } from "@/modules/diagram/types";

/**
 * The bridge between Excalidraw's flat element scene and our logical graph.
 * A "node" is a shape element tagged `customData.nodeId`; an "edge" is an arrow
 * tagged `customData.edgeId` and bound to two node shapes. `readSemantics`
 * recovers that graph (for the AI prompt and for rebuilding), `applyCommands`
 * folds a command list onto it, and `buildSkeletons` turns it back into element
 * skeletons — `convertToExcalidrawElements` then re-synthesises arrow bindings.
 */

const SHAPE_TYPES: ReadonlySet<string> = new Set<ShapeKind>(["rectangle", "ellipse", "diamond"]);

/** The subset of Excalidraw element fields we read. */
interface SceneElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  containerId?: string | null;
  text?: string;
  boundElements?: readonly { id: string; type: string }[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  customData?: { nodeId?: string; edgeId?: string; label?: string } | null;
}

export interface SemNode {
  id: string;
  label: string;
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
}

export interface SemEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  dashed?: boolean;
  color?: string;
  arrow?: "none" | "end" | "both";
}

export interface Semantics {
  nodes: SemNode[];
  edges: SemEdge[];
}

/** The compact graph sent to the model (ids + labels it can reference). */
export interface SemanticSummary {
  nodes: { id: string; label: string; shape: ShapeKind }[];
  edges: { id: string; source: string; target: string; label?: string }[];
}

const isShape = (type: string): type is ShapeKind => SHAPE_TYPES.has(type);

/** Bound label text of a container/arrow, if any. */
function boundLabel(el: SceneElement, byId: Map<string, SceneElement>): string | undefined {
  for (const bound of el.boundElements ?? []) {
    if (bound.type === "text") return byId.get(bound.id)?.text;
  }
  return el.customData?.label;
}

/** Reads the logical graph out of a live Excalidraw element array. */
export function readSemantics(elements: readonly unknown[]): Semantics {
  const els = elements as readonly SceneElement[];
  const byId = new Map(els.map((el) => [el.id, el]));
  const nodeIdByElId = new Map<string, string>();

  const nodes: SemNode[] = [];
  for (const el of els) {
    const nodeId = el.customData?.nodeId;
    if (!nodeId || !isShape(el.type)) continue;
    nodeIdByElId.set(el.id, nodeId);
    nodes.push({
      id: nodeId,
      label: boundLabel(el, byId) ?? "",
      shape: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      strokeColor: el.strokeColor,
      backgroundColor: el.backgroundColor,
    });
  }

  const edges: SemEdge[] = [];
  for (const el of els) {
    const edgeId = el.customData?.edgeId;
    if (!edgeId || el.type !== "arrow") continue;
    const source = el.startBinding ? nodeIdByElId.get(el.startBinding.elementId) : undefined;
    const target = el.endBinding ? nodeIdByElId.get(el.endBinding.elementId) : undefined;
    if (!source || !target) continue;
    edges.push({ id: edgeId, source, target, label: boundLabel(el, byId) });
  }

  return { nodes, edges };
}

/** The prompt payload — positions and colours stripped. */
export function toSummary({ nodes, edges }: Semantics): SemanticSummary {
  return {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.label ? { label: e.label } : {}) })),
  };
}

function styleColors(style?: NodeStyle): Pick<SemNode, "strokeColor" | "backgroundColor"> {
  return {
    ...(style?.stroke ? { strokeColor: style.stroke } : {}),
    ...(style?.fill ? { backgroundColor: style.fill } : {}),
  };
}

type ApplyResult = { ok: true; semantics: Semantics; newNodeIds: string[] } | { ok: false; errors: string[] };

/** Folds a validated command list onto the graph (pure). One bad op rejects all. */
export function applyCommands(base: Semantics, ops: DiagramCommand[]): ApplyResult {
  const nodes = new Map(base.nodes.map((n) => [n.id, { ...n }]));
  const edges = new Map(base.edges.map((e) => [e.id, { ...e }]));
  const newNodeIds: string[] = [];
  const fail = (i: number, op: DiagramCommand, msg: string) => ({
    ok: false as const,
    errors: [`command ${i + 1} (${op.op}): ${msg}`],
  });

  for (const [i, op] of ops.entries()) {
    switch (op.op) {
      case "addNode": {
        if (nodes.has(op.node.id)) return fail(i, op, `node "${op.node.id}" already exists`);
        nodes.set(op.node.id, {
          id: op.node.id,
          label: op.node.label,
          shape: op.node.shape ?? "rectangle",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          ...styleColors(op.node.style),
        });
        newNodeIds.push(op.node.id);
        break;
      }
      case "deleteNode": {
        if (!nodes.delete(op.id)) return fail(i, op, `no node "${op.id}"`);
        for (const [eid, e] of edges) if (e.source === op.id || e.target === op.id) edges.delete(eid);
        break;
      }
      case "renameNode": {
        const n = nodes.get(op.id);
        if (!n) return fail(i, op, `no node "${op.id}"`);
        n.label = op.label;
        break;
      }
      case "connectNodes": {
        if (!nodes.has(op.source)) return fail(i, op, `no source node "${op.source}"`);
        if (!nodes.has(op.target)) return fail(i, op, `no target node "${op.target}"`);
        const id = op.id ?? `e-${op.source}-${op.target}-${edges.size}`;
        edges.set(id, { id, source: op.source, target: op.target, label: op.label });
        break;
      }
      case "deleteEdge": {
        if (!edges.delete(op.id)) return fail(i, op, `no edge "${op.id}"`);
        break;
      }
      case "styleNode": {
        const n = nodes.get(op.id);
        if (!n) return fail(i, op, `no node "${op.id}"`);
        if (op.shape) n.shape = op.shape;
        Object.assign(n, styleColors(op.style));
        break;
      }
      case "styleEdge": {
        const e = edges.get(op.id);
        if (!e) return fail(i, op, `no edge "${op.id}"`);
        if (op.style?.dashed !== undefined) e.dashed = op.style.dashed;
        if (op.style?.color) e.color = op.style.color;
        if (op.style?.arrow) e.arrow = op.style.arrow;
        break;
      }
    }
  }

  return { ok: true, semantics: { nodes: [...nodes.values()], edges: [...edges.values()] }, newNodeIds };
}

const DEFAULT_W = 160;
const DEFAULT_H = 64;

/** Lays out newly-added nodes below existing content (existing positions kept). */
export function placeNewNodes(semantics: Semantics, newNodeIds: ReadonlySet<string>): void {
  const existing = semantics.nodes.filter((n) => !newNodeIds.has(n.id) && (n.width || n.height));
  const baseY = existing.length ? Math.max(...existing.map((n) => n.y + n.height)) + 80 : 120;
  let i = 0;
  for (const n of semantics.nodes) {
    if (!newNodeIds.has(n.id)) continue;
    n.width = DEFAULT_W;
    n.height = DEFAULT_H;
    n.x = 120 + (i % 4) * 220;
    n.y = baseY + Math.floor(i / 4) * 140;
    i++;
  }
}

/** Rebuilds element skeletons for the whole graph; convert re-synthesises bindings. */
export function buildSkeletons({ nodes, edges }: Semantics): ExcalidrawElementSkeleton[] {
  const skeletons: ExcalidrawElementSkeleton[] = [];
  for (const n of nodes) {
    skeletons.push({
      type: n.shape,
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width || DEFAULT_W,
      height: n.height || DEFAULT_H,
      roughness: PRO_ROUGHNESS,
      ...(n.strokeColor ? { strokeColor: n.strokeColor } : {}),
      ...(n.backgroundColor ? { backgroundColor: n.backgroundColor } : {}),
      label: { text: n.label, fontFamily: PRO_FONT_FAMILY },
      customData: { nodeId: n.id, label: n.label },
    } as ExcalidrawElementSkeleton);
  }
  for (const e of edges) {
    skeletons.push({
      type: "arrow",
      id: e.id,
      x: 0,
      y: 0,
      roughness: PRO_ROUGHNESS,
      start: { id: e.source },
      end: { id: e.target },
      ...(e.dashed ? { strokeStyle: "dashed" } : {}),
      ...(e.color ? { strokeColor: e.color } : {}),
      ...(e.arrow === "none" ? { endArrowhead: null } : {}),
      ...(e.arrow === "both" ? { startArrowhead: "arrow" } : {}),
      ...(e.label ? { label: { text: e.label, fontFamily: PRO_FONT_FAMILY } } : {}),
      customData: { edgeId: e.id },
    } as ExcalidrawElementSkeleton);
  }
  return skeletons;
}
