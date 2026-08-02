import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FileText, Folder, FolderPlus, SquarePenIcon } from "lucide-react";
import MainNavbar from "@/components/common/MainNavbar";
import { sidebarNavRow, sidebarShell, sidebarShellInner } from "@/components/common/sidebar";
import { toast } from "@/components/common/toast";
import { NEW_ITEM_ID, ROUTES } from "@/constants/routes";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { removeDiagram, upsertDiagram } from "@/redux/slices/diagramListSlice";
import { removeDiagramFolder, upsertDiagramFolder } from "@/redux/slices/diagramFolderListSlice";
import {
  expandFolder,
  forgetFolders,
  revealFolders,
  toggleDiagramsSection,
  toggleFolderExpanded,
  toggleFoldersSection,
} from "@/redux/slices/diagramSidebarSlice";
import SidebarSection from "@/components/common/SidebarSection";
import SidebarToggle from "@/components/common/SidebarToggle";
import DiagramTree, { type DragItem } from "@/modules/diagram/components/DiagramTree";
import { ancestorIds, childFolders, descendantIds, diagramsIn, isDescendant } from "@/modules/diagram/utils/folderTree";
import {
  diagramsRoute,
  type DiagramDetail,
  type DiagramFolderSummary,
  type DiagramSummary,
} from "@/services/operations/diagrams/diagrams.route";
import { markDraftCreated } from "@/services/client/loadRoute";
import { cn } from "@/lib/utils";

// Lazy: the editor carries the Excalidraw runtime + styles.
const DiagramEditor = lazy(() => import("@/modules/diagram/components/DiagramEditor"));

/** The list row hiding inside a full diagram — a row is a strict subset of the detail. */
const summaryOf = (detail: DiagramDetail): DiagramSummary => ({
  id: detail.id,
  title: detail.title,
  // Must be carried: `upsertItem` merges the payload over the row, so dropping this would clear
  // the diagram's folder on every autosave.
  folderId: detail.folderId,
  updatedAt: detail.updatedAt,
});

interface DiagramsScreenProps {
  diagrams: DiagramSummary[];
  folders: DiagramFolderSummary[];
  /** The diagram named in the URL; null on `/diagrams` and `/diagrams/new`. */
  diagram: DiagramDetail | null;
}

/** Diagram tree + Excalidraw editor. New diagrams start from an empty scene, at the root level. */
const DiagramsScreen = ({ diagrams, folders, diagram }: DiagramsScreenProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // `/diagrams/new` — an empty canvas with no row behind it. Like a new chat, it costs no
  // request: the diagram is created by its first autosave, which turns this into `/diagrams/:id`
  // *without* remounting the screen (same route, see NEW_ITEM_ID).
  const diagramId = useParams().diagramId;
  const isDraft = diagramId === NEW_ITEM_ID;

  const { execute: deleteDiagram } = useApi(diagramsRoute.deleteDiagram);
  const { execute: moveDiagram } = useApi(diagramsRoute.moveDiagram);
  const { execute: createFolder } = useApi(diagramsRoute.createDiagramFolder);
  const { execute: renameFolder } = useApi(diagramsRoute.renameDiagramFolder);
  const { execute: moveFolder } = useApi(diagramsRoute.moveDiagramFolder);
  const { execute: deleteFolder } = useApi(diagramsRoute.deleteDiagramFolder);

  // Which folders/sections are open lives in Redux: this screen is remounted by the first
  // navigation into a diagram, which would otherwise snap every open folder shut. See the slice.
  const { expandedFolderIds, showDiagrams, showFolders } = useAppSelector((state) => state.diagramSidebar);
  const expanded = useMemo(() => new Set(expandedFolderIds), [expandedFolderIds]);

  // The dragged row. A ref rather than `dataTransfer`, whose payload is unreadable during
  // `dragover` — and that is exactly when a folder drop has to be judged valid or not.
  const dragRef = useRef<DragItem | null>(null);
  // The same value as state, purely so the source row can dim while it is being dragged. This is
  // set once per gesture — the preview's *position* is deliberately not state (see `moveDragPreview`).
  // Local, like the chat and notes screens: `/diagrams` and `/diagrams/:id` are separate route
  // entries, so opening the first diagram remounts this and resets to open — the wanted default.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragPos = useRef({ x: 0, y: 0 });

  /**
   * Moves the drag preview by writing to the node directly.
   *
   * `drag` fires ~60×/s, and routing that through state re-rendered the whole tree on every frame —
   * which is what made releasing the mouse feel like it stuck. One state change per gesture, and
   * the position never touches React.
   */
  const moveDragPreview = (x: number, y: number) => {
    // Chrome reports (0, 0) on the last `drag` event of a gesture; taking it would fling the
    // preview into the corner for a frame.
    if (x === 0 && y === 0) return;
    dragPos.current = { x, y };
    const node = previewRef.current;
    if (node !== null) {
      node.style.left = `${x + 12}px`;
      node.style.top = `${y + 12}px`;
    }
  };

  // The id a draft was born as. The editor reads its scene once per mount, so it must keep the
  // key it was mounted under — remounting it onto `/diagrams/:id` mid-drawing would reset
  // Excalidraw's scene and undo history.
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftGen, setDraftGen] = useState(0);
  // On that hop the loader is skipped (`markDraftCreated`), so the URL names a diagram the loader
  // never fetched — the editor holds it, and it is what the list should highlight.
  const showingDraftId = draftId !== null && diagramId === String(draftId);
  const openId = diagram?.id ?? (showingDraftId ? draftId : null);
  const editorKey = diagram === null || showingDraftId ? `new-${draftGen}` : diagram.id;

  /**
   * New diagram = an empty draft canvas. A no-op when one is already open: re-navigating to the
   * URL we're on reads as a revalidation and would refetch the list on every click.
   */
  const create = () => {
    if (isDraft) return;
    // Forget the diagram the last draft became and bump the key, or the canvas would be reused
    // as-is and the new draft would open on the previous drawing.
    setDraftId(null);
    setDraftGen((n) => n + 1);
    navigate(ROUTES.DIAGRAMS_NEW);
  };

  /** The draft's first autosave created it — give it a real URL (`onSaved` already listed it). */
  const handleCreated = (id: number) => {
    setDraftId(id);
    // Same route, so the canvas isn't remounted; the marker also keeps the loader from refetching
    // the scene the autosave just wrote.
    markDraftCreated("diagramId", id);
    navigate(ROUTES.DIAGRAMS_DETAIL(id), { replace: true });
  };

  /**
   * Open the chain of folders leading to the diagram named in the URL, so arriving by reload or by
   * a `[[Title.diagram]]` link shows it in place instead of hiding it inside collapsed parents.
   *
   * Keyed on the diagram's id, not on `folders`: that array's identity changes on every autosave,
   * and re-running would force folders back open each time the user collapsed one.
   */
  const revealedFor = useRef<number | null>(null);
  useEffect(() => {
    if (diagram === null || revealedFor.current === diagram.id) return;
    revealedFor.current = diagram.id;
    const chain = ancestorIds(folders, diagram.folderId);
    if (chain.length > 0) dispatch(revealFolders(chain));
  }, [diagram, folders, dispatch]);

  const remove = async (id: number) => {
    const res = await deleteDiagram(id);
    // The server refuses to delete a diagram a note still links to, and says which note — pass
    // that through rather than replacing it with a generic failure.
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    dispatch(removeDiagram(id));
    if (openId === id) navigate(ROUTES.DIAGRAMS);
  };

  const toggleFolder = (id: number) => dispatch(toggleFolderExpanded(id));

  const addFolder = async () => {
    // Always at the root — nest it by dragging. The sidebar has no notion of a "current" folder.
    const res = await createFolder("New folder", null);
    if (res.error) {
      toast.error("Failed to create folder");
      return;
    }
    dispatch(upsertDiagramFolder(res.response.data));
  };

  const rename = async (id: number, name: string) => {
    const res = await renameFolder(id, name);
    if (res.error) {
      toast.error("Failed to rename folder");
      return;
    }
    dispatch(upsertDiagramFolder(res.response.data));
  };

  /**
   * All-or-nothing on the server: a subtree holding a diagram some note links to is refused whole,
   * with a message naming the note. On success the cascade already happened server-side, so prune
   * the same subtree locally instead of refetching.
   */
  const removeFolder = async (id: number) => {
    const res = await deleteFolder(id);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    const gone = descendantIds(folders, id);
    const goneDiagramIds = diagrams.filter((d) => d.folderId !== null && gone.has(d.folderId)).map((d) => d.id);
    gone.forEach((folderId) => dispatch(removeDiagramFolder(folderId)));
    goneDiagramIds.forEach((diagramId) => dispatch(removeDiagram(diagramId)));
    dispatch(forgetFolders([...gone]));
    if (openId !== null && goneDiagramIds.includes(openId)) navigate(ROUTES.DIAGRAMS);
  };

  /** A folder can't be dropped into itself or anything beneath it — that would strand the branch. */
  const canDropInto = (folderId: number) => {
    const item = dragRef.current;
    if (item === null) return false;
    return item.kind === "diagram" || !isDescendant(folders, folderId, item.id);
  };

  const dropInto = async (folderId: number | null) => {
    const item = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    setDropTarget(null);
    setRootDragOver(false);
    if (item === null) return;

    // Open the target, or the row just dropped would vanish into a collapsed folder.
    if (folderId !== null) dispatch(expandFolder(folderId));

    // Moves apply locally first and roll back if the server refuses. Awaiting the round-trip
    // before redrawing left the row sitting under the cursor after the drop — the drag felt like
    // it stuck on release.
    if (item.kind === "diagram") {
      const moved = diagrams.find((d) => d.id === item.id);
      if (moved === undefined || moved.folderId === folderId) return;
      dispatch(upsertDiagram({ id: item.id, folderId }));
      const res = await moveDiagram(item.id, folderId);
      if (res.error) {
        dispatch(upsertDiagram({ id: item.id, folderId: moved.folderId }));
        toast.error("Failed to move diagram");
      }
    } else {
      const moved = folders.find((f) => f.id === item.id);
      if (moved === undefined || moved.parentId === folderId) return;
      if (folderId !== null && isDescendant(folders, folderId, item.id)) return;
      dispatch(upsertDiagramFolder({ id: item.id, parentId: folderId }));
      const res = await moveFolder(item.id, folderId);
      if (res.error) {
        dispatch(upsertDiagramFolder({ id: item.id, parentId: moved.parentId }));
        toast.error("Failed to move folder");
      }
    }
  };

  // The root level, split across the two sections below.
  const rootDiagrams = diagramsIn(diagrams, null);
  const rootFolders = childFolders(folders, null);

  // Both sections render the same tree, filtered to one kind of row.
  const treeProps = {
    folders,
    diagrams,
    parentId: null,
    depth: 0,
    openId,
    expanded,
    onToggle: toggleFolder,
    onOpenDiagram: (id: number) => navigate(ROUTES.DIAGRAMS_DETAIL(id)),
    onDeleteDiagram: remove,
    onRenameFolder: rename,
    onDeleteFolder: removeFolder,
    dragRef,
    dragging,
    onDragging: (item: DragItem | null) => {
      setDragging(item);
      // Every gesture ends here, however it ended — the one place highlights are guaranteed to
      // be cleared.
      if (item === null) {
        setDropTarget(null);
        setRootDragOver(false);
      }
    },
    onDragMove: moveDragPreview,
    dropTarget,
    // Claiming a folder also releases the gutter. Folder blocks stop propagation, so the sidebar's
    // clear-everything handler never runs while the cursor is over one — without this the left
    // hairline stayed lit after the cursor had moved off it and onto a folder.
    onDropTarget: (folderId: number | null) => {
      setDropTarget(folderId);
      setRootDragOver(false);
    },
    onDropInto: dropInto,
    canDropInto,
  };

  /** What the cursor is carrying, for the preview that stands in for the native drag ghost. */
  const draggingLabel =
    dragging === null
      ? null
      : dragging.kind === "diagram"
        ? (diagrams.find((d) => d.id === dragging.id)?.title ?? null)
        : (folders.find((f) => f.id === dragging.id)?.name ?? null);

  /**
   * True only while something is in flight that could actually land at the root — a row already at
   * the top level arms nothing, so its own drag can't produce a pointless no-op move.
   */
  const rootDropArmed =
    dragging === null
      ? false
      : dragging.kind === "diagram"
        ? (diagrams.find((d) => d.id === dragging.id)?.folderId ?? null) !== null
        : (folders.find((f) => f.id === dragging.id)?.parentId ?? null) !== null;

  // One toggle, rendered into whichever main-pane header is showing — never into the sidebar
  // itself, which would take the button with it when it closes.
  const sidebarToggle = (
    <SidebarToggle isOpen={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} label="diagram sidebar" />
  );

  return (
    <div className="flex h-full min-w-minContent overflow-hidden bg-grey text-white">
      {/* The drag preview. The native ghost is suppressed because browsers rasterize it at 1x —
          always blurry on a HiDPI screen — so this real element follows the cursor instead. */}
      {draggingLabel !== null && (
        <div
          // A callback ref, not `style` — the position lives in a ref, and reading it during
          // render is exactly the stale-value trap the lint rule guards. This runs at commit,
          // before paint, so the preview never appears at the previous gesture's coordinates.
          ref={(node) => {
            previewRef.current = node;
            if (node !== null) {
              node.style.left = `${dragPos.current.x + 12}px`;
              node.style.top = `${dragPos.current.y + 12}px`;
            }
          }}
          className="pointer-events-none fixed z-50 flex max-w-60 items-center gap-x-2 rounded-lg bg-neutral-800 px-2 py-1.5 para-small-medium text-white shadow-lg ring-1 ring-neutral-600"
        >
          {dragging?.kind === "folder" ? (
            <Folder className="size-4 shrink-0 text-neutral-400" />
          ) : (
            <FileText className="size-4 shrink-0 text-neutral-400" />
          )}
          <span className="truncate">{draggingLabel}</span>
        </div>
      )}

      {/* ── List ── */}
      <aside
        // Accept the drag anywhere in the sidebar, and do nothing with it. A release over ground
        // that never called `preventDefault` makes Chrome animate the drag back to its origin and
        // hold `dragend` until that finishes — which is the lag on letting go. Real drop targets
        // stop propagation and act; this only removes the snap-back.
        onDragOver={(e) => {
          e.preventDefault();
          // Reached only over dead space — folder blocks and the gutter stop propagation — so this
          // is the cursor having left every drop target.
          setDropTarget(null);
          setRootDragOver(false);
        }}
        onDrop={(e) => e.preventDefault()}
        className={sidebarShell(sidebarOpen, ["relative", sidebarOpen && "border-r border-neutral-800"])}
      >
        <div className={sidebarShellInner(sidebarOpen)}>
          <MainNavbar />
          <div className="flex h-11.5 shrink-0 items-center gap-x-1 px-2">
            <button type="button" onClick={create} className={sidebarNavRow(false, "flex-1 text-white")}>
              <SquarePenIcon className="size-4.5" />
              New diagram
            </button>
            <button
              type="button"
              onClick={addFolder}
              aria-label="New folder"
              title="New folder"
              className="shrink-0 cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white"
            >
              <FolderPlus className="size-4.5" />
            </button>
          </div>
          {/* The way out to the top level, for a folder as much as a diagram: drag to the far left
            edge, the way VS Code's explorer un-nests. A gutter rather than a banner — it costs no
            layout, never covers a row's label, and reads as "outdent" instead of as a button.

            It exists only while something nested is in flight, so it can't swallow a stray release,
            and it is overlaid, since appearing mid-gesture must not shift the list under the cursor. */}
          {rootDropArmed && (
            <div
              onDragOver={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setRootDragOver(true);
                setDropTarget(null);
              }}
              onDrop={(e) => {
                e.stopPropagation();
                e.preventDefault();
                dropInto(null);
              }}
              title="Drop here to move to the top level"
              className="absolute inset-y-0 left-0 z-20 w-4"
            >
              {/* The visible cue: a hairline down the edge that thickens and brightens on approach.
                Snapped, not eased — a transition here reads as the highlight lagging the cursor. */}
              <div className={cn("h-full", rootDragOver ? "w-1 bg-neutral-300" : "w-px bg-neutral-700")} />
            </div>
          )}
          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {/* Loose diagrams first — the ones you reach for — then the folders holding the rest.
              The two sections partition the list: a diagram appears in exactly one of them. */}
            <SidebarSection
              label="Diagrams"
              count={rootDiagrams.length}
              open={showDiagrams}
              onToggle={() => dispatch(toggleDiagramsSection())}
              emptyLabel="No top-level diagrams"
            >
              <DiagramTree {...treeProps} only="diagrams" />
            </SidebarSection>

            <SidebarSection
              label="Folders"
              count={rootFolders.length}
              open={showFolders}
              onToggle={() => dispatch(toggleFoldersSection())}
              emptyLabel="No folders yet"
            >
              <DiagramTree {...treeProps} only="folders" />
            </SidebarSection>
          </div>
        </div>
      </aside>

      {/* ── Editor ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {diagram !== null || isDraft || showingDraftId ? (
          <Suspense fallback={<span className="p-4 caption-small-regular text-neutral-500">Loading canvas…</span>}>
            <DiagramEditor
              key={editorKey}
              diagram={diagram}
              onCreated={handleCreated}
              onSaved={(saved) => dispatch(upsertDiagram(summaryOf(saved)))}
              leading={sidebarToggle}
            />
          </Suspense>
        ) : (
          <>
            {/* Matches the editor's toolbar height so the toggle sits in the same place either way. */}
            <div className="flex h-11.5 shrink-0 items-center border-b border-neutral-800 px-2 pt-2 pb-2">
              {sidebarToggle}
            </div>
            <div className="flex flex-1 items-center justify-center caption-small-regular text-neutral-500">
              Select or create a diagram
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default DiagramsScreen;
