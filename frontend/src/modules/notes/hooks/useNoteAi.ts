import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/common/toast";
import { useDefaultSelectedModel } from "@/hooks/useDefaultSelectedModel";
import { notesStream, type NoteAiAction } from "@/services/operations/notes/notes.stream";
import type { SelectedModel } from "@/modules/chat/types";

export const useNoteAi = (
  noteId: number | undefined,
  onContent: (content: string) => void,
  onSaved: () => void,
  onBusyChange: (busy: boolean) => void,
) => {
  const [instruction, setInstruction] = useState("");
  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const [busy, setBusy] = useState(false);
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

  const runAction = (action: NoteAiAction, focusInput: () => void) => {
    if (busy || !noteId) return;
    if (action === "ai-update" && !instruction.trim()) {
      toast.error("Describe what the AI should change");
      focusInput();
      return;
    }
    if (!activeSelection) {
      toast.error("No model available — activate a model first");
      return;
    }
    const { provider, model } = activeSelection;

    setBusyState(true);
    let full = "";
    abortRef.current = notesStream.run(
      noteId,
      action,
      { instruction: instruction.trim() || undefined, provider, model },
      {
        onStart: () => {},
        onChunk: ({ delta }) => {
          full += delta;
          onContent(full);
        },
        onDone: () => {
          setBusyState(false);
          setInstruction("");
          onSaved();
        },
        onError: (message) => {
          setBusyState(false);
          toast.error(message);
        },
      },
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusyState(false);
  };

  return {
    instruction,
    setInstruction,
    selected,
    setSelected,
    activeSelection,
    busy,
    runAction,
    stop,
  };
};

/** A command the palette hands to NotesScreen: an AI action to run, or "focus" the instruction bar. */
export type NotesBarCommand = NoteAiAction | "focus";
