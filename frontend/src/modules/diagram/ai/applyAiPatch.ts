import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/redux/rootReducer";
import type { AppDispatch } from "@/redux/store";
import { selectBundle } from "@/modules/diagram/model/selectors";
import { pushed } from "@/modules/diagram/model/historySlice";
import { entryRemoved, entrySet } from "@/modules/diagram/model/layoutSlice";
import { applyOp, type DiagramOp } from "@/modules/diagram/commands/ops";
import type { CommandResult } from "@/modules/diagram/commands";
import { validateBundle } from "@/modules/diagram/schema/validate";
import { nearParentPlacement } from "@/modules/diagram/layout/NearParentPlacement";
import type { DiagramBundle, NodeId } from "@/modules/diagram/types";

/**
 * Applies a validated AI command list ATOMICALLY:
 *   1. every op is folded over a candidate bundle (nothing dispatched yet) —
 *      one bad op rejects the whole patch with the store untouched;
 *   2. incremental placement computes entries for NEW node ids only — frozen
 *      layout entries are never rewritten (the single most important AI-edit
 *      guarantee);
 *   3. the final bundle passes the gate once more, then everything applies as
 *      ONE history entry ("AI edit" = one Ctrl+Z).
 */
export const applyAiPatch =
  (ops: DiagramOp[]) =>
  (dispatch: AppDispatch, getState: () => RootState): CommandResult => {
    let bundle = selectBundle(getState());
    const redo: UnknownAction[] = [];
    const undo: UnknownAction[] = [];
    const newIds: NodeId[] = [];

    for (const [index, op] of ops.entries()) {
      const result = applyOp(bundle, op);
      if (!result.ok) {
        return { ok: false, errors: result.errors.map((error) => `command ${index + 1} (${op.op}): ${error}`) };
      }
      bundle = result.applied.bundle;
      redo.push(...result.applied.redo);
      undo.unshift(...result.applied.undo);
      if (op.op === "addNode") newIds.push(op.node.id);
    }

    const placements = nearParentPlacement.place(
      newIds.filter((id) => !bundle.layout[id]),
      bundle.layout,
      bundle.semantic.edges,
    );
    for (const [id, entry] of Object.entries(placements)) {
      redo.push(entrySet({ id, entry }));
      undo.unshift(entryRemoved(id));
    }

    const final: DiagramBundle = { ...bundle, layout: { ...bundle.layout, ...placements } };
    const gate = validateBundle(final);
    if (!gate.ok) return { ok: false, errors: gate.errors };

    for (const action of redo) dispatch(action);
    dispatch(pushed({ label: "AI edit", redo, undo }));
    return { ok: true };
  };
