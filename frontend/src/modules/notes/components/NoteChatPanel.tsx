import { memo, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLineIcon,
  CheckIcon,
  ClipboardIcon,
  CornerDownLeftIcon,
  MessageSquareIcon,
  MoreHorizontal,
  ReplaceIcon,
  SquareIcon,
  TextCursorInputIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import Markdown, { MarkdownBody, type WikiHandlers } from "@/components/common/Markdown";
import ModelSelector from "@/components/common/ModelSelector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useNoteAi } from "@/modules/notes/hooks/useNoteAi";
import type { useNoteChat } from "@/modules/notes/hooks/useNoteChat";
import type { NoteApplyMode, NoteChatContextMode, NoteChatMessage } from "@/modules/notes/types";
import { MIN_THREAD_HEIGHT, PROPOSAL_DEFAULT_HEIGHT, PROPOSAL_MIN_HEIGHT } from "@/modules/notes/constants";
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

/** What the composer does on Enter. One box, one send key, this picks the destination. */
type ComposerMode = "ask" | "update";

const COMPOSER_MODES: { mode: ComposerMode; label: string; hint: string }[] = [
  { mode: "ask", label: "Ask", hint: "Answer from the note — nothing changes" },
  { mode: "update", label: "Update", hint: "Rewrite the note — you review it before it lands" },
];

interface NoteChatPanelProps {
  chat: ReturnType<typeof useNoteChat>;
  /** Owns the model picked for this tab — both the chat and the note actions run on it. */
  ai: ReturnType<typeof useNoteAi>;
  /** Makes `[[links]]` in replies clickable, same as the preview pane. */
  wiki: WikiHandlers;
  /** Writes a reply into the editor. */
  onApply: ((mode: NoteApplyMode, text: string) => void) | null;
  /** Runs the note update with whatever is in the composer. */
  onRunAction: () => void;
  /** Replaces the whole note with the staged proposal. */
  onApplyProposal: () => void;
  /** False on an unsaved draft or mid-generation: the update needs a saved note and a free model. */
  noteActionsEnabled: boolean;
}

/**
 * Chat about the open note, and propose edits to it. Neither half writes to the editor on its own:
 * a chat reply lands only through the per-message apply menu, and an update lands only when its
 * staged proposal is applied.
 */
const NoteChatPanel = ({
  chat,
  ai,
  wiki,
  onApply,
  onRunAction,
  onApplyProposal,
  noteActionsEnabled,
}: NoteChatPanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** The proposal + composer + mode tabs block — its height is what the drag ceiling is measured from. */
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [proposalHeight, setProposalHeight] = useState(PROPOSAL_DEFAULT_HEIGHT);
  const [mode, setMode] = useState<ComposerMode>("ask");

  /**
   * Which half the composer drives. `update` is gated on the same condition as the action itself,
   * so a draft can't be left in a mode whose send button is permanently dead.
   */
  const updating = mode === "update" && noteActionsEnabled;
  const busy = updating ? ai.busy : chat.busy;
  const submit = () => {
    // Enter is inert while this half is generating — the send button is a Stop button by then, and
    // without the guard the key still fired a fresh turn behind it.
    if (busy) return;
    if (updating) onRunAction();
    else chat.send();
  };

  /**
   * Drags the proposal block's top edge, so the block grows upward under the cursor.
   *
   * Tracked as a **delta** from where the grab started. The obvious form — height = (block bottom −
   * cursor) — is off by the block's own chrome (handle, header, Apply/Discard footer), because the
   * height being set is the scroll body's alone: the first mousemove jumped the top edge ~70px
   * before it started following the cursor.
   *
   * The ceiling is **measured**, not budgeted: the bottom container minus the body is exactly what
   * the composer and mode tabs occupy, whatever they currently are, so growing either of them can't
   * put them back under the rail's clip.
   */
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current?.getBoundingClientRect().height;
    const bottomBlock = bottomRef.current?.getBoundingClientRect().height;
    if (panel === undefined || bottomBlock === undefined) return;
    const startY = e.clientY;
    const startHeight = proposalHeight;
    const max = Math.max(PROPOSAL_MIN_HEIGHT, panel - (bottomBlock - startHeight) - MIN_THREAD_HEIGHT);
    // Without this the gesture selects the text it drags over, which flickers the whole thread.
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const onMouseMove = (event: MouseEvent) => {
      setProposalHeight(Math.min(max, Math.max(PROPOSAL_MIN_HEIGHT, startHeight + (startY - event.clientY))));
    };
    const onMouseUp = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // The same ceiling, re-applied when the panel shrinks under a proposal that was already tall —
  // dragging the rail narrower or resizing the window re-creates the clipping with no drag at all.
  useEffect(() => {
    const panel = panelRef.current;
    const bottom = bottomRef.current;
    if (!panel || !bottom) return;
    const observer = new ResizeObserver(() => {
      setProposalHeight((current) => {
        const max = Math.max(
          PROPOSAL_MIN_HEIGHT,
          panel.getBoundingClientRect().height - (bottom.getBoundingClientRect().height - current) - MIN_THREAD_HEIGHT,
        );
        return Math.min(current, max);
      });
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={panelRef} className="flex min-h-0 flex-1 flex-col">
      {/* How much of the note the next Enter works on — for *both* halves of the tab. Ask carries
          it as context; Update rewrites exactly that much of the note and leaves the rest alone.
          "None" is the one asymmetry: an edit with no note to edit is meaningless, so Update reads
          it as "Auto" and the button says so instead of pretending otherwise. */}
      <div className="flex shrink-0 flex-col gap-y-1.5 border-b border-neutral-800 px-3 py-2">
        <span className="caption-small-medium text-neutral-500">Context</span>
        <div className="flex items-center rounded-lg bg-neutral-900 p-0.5">
          {CONTEXT_MODES.map(({ mode, label }) => {
            const inert = mode === "none" && updating;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => chat.setContextMode(mode)}
                disabled={inert}
                title={inert ? "Update needs the note — pick Auto or Whole note" : undefined}
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-2 py-1 caption-small-medium text-neutral-400 transition-colors hover:text-white",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-neutral-400",
                  chat.contextMode === mode && !inert && "bg-neutral-700 text-white",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* Keyed on the active mode, so this is always what Enter will really do — the old panel
            showed a selection count next to an Update that then rewrote the whole note anyway. */}
        <span className="truncate caption-small-regular text-neutral-500">
          {updating ? `Update will rewrite: ${chat.updateScopeLabel}` : chat.contextLabel}
        </span>
      </div>

      <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-y-3 overflow-y-auto p-3">
        <ChatThread messages={chat.messages} wiki={wiki} onApply={onApply} />
      </div>

      <div ref={bottomRef} className="shrink-0 border-t border-neutral-800 p-2">
        {/* The staged update. It sits above the composer, between the thread and the button that
            produced it, so the review step is unmissable — the note itself is untouched until
            Apply. Capped and scrollable: a proposal is a whole note and would otherwise eat the
            rail. */}
        {ai.proposal !== null && (
          <div className="mb-2 flex flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
            {/* Drag the top edge to grow the review area — a whole note rarely fits in the default
                height, and the thread above it is the cheapest space to borrow. */}
            <div
              onMouseDown={handleResizeMouseDown}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize the proposed note"
              className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center"
            >
              <span className="h-0.5 w-8 rounded-full bg-neutral-700 transition-colors group-hover:bg-neutral-500" />
            </div>
            <div className="flex shrink-0 items-center gap-x-2 border-b border-neutral-800 px-2.5 pb-1.5">
              <WandSparklesIcon className={cn("size-3.5 shrink-0 text-neutral-400", ai.busy && "animate-pulse")} />
              <span className="caption-small-medium text-neutral-300">
                {ai.target
                  ? ai.busy
                    ? "Writing proposed replacement…"
                    : "Proposed replacement"
                  : ai.busy
                    ? "Writing proposed note…"
                    : "Proposed note"}
              </span>
            </div>
            <div style={{ height: proposalHeight }} className="chat-scroll overflow-y-auto px-2.5 py-2">
              {ai.proposal === "" ? (
                <span className="caption-small-regular text-neutral-500">Generating…</span>
              ) : (
                <MarkdownBody className="para-small-regular text-neutral-200">
                  <Markdown wiki={wiki}>{ai.proposal}</Markdown>
                </MarkdownBody>
              )}
            </div>
            {/* Apply replaces the note in the editor and leaves it unsaved, so it is still one ⌘Z
                (and one un-saved close) away from being undone. */}
            <div className="flex shrink-0 items-center gap-x-1 border-t border-neutral-800 p-1.5">
              <ProposalAction
                label="Apply to note"
                hint={
                  ai.target
                    ? "Replace the selected text with this — you still have to save"
                    : "Replace the note with this — you still have to save"
                }
                icon={CheckIcon}
                onClick={onApplyProposal}
                disabled={ai.busy || ai.proposal === ""}
                primary
              />
              <ProposalAction
                label="Discard"
                hint="Throw this away; the note is unchanged"
                icon={XIcon}
                onClick={ai.clearProposal}
                disabled={ai.busy}
              />
            </div>
          </div>
        )}

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
            placeholder={updating ? "Describe the edit to make…" : "Ask about this note…"}
            // Capped so a long instruction scrolls inside the box rather than growing it into the
            // thread; the drag ceiling measures this row, so the cap is what keeps that honest too.
            className="chat-scroll max-h-40 min-w-0 flex-1 resize-none bg-transparent para-small-medium outline-none placeholder:text-neutral-500"
          />
          {busy ? (
            <button
              type="button"
              onClick={updating ? ai.stop : chat.stop}
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
              aria-label={updating ? "Update the note" : "Send"}
              title={updating ? "Update the note (Enter)" : "Send (Enter)"}
              className="shrink-0 cursor-pointer rounded-lg bg-white p-1.5 text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              <CornerDownLeftIcon className="size-3.5" />
            </button>
          )}
        </div>

        {/* One box, one send key — this picks where Enter sends it. A mode switch rather than a
            second button: the two are mutually exclusive, and the old pair let you press the wrong
            one without noticing which of them had consumed your text. The model this tab runs on
            rides along at the right: it governs both halves, and as a chip it costs the rail a
            corner instead of the full row a name needs. */}
        <div className="mt-1.5 flex items-center gap-x-1.5">
          <div
            role="radiogroup"
            aria-label="What Enter does"
            className="flex min-w-0 flex-1 items-center rounded-lg bg-neutral-900 p-0.5"
          >
            {COMPOSER_MODES.map(({ mode: value, label, hint }) => {
              // Update needs a saved note; offering it on a draft would arm a dead send button.
              const locked = value === "update" && !noteActionsEnabled;
              // Keyed on `updating`, not `mode`, so the highlight always shows what Enter will
              // really do — opening a draft while "Update" is picked falls back to Ask, and this
              // says so.
              const active = (value === "update") === updating;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(value)}
                  disabled={busy || locked}
                  title={locked ? "Save the note first — AI edits run on the saved copy" : hint}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-x-1.5 rounded-md px-2 py-1 caption-small-medium",
                    "text-neutral-400 transition-colors hover:text-white",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-neutral-400",
                    active && "bg-neutral-700 text-white",
                  )}
                >
                  {value === "update" ? (
                    <WandSparklesIcon className="size-3.5 shrink-0" />
                  ) : (
                    <MessageSquareIcon className="size-3.5 shrink-0" />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          <ModelSelector
            value={ai.activeSelection}
            onChange={ai.setSelected}
            disabled={ai.busy}
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
  /** Makes `[[links]]` in replies clickable, same as the preview pane. */
  wiki: WikiHandlers;
  /** Writes a reply into the editor; null while an AI action owns the buffer. */
  onApply: ((mode: NoteApplyMode, text: string) => void) | null;
}

/**
 * The message thread — split out so a turn (which only changes `chat.messages`) doesn't repaint
 * markdown for replies nobody touched, and so composer/proposal-panel-local state changes in the
 * parent (mode switches, resizing the proposal) don't re-render the thread at all.
 */
const ChatThread = memo(function ChatThread({ messages, wiki, onApply }: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Follow the stream, the way the main chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <>
      {messages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-y-2 px-4 text-center text-neutral-600">
          <MessageSquareIcon className="size-7" />
          <p className="caption-regular">Ask about this note. Nothing changes unless you apply it.</p>
        </div>
      )}

      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={index} className="self-end rounded-lg bg-neutral-800 px-3 py-2 para-small-medium text-white">
            {message.content}
          </div>
        ) : (
          <div key={index} className="group relative">
            <MarkdownBody className="para-small-regular text-neutral-200">
              <Markdown wiki={wiki}>{message.content}</Markdown>
            </MarkdownBody>
            {message.content !== "" && onApply && <ApplyMenu text={message.content} onApply={onApply} />}
          </div>
        ),
      )}
      <div ref={endRef} />
    </>
  );
});

/** Accept or reject the staged proposal. Apply is the primary of the pair; Discard reads as an out. */
const ProposalAction = ({
  label,
  hint,
  icon: Icon,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  hint: string;
  icon: typeof CheckIcon;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={hint}
    disabled={disabled}
    className={cn(
      "flex flex-1 cursor-pointer items-center justify-center gap-x-1.5 rounded-md px-2 py-1.5 caption-small-medium",
      "transition-colors disabled:cursor-not-allowed disabled:opacity-40",
      primary
        ? "bg-white text-black hover:bg-neutral-200 disabled:hover:bg-white"
        : "text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:hover:bg-transparent",
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
