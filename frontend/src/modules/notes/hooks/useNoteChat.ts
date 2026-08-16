import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/common/toast";
import { chatsStream } from "@/services/operations/chats/chats.stream";
import { NOTE_CONTEXT_MAX_CHARS } from "@/modules/notes/constants";
import { stripFrontmatter } from "@/modules/notes/utils";
import type { NoteChatContextMode, NoteChatMessage, NoteEditStatus } from "@/modules/notes/types";
import type { SelectedModel } from "@/modules/chat/types";

interface UseNoteChatOptions {
  /** Clears the thread when the open note changes, so a reply can't land under a different note. */
  noteId: number | undefined;
  /** The live editor buffer — what the user is looking at, not the saved row. */
  content: string;
  /** The editor's selected text, or "" when nothing is selected. */
  selectedText: string;
}

/**
 * A note-scoped chat that can also propose edits to the note.
 *
 * One conversation, one composer: the model answers in prose, or emits edit blocks the panel
 * renders as diffs. Nothing here writes to the note — the screen applies an edit only when the user
 * accepts its card.
 *
 * Held in component state rather than persisted: the conversation row does survive server-side
 * (hidden from the chat history by its `mode`), but the panel deliberately starts fresh, which is
 * the seam where persistence would later be added.
 *
 * The note reaches the model through `noteContext`, sent fresh on every turn — never as the
 * conversation's persona, which is only read when the conversation is created and would answer
 * about a stale copy of the note for the rest of the thread.
 */
export const useNoteChat = ({ noteId, content, selectedText }: UseNoteChatOptions) => {
  const [messages, setMessages] = useState<NoteChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [contextMode, setContextMode] = useState<NoteChatContextMode>("auto");
  /**
   * Which model this panel runs on. Null until the picker is used — deliberately not defaulted to
   * the active model, because a model that rewrites your note is worth an explicit choice.
   */
  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const conversationIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** The note this thread belongs to, as of the last run — what a change is judged against. */
  const threadNoteIdRef = useRef(noteId);

  /**
   * Switching notes ends the thread: an in-flight reply would otherwise arrive under a note it was
   * never about, and its edit cards would offer to apply it there.
   *
   * Judged against the *previous* id rather than on any change, because a draft has no id until it
   * is first saved. Clearing on every change read `undefined → 42` as a note switch and threw the
   * conversation away the moment you saved — the one note whose id changes under it is the one you
   * are already talking about.
   */
  useEffect(() => {
    const previous = threadNoteIdRef.current;
    threadNoteIdRef.current = noteId;
    if (previous === undefined || previous === noteId) return;
    abortRef.current?.abort();
    abortRef.current = null;
    conversationIdRef.current = null;
    setMessages([]);
    setBusy(false);
  }, [noteId]);

  // Leaving the screen drops the stream. Separate from the switch above, which no longer runs on
  // unmount — the state it clears dies with the component, but the request would outlive it.
  useEffect(() => () => abortRef.current?.abort(), []);

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
   * Records what happened to one proposed edit. Indices the reply had not streamed yet are padded
   * with `pending`, so an ordinal always addresses the edit the card is showing.
   */
  const setEditStatus = useCallback((messageIndex: number, editIndex: number, status: NoteEditStatus) => {
    setMessages((current) =>
      current.map((message, index) => {
        if (index !== messageIndex) return message;
        const statuses = [...(message.editStatus ?? [])];
        while (statuses.length <= editIndex) statuses.push("pending");
        statuses[editIndex] = status;
        return { ...message, editStatus: statuses };
      }),
    );
  }, []);

  const send = () => {
    const question = input.trim();
    if (busy || !question) return;
    if (!selected) {
      toast.error("Select a model first");
      return;
    }

    setInput("");
    setMessages((current) => [
      ...current,
      { role: "user", content: question },
      // The buffer is snapshotted with the turn: it is what the model is about to be shown, so it
      // is what a whole-note rewrite should be diffed against later.
      { role: "assistant", content: "", editStatus: [], baseContent: content },
    ]);
    setBusy(true);

    /** Drops the empty assistant bubble; used when the turn produced nothing to show. */
    const dropPending = () => setMessages((current) => current.slice(0, -1));
    let reply = "";

    abortRef.current = chatsStream.send(
      {
        conversationId: conversationIdRef.current,
        provider: selected.provider,
        model: selected.model,
        content: question,
        // Omitted only for "None", where the user has opted out of showing the note at all. A note
        // that is merely *empty* still sends `""` — those are different facts, and collapsing them
        // meant a brand-new note (the "write me a note about X" case) got no edit protocol at all,
        // so nothing the model wrote back could be accepted.
        noteContext: contextMode === "none" ? undefined : buildContext().text,
        // Says where the turn came from, so the conversation is filed under the note rather than
        // the chat history — and, with a note context present, what asks for the edit protocol.
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
          setMessages((current) => [...current.slice(0, -1), { ...current[current.length - 1], content: reply }]);
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
        // Reasoning isn't part of the answer, and it would be parsed for edit blocks if it were.
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
    selected,
    setSelected,
    contextMode,
    setContextMode,
    contextLabel: buildContext().label,
    setEditStatus,
    send,
    stop,
  };
};
