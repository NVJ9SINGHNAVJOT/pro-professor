import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
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
  MessageSquareIcon,
  NotebookPenIcon,
  NotebookTextIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightOpenIcon,
  SquarePenIcon,
  TextQuoteIcon,
  WandSparklesIcon,
  WaypointsIcon,
} from "lucide-react";
import { toast } from "@/components/common/toast";
import Markdown, { MarkdownBody } from "@/components/common/Markdown";
import NotesBar from "@/modules/notes/components/NotesBar";
import { useNoteAi } from "@/modules/notes/hooks/useNoteAi";

import NoteEditor from "@/modules/notes/components/NoteEditor";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { upsertNote } from "@/redux/slices/notesListSlice";
import { setGraphRenderer } from "@/redux/slices/notesGraphSlice";
import { notesRoute, type NoteDetail, type NoteSummary } from "@/services/operations/notes/notes.route";
import { markDraftCreated } from "@/services/client/loadRoute";
import NoteList from "@/modules/notes/components/NoteList";
import SidebarToggle from "@/components/common/SidebarToggle";
import ContextPanel from "@/modules/notes/components/ContextPanel";
import RightRail from "@/modules/notes/components/RightRail";
import NoteChatPanel from "@/modules/notes/components/NoteChatPanel";
import { useNoteChat } from "@/modules/notes/hooks/useNoteChat";
import SplitPane from "@/modules/notes/components/SplitPane";
import GraphView from "@/modules/notes/components/GraphView";
import NotesGraphHeader from "@/modules/notes/components/NotesGraphHeader";
import RevisionList from "@/modules/notes/components/RevisionList";
import CommandPalette, { type PaletteCommand } from "@/modules/notes/components/CommandPalette";
import SlashMenu from "@/modules/notes/components/SlashMenu";
import {
  changedRange,
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
import { lintMarkdown } from "@/modules/notes/editor/lintMarkdown";
import { useWikiHandlers } from "@/modules/notes/hooks/useWikiHandlers";
import { stripFrontmatter } from "@/modules/notes/utils";
import type { NoteApplyMode, NoteRightPanel, NoteViewMode } from "@/modules/notes/types";
import {
  HEADING_SCROLL_DELAY_MS,
  MERMAID_TEMPLATE,
  SCROLL_SYNC_RELEASE_MS,
  type SlashCommand,
} from "@/modules/notes/constants";
import { NEW_ITEM_ID, ROUTES } from "@/constants/routes";

interface NotesScreenProps {
  /** The explorer list, loaded by the parent `/notes` route. */
  notes: NoteSummary[];
  /** The note named in the URL, loaded by the route loader; null on `/notes` and `/notes/new`. */
  loadedNote: NoteDetail | null;
  /** Notes linking to the open one, loaded alongside it. */
  backlinks: NoteSummary[];
}

/** Stable empty-tags reference so a tagless note doesn't hand ContextPanel a new array every render. */
const EMPTY_TAGS: string[] = [];

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

  const { execute: createNote, loading: creating } = useApi(notesRoute.createNote);
  const { execute: updateNote, loading: saving } = useApi(notesRoute.updateNote);
  const { execute: renameNote } = useApi(notesRoute.renameNote);

  const [note, setNote] = useState<NoteDetail | null>(loadedNote);
  const [content, setContent] = useState(loadedNote?.content ?? "");
  const [savedContent, setSavedContent] = useState(loadedNote?.content ?? "");
  const [title, setTitle] = useState(loadedNote?.title ?? "");
  const [savedTitle, setSavedTitle] = useState(loadedNote?.title ?? "");
  // An existing note is opened to be read, so it lands in preview; a draft has nothing to read yet,
  // so it lands in split. The seeding effect below re-applies this whenever the route hands over a
  // different note — until then a manual toggle stands.
  const [viewMode, setViewMode] = useState<NoteViewMode>(isDraft ? "split" : "preview");
  const [rightPanel, setRightPanel] = useState<NoteRightPanel>("context");
  // Explorer collapse. Local state, matching the chat screen — `/notes` and `/notes/:noteId` are
  // two route entries, so opening the first note remounts this screen and resets it. That's the
  // wanted default there (nothing to preserve when no note is open yet) and it's what chat does.
  const [noteListOpen, setNoteListOpen] = useState(true);
  const toggleNoteList = useCallback(() => setNoteListOpen((open) => !open), []);
  // The graph view is a mode, so it stays local and resets on the remount — but *which renderer* it
  // shows, and everything that renderer has been arranged into, is persisted. See notesGraphSlice.
  const [graphOpen, setGraphOpen] = useState(false);
  const graphRenderer = useAppSelector((state) => state.notesGraph.renderer);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // A palette-issued AI command, run by an effect below (cleared once it has been acknowledged).
  // The editor's selected text, mirrored into state because the chat panel *displays* what it will
  // send — a ref read during render wouldn't update when the selection changes.
  const [selectedText, setSelectedText] = useState("");
  // Active `/` block context: where the slash starts, what's typed after it, where the menu sits.
  // A null `anchor` means the trigger is still live but its line is scrolled out of view, so the
  // menu isn't shown — see repositionSlash.
  const [slash, setSlash] = useState<{
    start: number;
    query: string;
    anchor: { top: number; left: number; lineHeight: number } | null;
  } | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Which pane currently owns a split-view scroll gesture (see syncScroll), and its release timer. */
  const scrollDriverRef = useRef<"editor" | "preview" | null>(null);
  const scrollReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement | null>(null);
  const wiki = useWikiHandlers(notes, note?.embedUrls);

  /** The note already in the buffer — see the seeding effect. */
  const appliedIdRef = useRef<number | null>(loadedNote?.id ?? null);

  /** Puts a server copy of the note into every bit of editor state. */
  const seedFromDetail = useCallback((detail: NoteDetail) => {
    appliedIdRef.current = detail.id;
    setNote(detail);
    setContent(detail.content);
    setSavedContent(detail.content);
    setTitle(detail.title);
    setSavedTitle(detail.title);
  }, []);

  /** Applies a fresh detail from the server (save, AI save, restore) to every bit of local state. */
  const applyDetail = useCallback(
    (detail: NoteDetail) => {
      seedFromDetail(detail);
      // The explorer row is a subset of what we just got back — patch it (title, tags, and the new
      // updatedAt, which floats the note to the top) rather than refetching the whole list.
      dispatch(upsertNote(summaryOf(detail)));
      setRevisionRefresh((key) => key + 1);
    },
    [seedFromDetail, dispatch],
  );

  const ai = useNoteAi(note?.id);
  const chat = useNoteChat({ noteId: note?.id, content, selection: ai.activeSelection, selectedText });

  const dirty = (note !== null || isDraft) && (content !== savedContent || title !== savedTitle);

  // Markdown mistakes that render as something else instead of failing. Memoized against the
  // buffer: this screen re-renders on every chat token too, and none of that changes the note.
  const problems = useMemo(() => lintMarkdown(content, wiki.linkExists), [content, wiki]);

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
      setViewMode("preview");
      return;
    }
    appliedIdRef.current = null;
    setNote(null);
    setContent(draftTitle ? `# ${draftTitle}\n\n` : "");
    setSavedContent("");
    setTitle(draftTitle ?? "");
    setSavedTitle("");
    // A blank draft is there to be written in, not read.
    setViewMode("split");
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
  const handleCreate = useCallback(() => {
    if (!isDraft || draftTitle) navigate(ROUTES.NOTES_NEW);
  }, [isDraft, draftTitle, navigate]);

  /** @returns whether the note is now persisted — false on a refused or failed save. */
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (saving || creating) return false;
    if (!note) {
      if (!isDraft) return false;
      // First save of a draft: the row is born here. A blank title lands as "Untitled"
      // server-side, and a frontmatter `title:` still wins — same as any other save.
      const res = await createNote({ title, content });
      if (res.error) {
        toast.error(res.error.message || "Failed to create note");
        return false;
      }
      const detail = res.response.data;
      seedFromDetail(detail);
      dispatch(upsertNote(summaryOf(detail)));
      // Same route, so the editor isn't remounted; the marker also keeps the loader from
      // refetching the note this save just returned.
      markDraftCreated("noteId", detail.id);
      navigate(ROUTES.NOTES_DETAIL(detail.id), { replace: true });
      return true;
    }
    // Content only — the title has its own request, and the server keeps the current one when a
    // save doesn't carry it.
    const res = await updateNote(note.id, { content });
    if (res.error) {
      toast.error(res.error.message || "Failed to save note");
      return false;
    }
    applyDetail(res.response.data);
    return true;
  }, [
    saving,
    creating,
    note,
    isDraft,
    title,
    content,
    createNote,
    dispatch,
    navigate,
    updateNote,
    seedFromDetail,
    applyDetail,
  ]);

  /**
   * Commits a rename from the toolbar — a request of its own, so an unsaved buffer stays unsaved.
   * Only the title (and the explorer row) moves; the content, revisions and backlinks don't.
   */
  const handleRenameTitle = useCallback(
    async (next: string) => {
      // A draft has no row to rename yet; the typed title rides along on its first save.
      if (!note) {
        setTitle(next);
        return;
      }
      const res = await renameNote(note.id, next);
      if (res.error) {
        toast.error(res.error.message || "Failed to rename note");
        setTitle(savedTitle);
        return;
      }
      const detail = res.response.data;
      setNote(detail);
      // The server's copy, which may carry a "… 2" suffix from a title clash.
      setTitle(detail.title);
      setSavedTitle(detail.title);
      dispatch(upsertNote(summaryOf(detail)));
    },
    [note, savedTitle, renameNote, dispatch],
  );
  const handleRenameTitleVoid = useCallback((next: string) => void handleRenameTitle(next), [handleRenameTitle]);

  /**
   * Runs an AI action against the note — saving it first when the buffer is dirty.
   *
   * The server builds its prompt from the note in the database, not from this buffer, so running
   * one over unsaved edits would rewrite a version of the note the user isn't looking at.
   */
  const runAiAction = async () => {
    if (dirty && !(await handleSave())) return;
    // The AI tab's composer is the single input: what's typed there is the update instruction,
    // and it's cleared only once generation has actually started.
    if (ai.runAction(chat.input)) chat.setInput("");
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
      // ⌘K belongs to the global search modal (see App.tsx); the palette keeps ⌘P.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
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
  const scrollToHeading = useCallback(
    (heading: string) => {
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
            const top =
              container.scrollTop + element.getBoundingClientRect().top - container.getBoundingClientRect().top;
            container.scrollTo({ top, behavior: "smooth" });
            break;
          }
        }
      }, HEADING_SCROLL_DELAY_MS);
    },
    [viewMode],
  );

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
   * Keeps the preview at roughly the same place in the note as the editor, and back — in split
   * view the two panes otherwise drift apart and the preview stops being usable as a reference for
   * what you're typing. Proportional rather than heading-anchored: far less machinery, and close
   * enough at note length.
   *
   * The driver lock is what stops a feedback loop — scrolling the target fires its own scroll
   * event, which would drive the source straight back.
   */
  const syncScroll = useCallback((driver: "editor" | "preview") => {
    if (scrollDriverRef.current && scrollDriverRef.current !== driver) return;
    // In source-only / preview-only the other pane isn't rendered, so its ref is null and this
    // no-ops on its own — no need to check the view mode.
    const source = driver === "editor" ? textareaRef.current : previewRef.current;
    const target = driver === "editor" ? previewRef.current : textareaRef.current;
    if (!source || !target) return;

    scrollDriverRef.current = driver;
    if (scrollReleaseRef.current) clearTimeout(scrollReleaseRef.current);
    scrollReleaseRef.current = setTimeout(() => {
      scrollDriverRef.current = null;
    }, SCROLL_SYNC_RELEASE_MS);

    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) return;
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
  }, []);

  /**
   * Selects a problem's line in the editor and centers it — the Problems list's click target.
   * The counterpart to `scrollToHeading`, which moves the *preview*: a problem is a fact about
   * the source, so the caret has to land on the line that has to be fixed.
   */
  const jumpToLine = useCallback(
    (line: number) => {
      const focusLine = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const lines = textarea.value.split("\n");
        const start = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
        textarea.focus();
        textarea.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
        // measureCaret reports against the border box (scroll already subtracted), so adding the
        // scroll back gives the line's offset within the content.
        const caret = measureCaret(textarea, start);
        textarea.scrollTop = Math.max(0, textarea.scrollTop + caret.top - textarea.clientHeight / 2);
      };
      if (viewMode !== "preview") {
        focusLine();
        return;
      }
      // Preview-only doesn't render the editor at all — switch first, then wait for the paint.
      setViewMode("split");
      setTimeout(focusLine, HEADING_SCROLL_DELAY_MS);
    },
    [viewMode],
  );

  /**
   * Applies a pure textActions result: new content + restored focus/selection.
   *
   * The edit goes in through `execCommand("insertText")` rather than `setContent`, because a
   * controlled textarea makes React *assign* `.value` — and assigning `.value` from script wipes
   * the browser's native undo stack. That is what left Cmd+Z with nothing to restore after a
   * Tab-indent, and took the typing history before it down as well. An execCommand edit is
   * recorded like a user edit instead: one undo step per transform, earlier history intact. React's
   * own `onChange` fires from it, so `content` still tracks the textarea.
   *
   * Only the span that actually changed is rewritten (`changedRange`), so indenting three lines
   * doesn't re-type the whole note into a single undo entry.
   */
  const applyTextState = useCallback((next: TextState) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent(next.value);
      return;
    }
    textarea.focus();
    const { start, end, text } = changedRange(textarea.value, next.value);
    if (start !== end || text !== "") {
      textarea.setSelectionRange(start, end);
      // insertText can't express a pure deletion (outdent, unwrapping a marker); `delete` can, and
      // is only ever reached with a non-empty selection, so it can't eat a character on its own.
      const written = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
      // No execCommand (or it refused): correctness over undo — flushSync so the selection below
      // still lands on the ALREADY-updated textarea, since a deferred restore races with typing.
      if (!written) flushSync(() => setContent(next.value));
    }
    textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
  }, []);

  /** Runs a toolbar/shortcut transform against the textarea's live selection. */
  const applyTextAction = useCallback(
    (action: TextAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      applyTextState(
        action({
          value: textarea.value,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
        }),
      );
    },
    [applyTextState],
  );

  /**
   * Writes a chat reply into the note. The note goes dirty like any other edit — saving stays the
   * user's call, so an applied reply is undoable with the editor's own history before it is ever
   * persisted.
   */
  const applyChatReply = useCallback(
    (mode: NoteApplyMode, text: string) => {
      const textarea = textareaRef.current;
      // Preview-only doesn't render the editor, so there is no caret or selection to land on —
      // appending is the only honest option, and there is no textarea to write it through. Switch
      // to split so the result is visible either way.
      if (!textarea) {
        if (viewMode === "preview") setViewMode("split");
        setContent((current) => `${current.trimEnd()}\n\n${text}\n`);
        return;
      }
      const state = {
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      };
      // Appending is a replace of the note's trailing whitespace — routed through applyTextState
      // like every other insert so it lands on the undo stack rather than wiping it.
      if (mode === "append") {
        applyTextState(replaceRange(state, state.value.trimEnd().length, state.value.length, `\n\n${text}\n`));
        return;
      }
      // "Insert at cursor" is the zero-width case of "replace selection".
      const to = mode === "selection" ? state.selectionEnd : state.selectionStart;
      applyTextState(replaceRange(state, state.selectionStart, to, text));
    },
    [viewMode, applyTextState],
  );

  /**
   * Accepts the AI's staged proposal: the whole note is replaced, and that's it — the buffer goes
   * dirty like any hand edit, so saving stays the user's call and ⌘Z still walks it back. This is
   * the only path by which an AI update reaches the note; the server never writes one.
   */
  const applyProposal = () => {
    if (ai.proposal === null) return;
    const proposal = ai.proposal;
    ai.clearProposal();
    const textarea = textareaRef.current;
    // Preview-only renders no editor, so there is no textarea to write through — same fallback as
    // applyChatReply, and switching to split makes the result visible either way.
    if (!textarea) {
      if (viewMode === "preview") setViewMode("split");
      setContent(proposal);
      return;
    }
    // Routed through applyTextState (execCommand) rather than setContent: assigning .value on a
    // controlled textarea wipes the browser's native undo stack, which would make Apply the one
    // edit in this editor that ⌘Z can't take back.
    applyTextState(
      replaceRange(
        { value: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd },
        0,
        textarea.value.length,
        proposal,
      ),
    );
  };

  /**
   * The slash menu is placed in the pane's coordinate space, but the caret it points at moves when
   * the editor scrolls — without this the menu stays put while the text slides out from under it.
   *
   * Scrolling the line out of view drops the *anchor*, not the trigger: the menu stops rendering
   * (and with it stops capturing ↑/↓/Enter, which would otherwise be swallowed by a menu nobody can
   * see) while the typed `/query` stays exactly as written, so scrolling back brings it straight
   * back. Deleting the `/` instead would throw away text the user may well have meant literally.
   */
  const repositionSlash = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !slash) return;
    const pos = measureCaret(textarea, slash.start);
    if (pos.top + pos.lineHeight < 0 || pos.top > textarea.clientHeight) {
      // Already hidden — don't re-render on every scroll tick.
      if (slash.anchor) setSlash({ ...slash, anchor: null });
      return;
    }
    setSlash({ ...slash, anchor: { top: pos.top, left: pos.left, lineHeight: pos.lineHeight } });
  }, [slash]);

  /** Opens/updates the slash menu when the caret sits right after a line-start `/query`. */
  const syncSlash = useCallback((textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", caret - 1) + 1;
    const match = /^\/([\w-]*)$/.exec(textarea.value.slice(lineStart, caret));
    if (!match) {
      setSlash(null);
      return;
    }
    // The caret line's own box — SlashMenu decides which side of it the menu goes on.
    const pos = measureCaret(textarea, lineStart);
    setSlash({
      start: lineStart,
      query: match[1],
      anchor: { top: pos.top, left: pos.left, lineHeight: pos.lineHeight },
    });
  }, []);

  const handleEditorChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      syncSlash(e.target);
    },
    [syncSlash],
  );

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    },
    [slash, applyTextAction, applyTextState],
  );

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

  // Fires on every caret move, but only a real change to the *selected text* re-renders —
  // moving the caret leaves it "" both times.
  const handleEditorSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const next = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    setSelectedText((current) => (current === next ? current : next));
  }, []);

  const handleEditorBlur = useCallback(() => setSlash(null), []);

  const handleEditorScroll = useCallback(() => {
    syncScroll("editor");
    repositionSlash();
  }, [syncScroll, repositionSlash]);

  const editorPane = (
    <NoteEditor
      ref={textareaRef}
      value={content}
      problems={problems}
      onChange={handleEditorChange}
      onKeyDown={handleEditorKeyDown}
      onSelect={handleEditorSelect}
      onBlur={handleEditorBlur}
      onScroll={handleEditorScroll}
      placeholder="Write Markdown… (/ for blocks, ---, # headings, > [!note] callouts, $math$)"
      spellCheck={false}
    />
  );

  const previewPane = (
    <div ref={previewRef} onScroll={() => syncScroll("preview")} className="chat-scroll h-full overflow-y-auto p-4">
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
      {
        id: "toggle-explorer",
        label: noteListOpen ? "Collapse note explorer" : "Expand note explorer",
        icon: noteListOpen ? PanelLeftCloseIcon : PanelLeftOpenIcon,
        run: toggleNoteList,
      },
    ];
    if (note) {
      commands.push(
        { id: "view-source", label: "View: source only", icon: CodeIcon, run: () => setViewMode("source") },
        { id: "view-split", label: "View: split", icon: ColumnsIcon, run: () => setViewMode("split") },
        { id: "view-preview", label: "View: preview only", icon: EyeIcon, run: () => setViewMode("preview") },
        {
          id: "toggle-context",
          label: rightPanel === "context" ? "Hide context panel" : "Show context panel",
          icon: PanelRightOpenIcon,
          run: () => setRightPanel(rightPanel === "context" ? null : "context"),
        },
        {
          id: "toggle-ai-panel",
          label: rightPanel === "ai" ? "Hide AI panel" : "Open AI panel",
          icon: MessageSquareIcon,
          run: () => setRightPanel(rightPanel === "ai" ? null : "ai"),
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
          id: "ai-update",
          label: "AI: update note with an instruction…",
          hint: "Opens the AI tab",
          icon: WandSparklesIcon,
          run: () => setRightPanel("ai"),
        },
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
          <NotesGraphHeader
            noteListOpen={noteListOpen}
            onToggleNoteList={toggleNoteList}
            graphRenderer={graphRenderer}
            onGraphRendererChange={(renderer) => dispatch(setGraphRenderer(renderer))}
            onClose={() => setGraphOpen(false)}
          />
          <div className="min-h-0 flex-1">
            <GraphView notes={notes} currentNoteId={note?.id ?? null} onClose={() => setGraphOpen(false)} />
          </div>
        </>
      );
    }

    if (note || isDraft) {
      return (
        <>
          <NotesBar
            aiBusy={ai.busy}
            onStopAi={ai.stop}
            hasNote={note !== null}
            title={title}
            setTitle={setTitle}
            savedTitle={savedTitle}
            onRenameTitle={handleRenameTitleVoid}
            dirty={dirty}
            saving={saving}
            viewMode={viewMode}
            setViewMode={setViewMode}
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            historyBtnRef={historyBtnRef}
            rightPanel={rightPanel}
            setRightPanel={setRightPanel}
            noteListOpen={noteListOpen}
            onToggleNoteList={toggleNoteList}
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
      <>
        {/* Same top band as the other two states, so the explorer toggle never disappears. */}
        <div className="flex h-11.5 shrink-0 items-center border-b border-neutral-800 px-2 pt-2 pb-2">
          <SidebarToggle isOpen={noteListOpen} onToggle={toggleNoteList} label="note explorer" />
        </div>
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
      </>
    );
  };

  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      {/* eslint-disable-next-line react-hooks/refs -- the Format entries only touch textareaRef inside their run() callbacks (event time, not render) */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={buildPaletteCommands()} />
      <NoteList notes={notes} onCreate={handleCreate} creating={creating} isOpen={noteListOpen} />

      {/* Center — toolbar + editor⟷preview (or the graph view) */}
      <section className="flex h-full min-w-0 flex-1 flex-col">{renderCenterSection()}</section>

      {(note || isDraft) && rightPanel !== null && (
        <RightRail
          active={rightPanel}
          onSelect={setRightPanel}
          onClose={() => setRightPanel(null)}
          problemCount={problems.length}
          context={
            <ContextPanel
              backlinks={backlinks}
              content={content}
              tags={note?.tags ?? EMPTY_TAGS}
              problems={problems}
              onWikiClick={wiki.onLinkClick}
              onHeadingClick={scrollToHeading}
              onProblemClick={jumpToLine}
            />
          }
          ai={
            // No apply target while an AI action owns the buffer: it's read-only and a refetch
            // is on its way that would discard whatever was inserted.
            <NoteChatPanel
              chat={chat}
              ai={ai}
              wiki={wiki}
              onApply={applyChatReply}
              onRunAction={() => void runAiAction()}
              onApplyProposal={applyProposal}
              // The note actions edit the saved row, so they need one — unlike the chat half,
              // which works on a draft straight from the buffer.
              noteActionsEnabled={note !== null && !ai.busy}
            />
          }
        />
      )}
    </div>
  );
};

export default NotesScreen;
