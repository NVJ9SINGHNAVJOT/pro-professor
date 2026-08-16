import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ArrowDownToLineIcon,
  CheckCheckIcon,
  ClipboardIcon,
  CornerDownLeftIcon,
  MessageSquareIcon,
  MoreHorizontal,
  ReplaceIcon,
  SquareIcon,
  TextCursorInputIcon,
  WandSparklesIcon,
} from "lucide-react";
import Markdown, { MarkdownBody, type WikiHandlers } from "@/components/common/Markdown";
import ModelSelector from "@/components/common/ModelSelector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NoteEditCard from "@/modules/notes/components/NoteEditCard";
import { editsOf, parseNoteEdits, proseOf } from "@/modules/notes/ai/noteEdits";
import type { NoteEdit } from "@/modules/notes/ai/noteEdits";
import type { useNoteChat } from "@/modules/notes/hooks/useNoteChat";
import type { NoteApplyMode, NoteChatContextMode, NoteChatMessage, NoteEditStatus } from "@/modules/notes/types";
import type { ProviderModel } from "@/services/operations/models/models.route";
import { cn } from "@/lib/utils";

/** Excludes embedding models from the tab's picker — closes over nothing, so it stays one stable
 *  reference across renders (a fresh inline function here would defeat ModelSelector's memo). */
const isNotEmbeddingModel = (m: ProviderModel) => m.role !== "embedding" && !m.name.toLowerCase().includes("embed");

const CONTEXT_MODES: { mode: NoteChatContextMode; label: string }[] = [
  { mode: "auto", label: "Auto" },
  { mode: "whole-note", label: "Whole note" },
  { mode: "none", label: "None" },
];

/** Applies one edit of one reply; the screen owns the buffer and reports back what happened. */
export type AcceptEdit = (messageIndex: number, editIndex: number, edit: NoteEdit) => void;

interface NoteChatPanelProps {
  chat: ReturnType<typeof useNoteChat>;
  /** Makes `[[links]]` in replies clickable, same as the preview pane. */
  wiki: WikiHandlers;
  /** Writes a reply's prose into the editor. Null while there is no editor to write through. */
  onApply: ((mode: NoteApplyMode, text: string) => void) | null;
  onAcceptEdit: AcceptEdit;
  /** Selects an edit's target in the editor so it can be seen before it is accepted. */
  onLocateEdit: (edit: NoteEdit) => void;
}

/**
 * Chat about the open note, and propose edits to it.
 *
 * One composer: you type, and the model either answers or proposes changes. A proposed change
 * arrives as a diff card in the thread, and applying it is a click on that card — there is no
 * staging pane and nothing reaches the note on its own.
 */
const NoteChatPanel = ({ chat, wiki, onApply, onAcceptEdit, onLocateEdit }: NoteChatPanelProps) => {
  const submit = () => {
    // Enter is inert while generating — the send button is a Stop button by then, and without the
    // guard the key still fired a fresh turn behind it.
    if (chat.busy) return;
    chat.send();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* How much of the note each turn carries. The model can only propose edits to text it was
          shown, so this is also the scope of what it can change. */}
      <div className="flex shrink-0 flex-col gap-y-1.5 border-b border-neutral-800 px-3 py-2">
        <span className="caption-small-medium text-neutral-500">Context</span>
        <div className="flex items-center rounded-lg bg-neutral-900 p-0.5">
          {CONTEXT_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => chat.setContextMode(mode)}
              className={cn(
                "flex-1 cursor-pointer rounded-md px-2 py-1 caption-small-medium text-neutral-400 transition-colors hover:text-white",
                chat.contextMode === mode && "bg-neutral-700 text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="truncate caption-small-regular text-neutral-500">{chat.contextLabel}</span>
      </div>

      <ChatThread
        messages={chat.messages}
        busy={chat.busy}
        wiki={wiki}
        onApply={onApply}
        onAcceptEdit={onAcceptEdit}
        onLocateEdit={onLocateEdit}
        onSetEditStatus={chat.setEditStatus}
      />

      <div className="shrink-0 border-t border-neutral-800 p-2">
        <div className="flex items-end gap-x-1.5 rounded-lg bg-neutral-900 px-2 py-1.5">
          <textarea
            value={chat.input}
            onChange={(e) => chat.setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={4}
            placeholder="Ask about this note, or describe a change…"
            // Capped so a long instruction scrolls inside the box rather than growing it into the
            // thread.
            className="chat-scroll max-h-40 min-w-0 flex-1 resize-none bg-transparent para-small-medium outline-none placeholder:text-neutral-500"
          />
          {chat.busy ? (
            <button
              type="button"
              onClick={chat.stop}
              aria-label="Stop generating"
              title="Stop"
              className="shrink-0 cursor-pointer rounded-lg bg-white p-1.5 text-black hover:bg-neutral-200"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!chat.input.trim()}
              aria-label="Send"
              title="Send (Enter)"
              className="shrink-0 cursor-pointer rounded-lg bg-white p-1.5 text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              <CornerDownLeftIcon className="size-3.5" />
            </button>
          )}
          {/* The model this tab runs on, as a chip beside the send key — it costs the composer a
              corner instead of the whole row a model name needs. */}
          <ModelSelector
            value={chat.selected}
            onChange={chat.setSelected}
            disabled={chat.busy}
            align="end"
            iconOnly
            filter={isNotEmbeddingModel}
          />
        </div>
      </div>
    </div>
  );
};

interface ChatThreadProps {
  messages: NoteChatMessage[];
  /** True while a reply is arriving — only the last message is the one being written. */
  busy: boolean;
  wiki: WikiHandlers;
  onApply: ((mode: NoteApplyMode, text: string) => void) | null;
  onAcceptEdit: AcceptEdit;
  onLocateEdit: (edit: NoteEdit) => void;
  onSetEditStatus: (messageIndex: number, editIndex: number, status: NoteEditStatus) => void;
}

/**
 * The message thread — split out so a turn (which only changes `chat.messages`) doesn't repaint
 * markdown for replies nobody touched, and so composer-local state changes in the parent don't
 * re-render the thread at all.
 */
const ChatThread = memo(function ChatThread({
  messages,
  busy,
  wiki,
  onApply,
  onAcceptEdit,
  onLocateEdit,
  onSetEditStatus,
}: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * Follow the stream by scrolling **this container**, never `scrollIntoView` — the latter walks
   * every scrollable ancestor, and App's `<main>` is one, so it dragged the whole notes UI down the
   * page by whatever vertical slack the horizontal scrollbar left it. Same rule as the preview
   * pane's heading scroll in NotesScreen.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <div ref={scrollRef} className="chat-scroll flex min-h-0 flex-1 flex-col gap-y-3 overflow-y-auto p-3">
      {messages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-y-2 px-4 text-center text-neutral-600">
          <MessageSquareIcon className="size-7" />
          <p className="caption-regular">
            Ask about this note, or describe a change. Edits arrive as diffs you accept.
          </p>
        </div>
      )}

      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={index} className="self-end rounded-lg bg-neutral-800 px-3 py-2 para-small-medium text-white">
            {message.content}
          </div>
        ) : (
          <AssistantMessage
            key={index}
            message={message}
            messageIndex={index}
            streaming={busy && index === messages.length - 1}
            wiki={wiki}
            onApply={onApply}
            onAcceptEdit={onAcceptEdit}
            onLocateEdit={onLocateEdit}
            onSetEditStatus={onSetEditStatus}
          />
        ),
      )}
    </div>
  );
});

interface AssistantMessageProps {
  message: NoteChatMessage;
  messageIndex: number;
  /** True while this reply is still arriving, so an unfinished diagram reads as being written. */
  streaming: boolean;
  wiki: WikiHandlers;
  onApply: ((mode: NoteApplyMode, text: string) => void) | null;
  onAcceptEdit: AcceptEdit;
  onLocateEdit: (edit: NoteEdit) => void;
  onSetEditStatus: (messageIndex: number, editIndex: number, status: NoteEditStatus) => void;
}

/**
 * One reply: prose and edit cards, in the order the model wrote them, so a card sits under the
 * sentence explaining it.
 *
 * Memoized on the message, because the reply is re-parsed on every streamed token and only the last
 * message is changing.
 */
const AssistantMessage = memo(function AssistantMessage({
  message,
  messageIndex,
  streaming,
  wiki,
  onApply,
  onAcceptEdit,
  onLocateEdit,
  onSetEditStatus,
}: AssistantMessageProps) {
  // Each segment carries the ordinal it has *among the edits*, which is what a status index
  // addresses. Numbered here rather than by a counter in the render loop, which the React Compiler
  // rejects as a reassignment that outlives the render.
  const { segments, prose, edits } = useMemo(() => {
    const parsed = parseNoteEdits(message.content);
    let ordinal = -1;
    return {
      segments: parsed.map((segment) => ({ segment, ordinal: segment.kind === "edit" ? ++ordinal : -1 })),
      prose: proseOf(parsed),
      edits: editsOf(parsed),
    };
  }, [message.content]);

  const statusOf = (editIndex: number) => message.editStatus?.[editIndex] ?? "pending";
  const pendingCount = edits.filter((_, editIndex) => statusOf(editIndex) === "pending").length;

  const acceptAll = useCallback(() => {
    edits.forEach((edit, editIndex) => {
      if ((message.editStatus?.[editIndex] ?? "pending") === "pending") onAcceptEdit(messageIndex, editIndex, edit);
    });
  }, [edits, message.editStatus, messageIndex, onAcceptEdit]);

  return (
    <div className="group flex flex-col gap-y-2">
      {segments.map(({ segment, ordinal }, index) => {
        if (segment.kind === "prose") {
          return (
            <MarkdownBody key={index} className="para-small-regular text-neutral-200">
              <Markdown wiki={wiki} streaming={streaming}>
                {segment.text}
              </Markdown>
            </MarkdownBody>
          );
        }
        if (segment.kind === "pending") {
          return (
            <div
              key={index}
              className="flex items-center gap-x-2 rounded-lg border border-neutral-800 px-2.5 py-2 caption-small-regular text-neutral-500"
            >
              <WandSparklesIcon className="size-3.5 shrink-0 animate-pulse" />
              Writing an edit…
            </div>
          );
        }
        return (
          <NoteEditCard
            key={index}
            edit={segment.edit}
            status={statusOf(ordinal)}
            baseContent={message.baseContent ?? ""}
            onAccept={() => onAcceptEdit(messageIndex, ordinal, segment.edit)}
            onReject={() => onSetEditStatus(messageIndex, ordinal, "rejected")}
            onLocate={() => onLocateEdit(segment.edit)}
          />
        );
      })}

      {/* Applied top to bottom, each re-found against the buffer as it stands by then, so an edit
          that a previous one displaced still lands. */}
      {pendingCount > 1 && (
        <button
          type="button"
          onClick={acceptAll}
          className="flex cursor-pointer items-center justify-center gap-x-1.5 rounded-lg bg-neutral-800 px-2 py-1.5 caption-small-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
        >
          <CheckCheckIcon className="size-3.5 shrink-0" />
          Accept all ({pendingCount})
        </button>
      )}

      {/* Its own row, rather than floating over the message's top-right corner: absolutely
          positioned it landed on top of the reply's first line, which in a rail this narrow is
          almost always full-width text. A reserved strip costs 20px and collides with nothing —
          and it can't jump the layout on hover, which appearing only on hover would. */}
      {prose !== "" && onApply && (
        <div className="flex h-5 shrink-0 items-center justify-end">
          <ApplyMenu text={prose} onApply={onApply} />
        </div>
      )}
    </div>
  );
});

/**
 * The reply's actions, in one `⋯` menu rather than a row of inline buttons — the convention the
 * sidebar rows follow (see frontend/docs/folder-structure.md § Sidebar list rows), for the same
 * reason: four inline buttons per message would drown the message.
 */
const ApplyMenu = ({ text, onApply }: { text: string; onApply: (mode: NoteApplyMode, text: string) => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label="Apply this reply's text to the note"
      title="Apply this reply's text to the note"
      className={cn(
        "cursor-pointer rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-white",
        // Snapped, not faded: transitioning opacity puts the icon on its own layer and renders it blurry.
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
      )}
    >
      <MoreHorizontal className="size-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto min-w-44">
      <DropdownMenuItem
        onSelect={() => onApply("cursor", text)}
        className="cursor-pointer px-2 py-1.5 para-small-medium"
      >
        <TextCursorInputIcon className="size-4" />
        Insert at cursor
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => onApply("selection", text)}
        className="cursor-pointer px-2 py-1.5 para-small-medium"
      >
        <ReplaceIcon className="size-4" />
        Replace selection
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => onApply("append", text)}
        className="cursor-pointer px-2 py-1.5 para-small-medium"
      >
        <ArrowDownToLineIcon className="size-4" />
        Append to note
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => void navigator.clipboard.writeText(text)}
        className="cursor-pointer px-2 py-1.5 para-small-medium"
      >
        <ClipboardIcon className="size-4" />
        Copy
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default NoteChatPanel;
