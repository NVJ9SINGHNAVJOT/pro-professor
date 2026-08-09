import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/common/toast";
import { chatsStream } from "@/services/operations/chats/chats.stream";
import { NOTE_CONTEXT_MAX_CHARS } from "@/modules/notes/constants";
import { stripFrontmatter } from "@/modules/notes/utils";
import type { NoteChatContextMode, NoteChatMessage } from "@/modules/notes/types";
import type { SelectedModel } from "@/modules/chat/types";

interface UseNoteChatOptions {
  /** Clears the thread when the open note changes, so a reply can't land under a different note. */
  noteId: number | undefined;
  /** The live editor buffer — what the user is looking at, not the saved row. */
  content: string;
  /** The model picked in NotesBar; both paths share one activation lock, so there is no second picker. */
  selection: SelectedModel | null;
  /** The editor's selected text, or "" when nothing is selected. */
  selectedText: string;
}

/**
 * A note-scoped chat.
 *
 * Held in component state rather than persisted: the conversation row does survive server-side
 * (hidden from the chat history by its `mode`), but the panel deliberately starts fresh, which is
 * the seam where persistence would later be added.
 *
 * The note reaches the model through `noteContext`, sent fresh on every turn — never as the
 * conversation's persona, which is only read when the conversation is created and would answer
 * about a stale copy of the note for the rest of the thread.
 */
export const useNoteChat = ({ noteId, content, selection, selectedText }: UseNoteChatOptions) => {
  const [messages, setMessages] = useState<NoteChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [contextMode, setContextMode] = useState<NoteChatContextMode>("auto");
  const conversationIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Switching notes ends the thread: an in-flight reply would otherwise arrive under a note it
  // was never about.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      conversationIdRef.current = null;
      setMessages([]);
      setBusy(false);
    };
  }, [noteId]);

  /** The note text this turn carries, already trimmed — the server applies no cap of its own. */
  const buildContext = (): { text: string; label: string } => {
    if (contextMode === "none") return { text: "", label: "No note context" };
    const useSelection = contextMode !== "whole-note" && selectedText !== "";
    const source = useSelection ? selectedText : stripFrontmatter(content);
    const text = source.slice(0, NOTE_CONTEXT_MAX_CHARS).trim();
    const truncated = source.length > NOTE_CONTEXT_MAX_CHARS ? ", truncated" : "";
    return { text, label: `${useSelection ? "Selection" : "Whole note"} · ${text.length} chars${truncated}` };
  };

  /**
   * What an *Update* rewrites. Derived from the same `contextMode` as the chat turn, so one control
   * governs both halves of the tab — with the single difference that "None" has no meaning for an
   * edit (there would be nothing to rewrite), so Update reads it the way it reads "Auto".
   */
  const updateUsesSelection = contextMode !== "whole-note" && selectedText !== "";

  const send = () => {
    const question = input.trim();
    if (busy || !question) return;
    if (!selection) {
      toast.error("Select a model first");
      return;
    }

    setInput("");
    setMessages((current) => [...current, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setBusy(true);

    /** Drops the empty assistant bubble; used when the turn produced nothing to show. */
    const dropPending = () => setMessages((current) => current.slice(0, -1));
    let reply = "";

    abortRef.current = chatsStream.send(
      {
        conversationId: conversationIdRef.current,
        provider: selection.provider,
        model: selection.model,
        content: question,
        noteContext: buildContext().text || undefined,
        // Says where the turn came from, so the conversation is filed under the note rather than
        // the chat history. Not inferable from noteContext: an empty note (or "None") sends none.
        noteChat: true,
        verbose: false,
        // No inference params on purpose — the server fills them from the Notes settings row, which
        // is the user-facing control for this panel. Hardcoding them here would ignore those sliders.
      },
      {
        onStart: ({ conversationId }) => {
          conversationIdRef.current = conversationId;
        },
        onChunk: ({ delta }) => {
          reply += delta;
          setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: reply }]);
        },
        onDone: () => setBusy(false),
        onError: (message) => {
          setBusy(false);
          if (!reply) dropPending();
          toast.error(message);
        },
        // A different model is mid-generation, so nothing was persisted. Roll the turn back
        // entirely and hand the question back so it can just be re-sent.
        onBusy: (message) => {
          setBusy(false);
          setMessages((current) => current.slice(0, -2));
          setInput(question);
          toast.error(message);
        },
        onTitle: () => {},
        onTranscript: () => {},
        onSettings: () => {},
        // Reasoning isn't part of the answer — same call the note actions make.
        onThinking: () => {},
        onMetrics: () => {},
      },
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  return {
    messages,
    input,
    setInput,
    busy,
    contextMode,
    setContextMode,
    contextLabel: buildContext().label,
    updateUsesSelection,
    updateScopeLabel: updateUsesSelection
      ? `Selection · ${selectedText.length} chars`
      : `Whole note · ${content.length} chars`,
    send,
    stop,
  };
};
