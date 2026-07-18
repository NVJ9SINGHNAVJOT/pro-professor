import type { RootState } from "@/redux/rootReducer";
import type { AppDispatch } from "@/redux/store";
import { selectBundle } from "@/modules/diagram/model/selectors";
import { pushed, redone, undone, type HistoryEntry } from "@/modules/diagram/model/historySlice";
import { applyOp, type DiagramOp } from "@/modules/diagram/commands/ops";
import type { EdgeId, LayoutEntry, NodeId, SemNode } from "@/modules/diagram/types";

/* ── The command layer ────────────────────────────────────────────────────────
 * Every document mutation — user or AI — flows through the pure op appliers in
 * ops.ts (candidate build → ajv gate → inverse actions). These thunks apply a
 * single validated op and record it on the per-diagram history; an invalid
 * command returns the errors and leaves the store untouched.
 */

export type CommandResult = { ok: true } | { ok: false; errors: string[] };
type Command = (dispatch: AppDispatch, getState: () => RootState) => CommandResult;

const runOp =
  (op: DiagramOp): Command =>
  (dispatch, getState) => {
    const result = applyOp(selectBundle(getState()), op);
    if (!result.ok) return result;
    for (const action of result.applied.redo) dispatch(action);
    dispatch(pushed({ label: result.applied.label, redo: result.applied.redo, undo: result.applied.undo }));
    return { ok: true };
  };

export const addNodeCommand = (node: SemNode, entry?: LayoutEntry) => runOp({ op: "addNode", node, entry });
export const deleteNodeCommand = (id: NodeId) => runOp({ op: "deleteNode", id });
export const renameNodeCommand = (id: NodeId, label: string) => runOp({ op: "renameNode", id, label });
export const connectNodesCommand = (edge: { source: NodeId; target: NodeId; type?: string; label?: string; id?: EdgeId }) =>
  runOp({ op: "connectNodes", ...edge });
export const deleteEdgeCommand = (id: EdgeId) => runOp({ op: "deleteEdge", id });
export const moveNodeCommand = (id: NodeId, x: number, y: number) => runOp({ op: "moveNode", id, x, y });
export const resizeNodeCommand = (id: NodeId, w: number, h: number) => runOp({ op: "resizeNode", id, w, h });

/* ── Undo / redo ─────────────────────────────────────────────────────────── */

export const undoCommand = (): Command => (dispatch, getState) => {
  const entry: HistoryEntry | undefined = getState().diagram.history.past.at(-1);
  if (!entry) return { ok: false, errors: ["nothing to undo"] };
  for (const action of entry.undo) dispatch(action);
  dispatch(undone());
  return { ok: true };
};

export const redoCommand = (): Command => (dispatch, getState) => {
  const entry: HistoryEntry | undefined = getState().diagram.history.future.at(-1);
  if (!entry) return { ok: false, errors: ["nothing to redo"] };
  for (const action of entry.redo) dispatch(action);
  dispatch(redone());
  return { ok: true };
};
