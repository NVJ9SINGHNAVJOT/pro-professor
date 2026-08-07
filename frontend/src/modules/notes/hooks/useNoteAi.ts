import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/common/toast";
import { notesStream } from "@/services/operations/notes/notes.stream";
import type { SelectedModel } from "@/modules/chat/types";

/**
 * The AI note update, as a *proposal*.
 *
 * The server only generates — it never writes the note — so everything the model produces lands in
 * `proposal` and stays there until the user applies or discards it. That review step is why this
 * hook touches neither the editor buffer nor the saved note: the caller owns both, and applying is
 * an ordinary undoable edit it makes on the user's say-so.
 */
export const useNoteAi = (noteId: number | undefined) => {
  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const [busy, setBusy] = useState(false);
  /** The staged note, streaming in; null whenever there is nothing to review. */
  const [proposal, setProposal] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Switching notes drops both the stream and anything staged — a proposal written for one note
  // must never be applicable to another.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      setBusy(false);
      setProposal(null);
    };
  }, [noteId]);

  /**
   * Null until the tab's picker is used — deliberately *not* defaulted to the active model. Which
   * model rewrites a note is worth an explicit choice, and a pre-filled picker reads as one that
   * has already been made.
   */
  const activeSelection = selected;

  /**
   * @param instruction what the AI should change. Passed in rather than held here: the AI tab's one
   *        composer is the single source of that text, and it doubles as the chat input.
   * @returns whether generation actually started — the caller clears its composer on true.
   */
  const runAction = (instruction: string): boolean => {
    if (busy || !noteId) return false;
    if (!instruction.trim()) {
      toast.error("Describe what the AI should change");
      return false;
    }
    if (!activeSelection) {
      toast.error("Select a model first");
      return false;
    }
    const { provider, model } = activeSelection;

    setBusy(true);
    // Clear on start, not on done: the previous proposal is stale the moment a new run begins.
    setProposal("");
    let full = "";
    abortRef.current = notesStream.run(
      noteId,
      { instruction: instruction.trim(), provider, model },
      {
        onStart: () => {},
        onChunk: ({ delta }) => {
          full += delta;
          setProposal(full);
        },
        onDone: () => setBusy(false),
        onError: (message) => {
          setBusy(false);
          // The server rejected this text (empty, or the system prompt echoed back), so it is not
          // something to offer for review.
          setProposal(null);
          toast.error(message);
        },
      },
    );
    return true;
  };

  /**
   * Stops generating but *keeps* what arrived — a cancelled run usually means "that's enough",
   * not "throw it away", and Discard is one click away if it isn't.
   */
  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const clearProposal = () => setProposal(null);

  return {
    selected,
    setSelected,
    activeSelection,
    busy,
    proposal,
    runAction,
    clearProposal,
    stop,
  };
};
