import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  ArrowRightIcon,
  CodeIcon,
  ColumnsIcon,
  EyeIcon,
  HistoryIcon,
  ListPlusIcon,
  NotebookPenIcon,
  NotebookTextIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SaveIcon,
  SparklesIcon,
  SquarePenIcon,
  WandSparklesIcon,
  WaypointsIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react";
import { toast } from "@/components/common/toast";
import Markdown from "@/components/common/Markdown";
import { TextareaInput } from "@/components/inputs/TextareaInput";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { upsertNote } from "@/redux/slices/notesSlice";
import { notesRoute, type NoteDetail } from "@/services/operations/notes/notes.route";
import NoteList from "@/modules/notes/components/NoteList";
import ContextPanel from "@/modules/notes/components/ContextPanel";
import SplitPane from "@/modules/notes/components/SplitPane";
import GraphView from "@/modules/notes/components/GraphView";
import AiBar, { type AiBarCommand } from "@/modules/notes/components/AiBar";
import RevisionList from "@/modules/notes/components/RevisionList";
import CommandPalette, { type PaletteCommand } from "@/modules/notes/components/CommandPalette";
import { useWikiHandlers } from "@/modules/notes/hooks/useWikiHandlers";
import { stripFrontmatter } from "@/modules/notes/utils";
import type { NoteViewMode } from "@/modules/notes/types";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const MERMAID_TEMPLATE = "\n```mermaid\ngraph TD\n  A[Start] --> B[Next]\n```\n";
const REACTFLOW_TEMPLATE =
  '\n```reactflow-json\n{\n  "nodes": [\n    { "id": "a", "label": "Start", "position": { "x": 0, "y": 0 } },\n    { "id": "b", "label": "Next", "position": { "x": 200, "y": 100 } }\n  ],\n  "edges": [{ "source": "a", "target": "b" }]\n}\n```\n';

const VIEW_MODES: { mode: NoteViewMode; label: string; icon: typeof CodeIcon }[] = [
  { mode: "source", label: "Source only", icon: CodeIcon },
  { mode: "split", label: "Split view", icon: ColumnsIcon },
  { mode: "preview", label: "Preview only", icon: EyeIcon },
];

/** Obsidian-like three-pane workspace: explorer | editor⟷preview | outline/tags. */
const NotesScreen = () => {
  const noteId = useParams().noteId;
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const allNotes = useAppSelector((state) => state.notes.notes);

  const { execute: fetchNote } = useApi(notesRoute.getNote);
  const { execute: createNote, loading: creating } = useApi(notesRoute.createNote);
  const { execute: updateNote, loading: saving } = useApi(notesRoute.updateNote);

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [viewMode, setViewMode] = useState<NoteViewMode>("split");
  const [contextOpen, setContextOpen] = useState(true);
  const [graphOpen, setGraphOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // A palette-issued AI command, handed to the AiBar via props (acknowledged when run).
  const [aiCommand, setAiCommand] = useState<AiBarCommand | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const wiki = useWikiHandlers();

  const dirty = note !== null && content !== savedContent && !aiBusy;

  /** Applies a fresh detail from the server (AI save, restore) to every bit of local state. */
  const applyDetail = (detail: NoteDetail) => {
    setNote(detail);
    setContent(detail.content);
    setSavedContent(detail.content);
    dispatch(upsertNote({ id: detail.id, title: detail.title, tags: detail.tags, updatedAt: detail.updatedAt }));
    setRevisionRefresh((key) => key + 1);
  };

  /** The AI action saved the note server-side — pull the fresh copy (title/tags may have changed). */
  const refetchAfterAi = async () => {
    if (!noteId) return;
    const res = await fetchNote(Number(noteId));
    if (!res.error) applyDetail(res.response.data);
  };

  // Load (or reset) the note when the route param changes.
  useEffect(() => {
    if (!noteId) {
      setNote(null);
      setContent("");
      setSavedContent("");
      return;
    }
    (async () => {
      const res = await fetchNote(Number(noteId));
      if (res.error) {
        toast.error("Failed to load note");
        navigate(ROUTES.NOTES);
        return;
      }
      const detail = res.response.data;
      setNote(detail);
      setContent(detail.content);
      setSavedContent(detail.content);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const handleCreate = async () => {
    const res = await createNote({ content: "" });
    if (res.error) {
      toast.error("Failed to create note");
      return;
    }
    const detail = res.response.data;
    dispatch(upsertNote({ id: detail.id, title: detail.title, tags: detail.tags, updatedAt: detail.updatedAt }));
    navigate(ROUTES.NOTES_DETAIL(detail.id));
  };

  const handleSave = async () => {
    if (!note || saving || aiBusy) return;
    const res = await updateNote(note.id, { content });
    if (res.error) {
      toast.error(res.error.message || "Failed to save note");
      return;
    }
    const detail = res.response.data;
    setNote(detail);
    setSavedContent(content);
    dispatch(upsertNote({ id: detail.id, title: detail.title, tags: detail.tags, updatedAt: detail.updatedAt }));
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

  // [[Note#Heading]] navigation: the heading arrives as router state; once the note's
  // content is in the preview, scroll its matching heading into view.
  useEffect(() => {
    const heading = (location.state as { heading?: string } | null)?.heading;
    if (!heading || !note) return;
    if (viewMode === "source") setViewMode("split"); // the anchor lives in the preview
    const timer = setTimeout(() => {
      const wanted = heading.trim().toLowerCase();
      const headings = previewRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? [];
      for (const element of headings) {
        if (element.textContent?.trim().toLowerCase() === wanted) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
      }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, note?.id, savedContent]);

  const editorPane = (
    <TextareaInput
      value={content}
      onChange={(e) => setContent(e.target.value)}
      readOnly={aiBusy}
      placeholder="Write Markdown… (---, # headings, > [!note] callouts, $math$)"
      spellCheck={false}
      className="chat-scroll h-full min-h-0 resize-none rounded-none border-none bg-transparent p-4 font-mono text-[13px] leading-relaxed focus:border-none"
    />
  );

  const previewPane = (
    <div ref={previewRef} className="chat-scroll h-full overflow-y-auto p-4">
      <div className="chat-markdown wrap-break-word para-regular text-neutral-100">
        <Markdown wiki={wiki}>{stripFrontmatter(content)}</Markdown>
      </div>
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
        {
          id: "insert-reactflow",
          label: "Insert React Flow diagram",
          hint: "```reactflow-json",
          icon: WorkflowIcon,
          run: () => insertSnippet(REACTFLOW_TEMPLATE),
        },
        { id: "ai-rewrite", label: "AI: rewrite with instruction…", icon: WandSparklesIcon, run: () => setAiCommand("focus") },
        { id: "ai-summarize", label: "AI: summarize note", icon: ListPlusIcon, run: () => setAiCommand("summarize") },
        { id: "ai-continue", label: "AI: continue writing", icon: ArrowRightIcon, run: () => setAiCommand("continue") },
        { id: "ai-focus", label: "Focus AI instruction bar", icon: SparklesIcon, run: () => setAiCommand("focus") },
      );
    }
    allNotes.forEach((item) => {
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

  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={buildPaletteCommands()} />
      <NoteList onCreate={handleCreate} creating={creating} />

      {/* Center — toolbar + editor⟷preview (or the graph view) */}
      <section className="flex h-full min-w-0 flex-1 flex-col">
        {graphOpen ? (
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
              <GraphView />
            </div>
          </>
        ) : note ? (
          <>
            <div className="flex h-11.5 shrink-0 items-center gap-x-2 border-b border-neutral-800 px-4 pt-2 pb-2">
              <h1 className="min-w-0 truncate para-medium-semibold">{note.title}</h1>
              {dirty && <span className="size-2 shrink-0 rounded-full bg-amber-400" title="Unsaved changes" />}
              <div className="ml-auto flex shrink-0 items-center gap-x-1">
                <button
                  type="button"
                  onClick={() => setGraphOpen(true)}
                  aria-label="Open graph view"
                  title="Graph view"
                  className="mr-1 cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
                >
                  <WaypointsIcon className="size-4.5" />
                </button>
                <div className="mr-2 flex items-center rounded-lg bg-neutral-900 p-0.5">
                  {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      aria-label={label}
                      title={label}
                      className={cn(
                        "cursor-pointer rounded-md px-2 py-1.5 text-neutral-400 transition-colors hover:text-white",
                        viewMode === mode && "bg-neutral-700 text-white",
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  aria-label="Save note"
                  title="Save (⌘S)"
                  className={cn(
                    "flex cursor-pointer items-center gap-x-1.5 rounded-lg px-2.5 py-1.5 para-small-medium transition-colors",
                    dirty && !saving
                      ? "bg-white text-black hover:bg-neutral-200"
                      : "cursor-not-allowed bg-neutral-800 text-neutral-500",
                  )}
                >
                  <SaveIcon className="size-4" />
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-label="Revision history"
                  title="Revision history"
                  className={cn(
                    "cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800",
                    historyOpen && "bg-neutral-800 text-white",
                  )}
                >
                  <HistoryIcon className="size-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setContextOpen((open) => !open)}
                  aria-label="Toggle context panel"
                  className="cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
                >
                  {contextOpen ? (
                    <PanelRightCloseIcon className="size-4.5" />
                  ) : (
                    <PanelRightOpenIcon className="size-4.5" />
                  )}
                </button>
              </div>
            </div>

            <AiBar
              noteId={note.id}
              pendingCommand={aiCommand}
              onCommandHandled={() => setAiCommand(null)}
              onContent={setContent}
              onSaved={refetchAfterAi}
              onBusyChange={setAiBusy}
            />

            <div className="relative min-h-0 flex-1">
              {historyOpen && (
                <RevisionList
                  noteId={note.id}
                  refreshKey={revisionRefresh}
                  onRestored={(detail) => {
                    applyDetail(detail);
                    setHistoryOpen(false);
                  }}
                />
              )}
              {viewMode === "source" && editorPane}
              {viewMode === "preview" && previewPane}
              {viewMode === "split" && <SplitPane left={editorPane} right={previewPane} />}
            </div>
          </>
        ) : (
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
        )}
      </section>

      {note && contextOpen && (
        <ContextPanel noteId={note.id} content={content} tags={note.tags} onWikiClick={wiki.onLinkClick} />
      )}
    </div>
  );
};

export default NotesScreen;
