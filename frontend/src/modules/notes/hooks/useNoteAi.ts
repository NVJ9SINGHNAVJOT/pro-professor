import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/common/toast";
import { useDefaultSelectedModel } from "@/hooks/useDefaultSelectedModel";
import { notesStream, type NoteAiAction, type NoteAiMode } from "@/services/operations/notes/notes.stream";
import type { SelectedModel } from "@/modules/chat/types";

/**
 * The delimiters a fragment action asks the model for. Stripped for the preview strip only —
 * the server does its own extraction and is the authority on what gets saved.
 */
const FRAGMENT_TAGS = /<\/?(?:summary|continuation)>/gi;

export const useNoteAi = (
  noteId: number | undefined,
  onContent: (content: string) => void,
  onSaved: () => void,
  onBusyChange: (busy: boolean) => void,
) => {
  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const [busy, setBusy] = useState(false);
  /** Live text of a fragment action, for the status strip; null whenever one isn't running. */
  const [preview, setPreview] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [noteId]);

  const defaultModel = useDefaultSelectedModel();
  const activeSelection = selected ?? defaultModel;

  const setBusyState = (value: boolean) => {
    setBusy(value);
    onBusyChange(value);
  };

  /**
   * @param instruction what the AI should change — required by `ai-update`, ignored by the others.
   *        Passed in rather than held here: the AI tab's one composer is the single source of that
   *        text, and it doubles as the chat input.
   * @returns whether generation actually started — the caller clears its composer on true.
   */
  const runAction = (action: NoteAiAction, instruction: string): boolean => {
    if (busy || !noteId) return false;
    if (action === "ai-update" && !instruction.trim()) {
      toast.error("Describe what the AI should change");
      return false;
    }
    if (!activeSelection) {
      toast.error("No model available — activate a model first");
      return false;
    }
    const { provider, model } = activeSelection;

    setBusyState(true);
    setPreview(null);
    let full = "";
    let mode: NoteAiMode = "replace";
    abortRef.current = notesStream.run(
      noteId,
      action,
      { instruction: instruction.trim() || undefined, provider, model },
      {
        onStart: (data) => {
          mode = data.mode;
          if (mode === "fragment") setPreview("");
        },
        onChunk: ({ delta }) => {
          full += delta;
          // A fragment is not the note — the server splices it into the stored copy, so the buffer
          // stays as it is and the result arrives with the refetch on note.done. Streaming it into
          // the editor would momentarily replace the whole note with a paragraph.
          if (mode === "replace") onContent(full);
          else setPreview(full.replace(FRAGMENT_TAGS, ""));
        },
        onDone: () => {
          setBusyState(false);
          setPreview(null);
          onSaved();
        },
        onError: (message) => {
          setBusyState(false);
          setPreview(null);
          toast.error(message);
        },
      },
    );
    return true;
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusyState(false);
    setPreview(null);
  };

  return {
    selected,
    setSelected,
    activeSelection,
    busy,
    preview,
    runAction,
    stop,
  };
};

/** A command the palette hands to NotesScreen: an AI action to run, or "focus" to open the popover. */
export type NotesBarCommand = NoteAiAction | "focus";
