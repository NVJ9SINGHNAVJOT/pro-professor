import { useEffect, useRef } from "react";
import {
  ArrowDownToLineIcon,
  ArrowRightIcon,
  ClipboardIcon,
  CornerDownLeftIcon,
  ListPlusIcon,
  MessageSquareIcon,
  MoreHorizontal,
  ReplaceIcon,
  SquareIcon,
  TextCursorInputIcon,
  WandSparklesIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Markdown from "@/components/common/markdown/Markdown";
import MarkdownBody from "@/components/common/markdown/MarkdownBody";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WikiHandlers } from "@/components/common/markdown/Markdown";
import type { useNoteChat } from "@/modules/notes/hooks/useNoteChat";
import type { NoteApplyMode, NoteChatContextMode } from "@/modules/notes/types";
import type { NoteAiAction } from "@/services/operations/notes/notes.stream";
import { cn } from "@/lib/utils";

const CONTEXT_MODES: { mode: NoteChatContextMode; label: string }[] = [
  { mode: "auto", label: "Auto" },
  { mode: "whole-note", label: "Whole note" },
  { mode: "none", label: "None" },
];

interface NoteChatPanelProps {
  chat: ReturnType<typeof useNoteChat>;
  /** Makes `[[links]]` in replies clickable, same as the preview pane. */
  wiki: WikiHandlers;
  /** Writes a reply into the editor. Absent while an AI action owns the buffer. */
  onApply: ((mode: NoteApplyMode, text: string) => void) | null;
  /** Runs a note-editing action with whatever is in the composer. */
  onRunAction: (action: NoteAiAction) => void;
  /** False on an unsaved draft or mid-generation: the actions need a saved note and a free model. */
  noteActionsEnabled: boolean;
}

/**
 * Chat about the open note without changing it. Replies land in the note only through the
 * per-message apply menu — nothing here writes to the editor on its own.
 */
const NoteChatPanel = ({ chat, wiki, onApply, onRunAction, noteActionsEnabled }: NoteChatPanelProps) => {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Follow the stream, the way the main chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages]);

  return (
    <>
      {/* What the next *chat turn* will carry — shown, not guessed at. Labelled explicitly because
          the note actions below ignore it: those always run server-side over the whole saved note. */}
      <div className="flex shrink-0 flex-col gap-y-1.5 border-b border-neutral-800 px-3 py-2">
        <span className="caption-small-medium text-neutral-500">Chat context</span>
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

      <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-y-3 overflow-y-auto p-3">
        {chat.messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-y-2 px-4 text-center text-neutral-600">
            <MessageSquareIcon className="size-7" />
            <p className="caption-regular">Ask about this note. Nothing changes unless you apply it.</p>
          </div>
        )}

        {chat.messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="self-end rounded-lg bg-neutral-800 px-3 py-2 para-small-medium text-white">
              {message.content}
            </div>
          ) : (
            <div key={index} className="group relative">
              <MarkdownBody className="para-small-regular text-neutral-200">
                <Markdown wiki={wiki}>{message.content}</Markdown>
              </MarkdownBody>
              {message.content !== "" && onApply && (
                <ApplyMenu text={message.content} onApply={onApply} />
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-neutral-800 p-2">
        <div className="flex items-end gap-x-1.5 rounded-lg bg-neutral-900 px-2 py-1.5">
          <textarea
            value={chat.input}
            onChange={(e) => chat.setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                chat.send();
              }
            }}
            rows={2}
            placeholder="Ask about this note, or describe an edit…"
            className="chat-scroll min-w-0 flex-1 resize-none bg-transparent para-small-medium outline-none placeholder:text-neutral-500"
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
              onClick={chat.send}
              disabled={!chat.input.trim()}
              aria-label="Send"
              title="Send (Enter)"
              className="shrink-0 cursor-pointer rounded-lg bg-white p-1.5 text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              <CornerDownLeftIcon className="size-3.5" />
            </button>
          )}
        </div>

        {/* The same box feeds both: Enter asks, Rewrite applies it to the note. Summarize and
            Continue need no text and ignore it. Sitting under the composer is what makes that
            second reading discoverable. */}
        <div className="flex items-center gap-x-1 pt-1.5">
          <NoteAction
            label="Rewrite"
            hint={
              noteActionsEnabled
                ? "Apply what you typed to the note"
                : "Save the note first — AI edits run on the saved copy"
            }
            icon={WandSparklesIcon}
            onClick={() => onRunAction("ai-update")}
            disabled={!noteActionsEnabled}
          />
          <NoteAction
            label="Summarize"
            hint="Add or refresh the summary section"
            icon={ListPlusIcon}
            onClick={() => onRunAction("summarize")}
            disabled={!noteActionsEnabled}
          />
          <NoteAction
            label="Continue"
            hint="Continue writing from the end"
            icon={ArrowRightIcon}
            onClick={() => onRunAction("continue")}
            disabled={!noteActionsEnabled}
          />
        </div>
      </div>
    </>
  );
};

/** One note-editing action. Quieter than the send button — these change the note, so they read as secondary. */
const NoteAction = ({
  label,
  hint,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={hint}
    disabled={disabled}
    className={cn(
      "flex flex-1 cursor-pointer items-center justify-center gap-x-1.5 rounded-lg px-2 py-1.5 caption-small-medium",
      "text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white",
      "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
    )}
  >
    <Icon className="size-3.5 shrink-0" />
    {label}
  </button>
);

/**
 * The reply's actions, in one `⋯` menu rather than a row of inline buttons — the convention the
 * sidebar rows follow (see frontend/docs/folder-structure.md § Sidebar list rows), for the same
 * reason: four inline buttons per message would drown the message.
 */
const ApplyMenu = ({ text, onApply }: { text: string; onApply: (mode: NoteApplyMode, text: string) => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label="Apply this reply to the note"
      className={cn(
        "absolute -top-1 right-0 cursor-pointer rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white",
        // Snapped, not faded: transitioning opacity puts the icon on its own layer and renders it blurry.
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
      )}
    >
      <MoreHorizontal className="size-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto min-w-44">
      <DropdownMenuItem onSelect={() => onApply("cursor", text)} className="cursor-pointer px-2 py-1.5 para-small-medium">
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
      <DropdownMenuItem onSelect={() => onApply("append", text)} className="cursor-pointer px-2 py-1.5 para-small-medium">
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
