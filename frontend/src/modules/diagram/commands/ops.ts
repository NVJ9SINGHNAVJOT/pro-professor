import { nanoid } from "nanoid";
import type { UnknownAction } from "@reduxjs/toolkit";
import { validateBundle } from "@/modules/diagram/schema/validate";
import {
  edgeAdded,
  edgeRemoved,
  nodeAdded,
  nodeRemoved,
  nodeRenamed,
} from "@/modules/diagram/model/semanticSlice";
import { entryRemoved, entrySet, layoutReplaced, moveNode, resizeNode } from "@/modules/diagram/model/layoutSlice";
import type { DiagramBundle, EdgeId, LayoutEntry, NodeId, SemEdge, SemNode } from "@/modules/diagram/types";

/* ── Pure op appliers ─────────────────────────────────────────────────────────
 * One op = one document mutation. `applyOp` builds the candidate bundle the op
 * would produce, runs it through validateBundle (the single gate) and returns
 * the slice actions that apply (`redo`) and revert (`undo`) it — WITHOUT
 * dispatching anything. Command thunks apply single ops; the AI pipeline folds
 * a whole command list over the bundle and only dispatches if every op passed.
 * This is exactly the locked patch format: AI command lists are `DiagramOp[]`
 * (minus the layout ops, which the AI patch schema forbids — AI never owns layout).
 */

export type DiagramOp =
  | { op: "addNode"; node: SemNode; entry?: LayoutEntry }
  | { op: "deleteNode"; id: NodeId }
  | { op: "renameNode"; id: NodeId; label: string }
  | { op: "connectNodes"; source: NodeId; target: NodeId; type?: string; label?: string; id?: EdgeId }
  | { op: "deleteEdge"; id: EdgeId }
  | { op: "moveNode"; id: NodeId; x: number; y: number }
  | { op: "resizeNode"; id: NodeId; w: number; h: number };

export interface AppliedOp {
  bundle: DiagramBundle;
  redo: UnknownAction[];
  undo: UnknownAction[];
  label: string;
}

export type OpResult = { ok: true; applied: AppliedOp } | { ok: false; errors: string[] };

export function applyOp(bundle: DiagramBundle, op: DiagramOp): OpResult {
  switch (op.op) {
    case "addNode":
      return applyAddNode(bundle, op.node, op.entry);
    case "deleteNode":
      return applyDeleteNode(bundle, op.id);
    case "renameNode":
      return applyRenameNode(bundle, op.id, op.label);
    case "connectNodes":
      return applyConnectNodes(bundle, op);
    case "deleteEdge":
      return applyDeleteEdge(bundle, op.id);
    case "moveNode":
      return applyMoveNode(bundle, op.id, op.x, op.y);
    case "resizeNode":
      return applyResizeNode(bundle, op.id, op.w, op.h);
  }
}

/** Runs the candidate through the gate; only a valid candidate becomes an AppliedOp. */
function validated(candidate: DiagramBundle, label: string, redo: UnknownAction[], undo: UnknownAction[]): OpResult {
  const result = validateBundle(candidate);
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, applied: { bundle: candidate, redo, undo, label } };
}

function applyAddNode(bundle: DiagramBundle, node: SemNode, entry?: LayoutEntry): OpResult {
  const candidate: DiagramBundle = {
    ...bundle,
    semantic: { ...bundle.semantic, nodes: [...bundle.semantic.nodes, node] },
    layout: entry ? { ...bundle.layout, [node.id]: entry } : bundle.layout,
  };
  const redo: UnknownAction[] = [nodeAdded({ node })];
  if (entry) redo.push(entrySet({ id: node.id, entry }));
  return validated(candidate, `add ${node.id}`, redo, [entryRemoved(node.id), nodeRemoved(node.id)]);
}

function applyDeleteNode(bundle: DiagramBundle, id: NodeId): OpResult {
  const nodeIndex = bundle.semantic.nodes.findIndex((candidate) => candidate.id === id);
  if (nodeIndex === -1) return { ok: false, errors: [`node "${id}" does not exist`] };
  const node = bundle.semantic.nodes[nodeIndex];
  // ascending indexes so sequential splices on undo rebuild the exact order
  const cascadeEdges = bundle.semantic.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => edge.source === id || edge.target === id);

  const restLayout = Object.fromEntries(Object.entries(bundle.layout).filter(([key]) => key !== id));
  const candidate: DiagramBundle = {
    ...bundle,
    semantic: {
      nodes: bundle.semantic.nodes.filter((candidateNode) => candidateNode.id !== id),
      edges: bundle.semantic.edges.filter((edge) => edge.source !== id && edge.target !== id),
    },
    layout: restLayout,
  };
  return validated(candidate, `delete ${id}`, [nodeRemoved(id), entryRemoved(id)], [
    nodeAdded({ node, index: nodeIndex }),
    ...cascadeEdges.map(({ edge, index }) => edgeAdded({ edge, index })),
    layoutReplaced(bundle.layout),
  ]);
}

function applyRenameNode(bundle: DiagramBundle, id: NodeId, label: string): OpResult {
  const node = bundle.semantic.nodes.find((candidate) => candidate.id === id);
  if (!node) return { ok: false, errors: [`node "${id}" does not exist`] };
  const candidate: DiagramBundle = {
    ...bundle,
    semantic: {
      ...bundle.semantic,
      nodes: bundle.semantic.nodes.map((candidateNode) =>
        candidateNode.id === id ? { ...candidateNode, label } : candidateNode,
      ),
    },
  };
  return validated(candidate, `rename ${id}`, [nodeRenamed({ id, label })], [nodeRenamed({ id, label: node.label })]);
}

function applyConnectNodes(
  bundle: DiagramBundle,
  edge: { source: NodeId; target: NodeId; type?: string; label?: string; id?: EdgeId },
): OpResult {
  const full: SemEdge = {
    id: edge.id ?? nanoid(8),
    source: edge.source,
    target: edge.target,
    type: edge.type ?? "curved",
    ...(edge.label !== undefined ? { label: edge.label } : {}),
  };
  const candidate: DiagramBundle = {
    ...bundle,
    semantic: { ...bundle.semantic, edges: [...bundle.semantic.edges, full] },
  };
  return validated(candidate, `connect ${full.source}→${full.target}`, [edgeAdded({ edge: full })], [edgeRemoved(full.id)]);
}

function applyDeleteEdge(bundle: DiagramBundle, id: EdgeId): OpResult {
  const index = bundle.semantic.edges.findIndex((candidate) => candidate.id === id);
  if (index === -1) return { ok: false, errors: [`edge "${id}" does not exist`] };
  const edge = bundle.semantic.edges[index];
  const candidate: DiagramBundle = {
    ...bundle,
    semantic: { ...bundle.semantic, edges: bundle.semantic.edges.filter((candidateEdge) => candidateEdge.id !== id) },
  };
  return validated(candidate, `delete edge ${id}`, [edgeRemoved(id)], [edgeAdded({ edge, index })]);
}

function applyMoveNode(bundle: DiagramBundle, id: NodeId, x: number, y: number): OpResult {
  if (!bundle.semantic.nodes.some((node) => node.id === id)) {
    return { ok: false, errors: [`node "${id}" does not exist`] };
  }
  const previous = bundle.layout[id];
  const candidate: DiagramBundle = {
    ...bundle,
    layout: { ...bundle.layout, [id]: { ...(previous ?? { w: 0, h: 0 }), x, y } },
  };
  return validated(candidate, `move ${id}`, [moveNode({ id, x, y })], [
    previous ? entrySet({ id, entry: previous }) : entryRemoved(id),
  ]);
}

function applyResizeNode(bundle: DiagramBundle, id: NodeId, w: number, h: number): OpResult {
  const previous = bundle.layout[id];
  if (!previous) return { ok: false, errors: [`node "${id}" has no layout entry`] };
  const candidate: DiagramBundle = {
    ...bundle,
    layout: { ...bundle.layout, [id]: { ...previous, w, h } },
  };
  return validated(candidate, `resize ${id}`, [resizeNode({ id, w, h })], [entrySet({ id, entry: previous })]);
}
