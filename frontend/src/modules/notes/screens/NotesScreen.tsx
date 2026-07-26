import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowRightIcon,
  CodeIcon,
  ColumnsIcon,
  EyeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HistoryIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  ListIcon,
  ListOrderedIcon,
  ListPlusIcon,
  NotebookPenIcon,
  NotebookTextIcon,
  PanelRightOpenIcon,
  SparklesIcon,
  SquarePenIcon,
  TextQuoteIcon,
  WandSparklesIcon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import { toast } from "@/components/common/toast";
import Markdown from "@/components/common/markdown/Markdown";
import MarkdownBody from "@/components/common/markdown/MarkdownBody";
import NotesBar from "@/modules/notes/components/NotesBar";
import { useNoteAi, type NotesBarCommand } from "@/modules/notes/hooks/useNoteAi";

import { TextareaInput } from "@/components/inputs/TextareaInput";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { upsertNote } from "@/redux/slices/notesListSlice";
import { notesRoute, type NoteDetail, type NoteSummary } from "@/services/operations/notes/notes.route";
import { markDraftCreated } from "@/services/client/loadRoute";
import NoteList from "@/modules/notes/components/NoteList";
import ContextPanel from "@/modules/notes/components/ContextPanel";
import SplitPane from "@/modules/notes/components/SplitPane";
import GraphView from "@/modules/notes/components/GraphView";
import RevisionList from "@/modules/notes/components/RevisionList";
import CommandPalette, { type PaletteCommand } from "@/modules/notes/components/CommandPalette";
import SlashMenu from "@/modules/notes/components/SlashMenu";
import {
  continueListOnEnter,
  indent,
  insertCodeBlock,
  outdent,
  replaceRange,
  setHeading,
  toggleBulletList,
  toggleNumberedList,
  toggleQuote,
  wrapInline,
  type TextAction,
  type TextState,
} from "@/modules/notes/editor/textActions";
import { measureCaret } from "@/modules/notes/editor/caretPosition";
import { useWikiHandlers } from "@/modules/notes/hooks/useWikiHandlers";
import { stripFrontmatter } from "@/modules/notes/utils";
import type { NoteViewMode } from "@/modules/notes/types";
import { HEADING_SCROLL_DELAY_MS, MERMAID_TEMPLATE, type SlashCommand } from "@/modules/notes/constants";
import { NEW_ITEM_ID, ROUTES } from "@/constants/routes";

interface NotesScreenProps {
  /** The explorer list, loaded by the parent `/notes` route. */
  notes: NoteSummary[];
  /** The note named in the URL, loaded by the route loader; null on `/notes` and `/notes/new`. */
  loadedNote: NoteDetail | null;
  /** Notes linking to the open one, loaded alongside it. */
  backlinks: NoteSummary[];
}

/** The explorer row hiding inside a full note — a list row is a strict subset of the detail. */
const summaryOf = (detail: NoteDetail): NoteSummary => ({
  id: detail.id,
  title: detail.title,
  tags: detail.tags,
  updatedAt: detail.updatedAt,
});

/** Obsidian-like three-pane workspace: explorer | editor⟷preview | outline/tags. */
const NotesScreen = ({ notes, loadedNote, backlinks }: NotesScreenProps) => {
  const noteId = useParams().noteId;
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  // `/notes/new` — an editor with no note behind it yet. Like a new chat, it costs no request:
  // the note row is created by its first save, which turns this into `/notes/:id` *without*
  // remounting the screen (same route, see NEW_ITEM_ID).
  const isDraft = noteId === NEW_ITEM_ID;
  // A draft opened from an unresolved `[[link]]` carries the title it should start with.
  const [searchParams] = useSearchParams();
  const draftTitle = isDraft ? searchParams.get("title") : null;

  const { execute: fetchNote } = useApi(notesRoute.getNote);
  const { execute: createNote, loading: creating } = useApi(notesRoute.createNote);
  const { execute: updateNote, loading: saving } = useApi(notesRoute.updateNote);

  const [note, setNote] = useState<NoteDetail | null>(loadedNote);
  const [content, setContent] = useState(loadedNote?.content ?? "");
  const [savedContent, setSavedContent] = useState(loadedNote?.content ?? "");
  const [title, setTitle] = useState(loadedNote?.title ?? "");
  const [savedTitle, setSavedTitle] = useState(loadedNote?.title ?? "");
  const [viewMode, setViewMode] = useState<NoteViewMode>("split");
  const [contextOpen, setContextOpen] = useState(true);
  const [graphOpen, setGraphOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // A palette-issued AI command, run by an effect below (cleared once it has been acknowledged).
  const [aiCommand, setAiCommand] = useState<NotesBarCommand | null>(null);
  // Active `/` block context: where the slash starts, what's typed after it, where the menu sits.
  const [slash, setSlash] = useState<{ start: number; query: string; anchor: { top: number; left: number } } | null>(
    null,
  );
  const previewRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement | null>(null);
  const wiki = useWikiHandlers(notes, note?.embedUrls);

  /** The note already in the buffer — see the seeding effect. */
  const appliedIdRef = useRef<number | null>(loadedNote?.id ?? null);

  /** Puts a server copy of the note into every bit of editor state. */
  const seedFromDetail = (detail: NoteDetail) => {
    appliedIdRef.current = detail.id;
    setNote(detail);
    setContent(detail.content);
    setSavedContent(detail.content);
    setTitle(detail.title);
    setSavedTitle(detail.title);
  };

  /** Applies a fresh detail from the server (save, AI save, restore) to every bit of local state. */
  const applyDetail = (detail: NoteDetail) => {
    seedFromDetail(detail);
    // The explorer row is a subset of what we just got back — patch it (title, tags, and the new
    // updatedAt, which floats the note to the top) rather than refetching the whole list.
    dispatch(upsertNote(summaryOf(detail)));
    setRevisionRefresh((key) => key + 1);
  };

  /** The AI action saved the note server-side — pull the fresh copy (title/tags may have changed). */
  const refetchAfterAi = async () => {
    if (!note) return; // the id, not the param — which is `new` on an unsaved draft
    const res = await fetchNote(note.id);
    if (!res.error) applyDetail(res.response.data);
  };

  const aiInputRef = useRef<HTMLInputElement | null>(null);
  const ai = useNoteAi(note?.id, setContent, refetchAfterAi, setAiBusy);

  const dirty = (note !== null || isDraft) && (content !== savedContent || title !== savedTitle) && !aiBusy;

  // Seed (or clear) the editor whenever the route hands over a different note. Keyed on the id,
  // not the object: a revalidation of the explorer list re-runs the loader and would otherwise
  // overwrite the buffer the user is typing into.
  useEffect(() => {
    const id = loadedNote?.id ?? null;
    if (id !== null && appliedIdRef.current === id) return;
    // `/notes/:id` with nothing from the loader means the draft's first save just relabelled the
    // URL and the loader was deliberately skipped (`markDraftCreated`) — the buffer already holds
    // that note, so clearing it below would throw away what was typed during the round trip.
    if (!isDraft && !loadedNote) return;
    if (loadedNote) {
      seedFromDetail(loadedNote);
      return;
    }
    appliedIdRef.current = null;
    setNote(null);
    setContent(draftTitle ? `# ${draftTitle}\n\n` : "");
    setSavedContent("");
    setTitle(draftTitle ?? "");
    setSavedTitle("");
    // `noteId` is in here, not just the loaded note's id: after the save-hop above the route holds
    // a real id with no loader note, so leaving that note for a fresh `/notes/new` would otherwise
    // look like no change at all and keep the old buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedNote?.id ?? null, draftTitle, noteId]);

  /**
   * New note = an empty draft. Nothing is created until it's saved, so this costs no request —
   * and it no-ops on a blank draft, since re-navigating to the URL we're on reads as a
   * revalidation and would refetch the explorer on every click. (A *seeded* draft, opened from an
   * unresolved `[[link]]`, still clears back to an empty one.)
   */
  const handleCreate = () => {
    if (!isDraft || draftTitle) navigate(ROUTES.NOTES_NEW);
  };

  const handleSave = async () => {
    if (saving || creating || aiBusy) return;
    if (!note) {
      if (!isDraft) return;
      // First save of a draft: the row is born here. The title comes from the content's first
      // heading (or frontmatter), same as any other save.
      const res = await createNote({ content });
      if (res.error) {
        toast.error(res.error.message || "Failed to create note");
        return;
      }
      const detail = res.response.data;
      seedFromDetail(detail);
      dispatch(upsertNote(summaryOf(detail)));
      // Same route, so the editor isn't remounted; the marker also keeps the loader from
      // refetching the note this save just returned.
      markDraftCreated("noteId", detail.id);
      navigate(ROUTES.NOTES_DETAIL(detail.id), { replace: true });
      return;
    }
    const res = await updateNote(note.id, { title, content });
    if (res.error) {
      toast.error(res.error.message || "Failed to save note");
      return;
    }
    applyDetail(res.response.data);
  };

  // Cmd/Ctrl+S saves the active note. The ref always points at the latest save
  // closure so the window listener is attached once.
  const saveRef = useRef(handleSave);
  useEffect(() => {
    saveRef.current = handleSave;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
      // Obsidian-style command palette (Cmd/Ctrl+P, with Cmd/Ctrl+K as the common alias)
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "p" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Scrolls the preview to a heading. Deferred, because the anchor may not be painted yet —
   * the view mode just switched, or the note itself just arrived.
   */
  const scrollToHeading = (heading: string) => {
    if (viewMode === "source") setViewMode("split"); // the anchor lives in the preview
    return setTimeout(() => {
      const container = previewRef.current;
      if (!container) return;
      const wanted = heading.trim().toLowerCase();
      const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
      for (const element of headings) {
        if (element.textContent?.trim().toLowerCase() === wanted) {
          // scrollTo on the pane itself, not scrollIntoView — the latter scrolls EVERY
          // scrollable ancestor, and App's <main> is one, so it would drag the toolbar
          // off-screen by whatever slack the horizontal scrollbar leaves it.
          const top = container.scrollTop + element.getBoundingClientRect().top - container.getBoundingClientRect().top;
          container.scrollTo({ top, behavior: "smooth" });
          break;
        }
      }
    }, HEADING_SCROLL_DELAY_MS);
  };

  // [[Note#Heading]] navigation to ANOTHER note: the heading arrives as router state; once the
  // note's content is in the preview, scroll its matching heading into view. (Headings of the
  // open note scroll straight through `scrollToHeading` — no navigation, no reload.)
  useEffect(() => {
    const heading = (location.state as { heading?: string } | null)?.heading;
    if (!heading || !note) return;
    const timer = scrollToHeading(heading);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, note?.id, savedContent]);

  /**
   * Applies a pure textActions result: new content + restored focus/selection.
   * flushSync so the selection is set on the ALREADY-updated textarea — a
   * deferred restore (rAF) races with fast typing and scrambles the caret.
   */
  const applyTextState = (next: TextState) => {
    flushSync(() => setContent(next.value));
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
  };

  /** Runs a toolbar/shortcut transform against the textarea's live selection. */
  const applyTextAction = (action: TextAction) => {
    const textarea = textareaRef.current;
    if (!textarea || aiBusy) return;
    applyTextState(
      action({ value: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd }),
    );
  };

  /** Opens/updates the slash menu when the caret sits right after a line-start `/query`. */
  const syncSlash = (textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", caret - 1) + 1;
    const match = /^\/([\w-]*)$/.exec(textarea.value.slice(lineStart, caret));
    if (!match) {
      setSlash(null);
      return;
    }
    const pos = measureCaret(textarea, lineStart);
    setSlash({ start: lineStart, query: match[1], anchor: { top: pos.top + pos.lineHeight + 2, left: pos.left } });
  };

  // Execute a command handed down from the Cmd+P palette.
  useEffect(() => {
    if (!aiCommand) return;
    if (aiCommand === "focus") aiInputRef.current?.focus();
    else ai.runAction(aiCommand, () => aiInputRef.current?.focus());
    setAiCommand(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiCommand]);

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    syncSlash(e.target);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash) return; // the open menu's capture listener owns ↑/↓/Enter/Esc
    if (e.key === "Tab") {
      e.preventDefault();
      applyTextAction(e.shiftKey ? outdent : indent);
      return;
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const textarea = e.currentTarget;
      const next = continueListOnEnter({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      });
      if (next) {
        e.preventDefault();
        applyTextState(next);
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      applyTextAction((s) => wrapInline(s, "**"));
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      applyTextAction((s) => wrapInline(s, "*"));
    }
  };

  /** Slash-menu pick: the `/query` range becomes the block snippet. */
  const handleSlashSelect = (command: SlashCommand) => {
    const textarea = textareaRef.current;
    if (!textarea || !slash) return;
    const to = slash.start + 1 + slash.query.length;
    setSlash(null);
    applyTextState(
      replaceRange(
        { value: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd },
        slash.start,
        to,
        command.snippet,
      ),
    );
  };

  const editorPane = (
    <TextareaInput
      ref={textareaRef}
      value={content}
      onChange={handleEditorChange}
      onKeyDown={handleEditorKeyDown}
      onBlur={() => setSlash(null)}
      readOnly={aiBusy}
      placeholder="Write Markdown… (/ for blocks, ---, # headings, > [!note] callouts, $math$)"
      spellCheck={false}
      className="chat-scroll h-full min-h-0 resize-none rounded-none border-none bg-transparent p-4 font-mono text-[13px] leading-relaxed focus:border-none"
    />
  );

  const previewPane = (
    <div ref={previewRef} className="chat-scroll h-full overflow-y-auto p-4">
      <MarkdownBody className="para-regular text-neutral-100">
        <Markdown wiki={wiki}>{stripFrontmatter(content)}</Markdown>
      </MarkdownBody>
    </div>
  );

  /**
   * Everything the Cmd+P palette can do; note-scoped entries appear only with a note
   * open. Built per render (tiny array) — no memo, so the ref-closing AI handlers
   * stay plain event handlers.
   */
  const buildPaletteCommands = (): PaletteCommand[] => {
    const insertSnippet = (snippet: string) => setContent((current) => current + snippet);
    const commands: PaletteCommand[] = [
      { id: "new-note", label: "New note", icon: SquarePenIcon, run: handleCreate },
      {
        id: "graph",
        label: graphOpen ? "Close graph view" : "Open graph view",
        icon: WaypointsIcon,
        run: () => setGraphOpen((open) => !open),
      },
    ];
    if (note) {
      commands.push(
        { id: "view-source", label: "View: source only", icon: CodeIcon, run: () => setViewMode("source") },
        { id: "view-split", label: "View: split", icon: ColumnsIcon, run: () => setViewMode("split") },
        { id: "view-preview", label: "View: preview only", icon: EyeIcon, run: () => setViewMode("preview") },
        {
          id: "toggle-context",
          label: contextOpen ? "Hide context panel" : "Show context panel",
          icon: PanelRightOpenIcon,
          run: () => setContextOpen((open) => !open),
        },
        {
          id: "toggle-history",
          label: historyOpen ? "Hide revision history" : "Show revision history",
          icon: HistoryIcon,
          run: () => setHistoryOpen((open) => !open),
        },
        {
          id: "insert-mermaid",
          label: "Insert Mermaid diagram",
          hint: "```mermaid",
          icon: WaypointsIcon,
          run: () => insertSnippet(MERMAID_TEMPLATE),
        },
        // Line formatting — applies to the editor's current line/selection.
        {
          id: "fmt-h1",
          label: "Format: Heading 1",
          hint: "#",
          icon: Heading1Icon,
          run: () => applyTextAction((s) => setHeading(s, 1)),
        },
        {
          id: "fmt-h2",
          label: "Format: Heading 2",
          hint: "##",
          icon: Heading2Icon,
          run: () => applyTextAction((s) => setHeading(s, 2)),
        },
        {
          id: "fmt-h3",
          label: "Format: Heading 3",
          hint: "###",
          icon: Heading3Icon,
          run: () => applyTextAction((s) => setHeading(s, 3)),
        },
        {
          id: "fmt-bullet",
          label: "Format: Bullet list",
          hint: "-",
          icon: ListIcon,
          run: () => applyTextAction(toggleBulletList),
        },
        {
          id: "fmt-numbered",
          label: "Format: Numbered list",
          hint: "1.",
          icon: ListOrderedIcon,
          run: () => applyTextAction(toggleNumberedList),
        },
        {
          id: "fmt-quote",
          label: "Format: Quote",
          hint: ">",
          icon: TextQuoteIcon,
          run: () => applyTextAction(toggleQuote),
        },
        {
          id: "fmt-code",
          label: "Format: Code block",
          hint: "```",
          icon: CodeIcon,
          run: () => applyTextAction(insertCodeBlock),
        },
        {
          id: "fmt-indent",
          label: "Format: Indent",
          hint: "Tab",
          icon: IndentIncreaseIcon,
          run: () => applyTextAction(indent),
        },
        {
          id: "fmt-outdent",
          label: "Format: Outdent",
          hint: "⇧Tab",
          icon: IndentDecreaseIcon,
          run: () => applyTextAction(outdent),
        },
        {
          id: "ai-rewrite",
          label: "AI: rewrite with instruction…",
          icon: WandSparklesIcon,
          run: () => setAiCommand("focus"),
        },
        { id: "ai-summarize", label: "AI: summarize note", icon: ListPlusIcon, run: () => setAiCommand("summarize") },
        { id: "ai-continue", label: "AI: continue writing", icon: ArrowRightIcon, run: () => setAiCommand("continue") },
        { id: "ai-focus", label: "Focus AI instruction bar", icon: SparklesIcon, run: () => setAiCommand("focus") },
      );
    }
    notes.forEach((item) => {
      commands.push({
        id: `open-${item.id}`,
        label: item.title,
        hint: "Open note",
        icon: NotebookTextIcon,
        run: () => navigate(ROUTES.NOTES_DETAIL(item.id)),
      });
    });
    return commands;
  };

  const renderCenterSection = () => {
    if (graphOpen) {
      return (
        <>
          <div className="flex h-11.5 shrink-0 items-center gap-x-2 border-b border-neutral-800 px-4 pt-2 pb-2">
            <WaypointsIcon className="size-4.5 text-neutral-400" />
            <h1 className="para-medium-semibold">Graph view</h1>
            <button
              type="button"
              onClick={() => setGraphOpen(false)}
              aria-label="Close graph view"
              className="ml-auto cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
            >
              <XIcon className="size-4.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <GraphView notes={notes} />
          </div>
        </>
      );
    }

    if (note || isDraft) {
      return (
        <>
          <NotesBar
            ai={ai}
            aiInputRef={aiInputRef}
            hasNote={note !== null}
            dirty={dirty}
            saving={saving}
            viewMode={viewMode}
            setViewMode={setViewMode}
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            historyBtnRef={historyBtnRef}
            contextOpen={contextOpen}
            setContextOpen={setContextOpen}
            setGraphOpen={setGraphOpen}
            onSave={handleSave}
          />

          <div className="relative min-h-0 flex-1">
            <SlashMenu
              anchor={slash?.anchor ?? null}
              query={slash?.query ?? ""}
              onSelect={handleSlashSelect}
              onClose={() => setSlash(null)}
            />
            {historyOpen && note && (
              <RevisionList
                noteId={note.id}
                refreshKey={revisionRefresh}
                onRestored={(detail) => {
                  applyDetail(detail);
                  setHistoryOpen(false);
                }}
                onClose={() => setHistoryOpen(false)}
                excludeRef={historyBtnRef}
              />
            )}
            {viewMode === "source" && editorPane}
            {viewMode === "preview" && previewPane}
            {viewMode === "split" && <SplitPane left={editorPane} right={previewPane} />}
          </div>
        </>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-y-3 text-neutral-500">
        <NotebookPenIcon className="size-10" />
        <p className="para-small-medium">Select a note or create a new one</p>
        <button
          type="button"
          onClick={() => setGraphOpen(true)}
          className="flex cursor-pointer items-center gap-x-2 rounded-lg border border-neutral-800 px-3 py-1.5 para-small-medium text-neutral-300 hover:bg-neutral-800"
        >
          <WaypointsIcon className="size-4" />
          Graph view
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      {/* eslint-disable-next-line react-hooks/refs -- the Format entries only touch textareaRef inside their run() callbacks (event time, not render) */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={buildPaletteCommands()} />
      <NoteList notes={notes} onCreate={handleCreate} creating={creating} />

      {/* Center — toolbar + editor⟷preview (or the graph view) */}
      <section className="flex h-full min-w-0 flex-1 flex-col">{renderCenterSection()}</section>

      {(note || isDraft) && contextOpen && (
        <ContextPanel
          backlinks={backlinks}
          content={content}
          tags={note?.tags ?? []}
          onWikiClick={wiki.onLinkClick}
          onHeadingClick={scrollToHeading}
        />
      )}
    </div>
  );
};

export default NotesScreen;
