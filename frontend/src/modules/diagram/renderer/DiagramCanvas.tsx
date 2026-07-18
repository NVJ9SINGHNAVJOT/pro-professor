import { useEffect, useState } from "react";
import { applyNodeChanges } from "@xyflow/react";
import type { Node, OnMoveEnd, OnNodesChange } from "@xyflow/react";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { commitNodeChanges, selectFlowEdges, selectFlowNodes } from "@/modules/diagram/adapter/ReactFlowAdapter";
import { setViewport } from "@/modules/diagram/model/viewportSlice";
import { redoCommand, undoCommand } from "@/modules/diagram/commands";
import DiagramRenderer from "@/modules/diagram/renderer/DiagramRenderer";

/** True when the event targets a text-entry element (don't steal its shortcuts). */
const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

interface DiagramCanvasProps {
  className?: string;
}

/**
 * Store-connected editable canvas for the open diagram.
 *
 * RF needs transient changes applied every frame for smooth dragging, so the
 * canvas keeps a LOCAL MIRROR of the nodes: `applyNodeChanges` feeds it during
 * interaction, and only drag/resize-end commits reach the domain (see
 * commitNodeChanges). Whenever the domain changes (load, commit, AI edit,
 * undo), the mirror re-derives from the selector — the domain always wins.
 */
const DiagramCanvas = ({ className }: DiagramCanvasProps) => {
  const dispatch = useAppDispatch();
  const flowNodes = useAppSelector(selectFlowNodes);
  const edges = useAppSelector(selectFlowEdges);

  const [nodes, setNodes] = useState<Node[]>(flowNodes);
  const [syncedFrom, setSyncedFrom] = useState(flowNodes);
  if (syncedFrom !== flowNodes) {
    // domain changed → reset the mirror during render (React's "adjust state on prop change" pattern)
    setSyncedFrom(flowNodes);
    setNodes(flowNodes);
  }

  const onNodesChange: OnNodesChange = (changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
    commitNodeChanges(changes, dispatch);
  };

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo — active while a canvas is mounted.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || isTypingTarget(event.target)) return;
      event.preventDefault();
      dispatch(event.shiftKey ? redoCommand() : undoCommand());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  const onMoveEnd: OnMoveEnd = (_event, viewport) => {
    dispatch(setViewport(viewport));
  };

  return <DiagramRenderer nodes={nodes} edges={edges} onNodesChange={onNodesChange} onMoveEnd={onMoveEnd} className={className} />;
};

export default DiagramCanvas;
