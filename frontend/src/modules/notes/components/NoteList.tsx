import { memo, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  HashIcon,
  PencilLineIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";
import { NavLink, useParams } from "react-router";
import InlineRename from "@/components/common/InlineRename";
import MainNavbar from "@/components/common/MainNavbar";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import SidebarSection from "@/components/common/SidebarSection";
import {
  SIDEBAR_ICON_SLOT,
  SIDEBAR_LIST,
  SIDEBAR_ROW_WRAPPER,
  sidebarIndent,
  sidebarNavRow,
  sidebarRow,
  sidebarShell,
  sidebarShellInner,
} from "@/components/common/sidebar";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import {
  expandFolder,
  toggleFolderExpanded,
  toggleFoldersSection,
  toggleNotesSection,
  toggleTagExpanded,
  toggleTagsSection,
} from "@/redux/slices/notesSidebarSlice";
import NoteTree, { type DragItem } from "@/modules/notes/components/NoteTree";
import { useNoteFolders } from "@/modules/notes/hooks/useNoteFolders";
import { type NoteFolderSummary, type NoteSummary } from "@/services/operations/notes/notes.route";
import { ROUTES } from "@/constants/routes";
import { byName, childFolders, isDescendant, itemsIn, rowKey, type PendingRow } from "@/utils/folderTree";
import { cn } from "@/lib/utils";

interface NoteListProps {
  /** The explorer list, loaded by the parent `/notes` route. */
  notes: NoteSummary[];
  /** The explorer's folders, from the same response. */
  folders: NoteFolderSummary[];
  /**
   * New note at the root level — the toolbar button's draft, which costs no request until it is
   * saved. A folder's own "New note" doesn't come through here: that one creates immediately, so
   * the row shows up inside the folder that was right-clicked (see `pending`).
   */
  onCreate: () => void;
  creating: boolean;
  /**
   * Renames a note. Lives on the screen, not here: the note may be the one open in the editor,
   * whose own title state has to follow.
   */
  onRename: (id: number, title: string) => void;
  /**
   * Collapsed, the pane animates to zero width. NotesScreen owns the state and renders the toggle
   * in the center pane's top bar — a control inside here would collapse along with it.
   */
  isOpen: boolean;
}

/**
 * Left pane — the note explorer: a new-note button over three collapsible sections, **Tags** (notes
 * grouped per tag, Obsidian-style), **Notes** (the root level) and **Folders** (the tree). That is
 * the same shape as the diagram sidebar's Diagrams/Folders split, and rows share one
 * [disclosure][icon][label] grid, so the two explorers read as one control.
 *
 * Folder and drag machinery lives here rather than on the screen, the way delete always has: this
 * component is memoized against a screen that re-renders on every streamed chat token, and lifting
 * a dozen handlers into it would hand it a fresh object per render and defeat that.
 *
 * Searching is not here — it lives in the global ⌘K modal, which searches notes *and* chats.
 * The whole pane scrolls on its own, independent of the editor and context panel.
 */
const NoteList = memo(function NoteList({ notes, folders, onCreate, creating, onRename, isOpen }: NoteListProps) {
  const dispatch = useAppDispatch();
  const noteId = useParams().noteId;
  const openId = noteId === undefined ? null : Number(noteId);

  // Which sections, folders and tags are open lives in Redux: `/notes` and `/notes/:noteId` are two
  // route entries, so opening the first note remounts this and would snap everything shut.
  const { expandedFolderIds, expandedTags, showTags, showNotes, showFolders } = useAppSelector(
    (state) => state.notesSidebar,
  );
  const expanded = useMemo(() => new Set(expandedFolderIds), [expandedFolderIds]);
  const openTags = useMemo(() => new Set(expandedTags), [expandedTags]);

  // The row showing a rename field. A row *key*, not a note id: a note appears once under each of
  // its tags and once in the tree, and only the row that was right-clicked becomes a field.
  const [renaming, setRenaming] = useState<string | null>(null);
  // The "New note" field standing in for a note that doesn't exist yet. Separate from `renaming`
  // because there is no row to key it to — see PendingRow.
  const [pending, setPending] = useState<PendingRow | null>(null);

  const { suggestedNoteTitle, createNoteNamed, deleteNote, addFolder, renameFolder, deleteFolder, moveRow } =
    useNoteFolders(notes, folders, openId);

  // The dragged row. A ref rather than `dataTransfer`, whose payload is unreadable during
  // `dragover` — and that is exactly when a folder drop has to be judged valid or not.
  const dragRef = useRef<DragItem | null>(null);
  // The same value as state, purely so the source row can dim while it is being dragged. The
  // preview's *position* is deliberately not state — see `moveDragPreview`.
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragPos = useRef({ x: 0, y: 0 });

  // Tag browser data: tag → its notes, both sorted by name — the same order the tree uses, rather
  // than the raw list order (which `upsertItem` keeps in recency).
  const notesByTag = useMemo(() => {
    const map = new Map<string, NoteSummary[]>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => map.set(tag, [...(map.get(tag) ?? []), note]));
    });
    return [...map.entries()]
      .map(([tag, tagNotes]) => [tag, [...tagNotes].sort((a, b) => byName(a.title, b.title))] as const)
      .sort(([a], [b]) => byName(a, b));
  }, [notes]);

  /**
   * Moves the drag preview by writing to the node directly.
   *
   * `drag` fires ~60×/s, and routing that through state would re-render the whole tree on every
   * frame — which is what makes releasing the mouse feel like it stuck.
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

  const handleRename = (id: number, title: string) => {
    setRenaming(null);
    onRename(id, title);
  };

  /** The toolbar button creates at the root; a folder's own menu passes its id to nest inside it. */
  const handleAddFolder = async (parentId: number | null = null) => {
    const id = await addFolder(parentId);
    // Every folder is born "New folder", so open it straight into rename the way an explorer does.
    if (id !== null) setRenaming(rowKey("folder", id));
  };

  /**
   * Opens the "New note" field inside a folder, the way VS Code's explorer does — a row appears
   * where the note will be, pre-filled with the name it would take, and Enter creates it.
   */
  const startPending = (parentId: number | null) => {
    if (parentId !== null) dispatch(expandFolder(parentId));
    setPending({ parentId, name: suggestedNoteTitle() });
  };

  const commitPending = async (title: string) => {
    const parentId = pending?.parentId ?? null;
    // The row stays put and turns into a plain label while the create is in flight — see
    // `PendingRow.busy`.
    setPending({ parentId, name: title, busy: true });
    await createNoteNamed(title, parentId);
    // Always cleared, whether or not it worked. Creating from the sidebar while a note is already
    // open navigates `/notes/:a` → `/notes/:b` — the *same* route entry, so this pane is not
    // remounted and the placeholder would sit there next to the real row for good.
    setPending(null);
  };

  const handleRenameFolder = (id: number, name: string) => {
    setRenaming(null);
    void renameFolder(id, name);
  };

  /** A folder can't be dropped into itself or anything beneath it — that would strand the branch. */
  const canDropInto = (folderId: number) => {
    const item = dragRef.current;
    if (item === null) return false;
    return item.kind === "note" || !isDescendant(folders, folderId, item.id);
  };

  const dropInto = (folderId: number | null) => {
    const item = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    setDropTarget(null);
    setRootDragOver(false);
    if (item !== null) void moveRow(item, folderId);
  };

  // The root level, split across the Notes and Folders sections below.
  const rootNotes = itemsIn(notes, null);
  const rootFolders = childFolders(folders, null);

  // Both sections render the same tree, filtered to one kind of row.
  const treeProps = {
    folders,
    notes,
    parentId: null,
    depth: 0,
    openId,
    expanded,
    onToggle: (id: number) => dispatch(toggleFolderExpanded(id)),
    onDeleteNote: (id: number) => void deleteNote(id),
    onDeleteFolder: (id: number) => void deleteFolder(id),
    renaming,
    onStartRename: setRenaming,
    onCancelRename: () => setRenaming(null),
    onRenameFolder: handleRenameFolder,
    onRenameNote: handleRename,
    onNewFolderIn: (parentId: number | null) => void handleAddFolder(parentId),
    onNewNoteIn: startPending,
    pending,
    onCommitPending: (title: string) => void commitPending(title),
    onCancelPending: () => setPending(null),
    dragRef,
    dragging,
    onDragging: (item: DragItem | null) => {
      setDragging(item);
      // Every gesture ends here, however it ended — the one place highlights are guaranteed to be
      // cleared.
      if (item === null) {
        setDropTarget(null);
        setRootDragOver(false);
      }
    },
    onDragMove: moveDragPreview,
    dropTarget,
    // Claiming a folder also releases the gutter. Folder blocks stop propagation, so the pane's
    // clear-everything handler never runs while the cursor is over one.
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
      : dragging.kind === "note"
        ? (notes.find((n) => n.id === dragging.id)?.title ?? null)
        : (folders.find((f) => f.id === dragging.id)?.name ?? null);

  /**
   * True only while something is in flight that could actually land at the root — a row already at
   * the top level arms nothing, so its own drag can't produce a pointless no-op move.
   */
  const rootDropArmed =
    dragging === null
      ? false
      : dragging.kind === "note"
        ? (notes.find((n) => n.id === dragging.id)?.folderId ?? null) !== null
        : (folders.find((f) => f.id === dragging.id)?.parentId ?? null) !== null;

  const noteEntry = (note: NoteSummary, options?: { compact?: boolean; depth?: number; scope?: string }) => {
    const key = rowKey("note", note.id, options?.scope);
    const isRenaming = renaming === key;
    return (
      <SidebarRowMenu
        key={note.id}
        label={note.title}
        disabled={isRenaming}
        actions={[
          { label: "Rename", icon: PencilLineIcon, onSelect: () => setRenaming(key) },
          { label: "Delete", icon: Trash2Icon, destructive: true, onSelect: () => void deleteNote(note.id) },
        ]}
      >
        <div style={{ marginLeft: sidebarIndent(options?.depth ?? 0) }} className={SIDEBAR_ROW_WRAPPER}>
          {isRenaming ? (
            // A plain row while renaming — inside the NavLink below, every click on the field would
            // open the note being renamed.
            <div className={sidebarRow(openId === note.id, "items-start")}>
              <span className={SIDEBAR_ICON_SLOT} />
              <FileTextIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
              <InlineRename
                value={note.title}
                ariaLabel="Note title"
                onCommit={(next) => handleRename(note.id, next)}
                onCancel={() => setRenaming(null)}
              />
            </div>
          ) : (
            <NavLink
              to={ROUTES.NOTES_DETAIL(note.id)}
              // Re-navigating to the note we're already on reads as a revalidation and refetches the
              // explorer, so swallow that click.
              onClick={(e) => openId === note.id && e.preventDefault()}
              // Tag chips stack under the title, so the label column is a column — but the two icon
              // columns stay on the row's baseline, which is what keeps notes aligned with tags.
              className={({ isActive }) => sidebarRow(isActive, "items-start")}
            >
              <span className={SIDEBAR_ICON_SLOT} />
              <FileTextIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-y-1">
                <span className="w-full truncate">{note.title}</span>
                {!options?.compact && note.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-neutral-800 px-1.5 py-0.5 caption-small-regular text-neutral-400 group-hover:bg-neutral-700"
                      >
                        #{tag}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </NavLink>
          )}
        </div>
      </SidebarRowMenu>
    );
  };

  return (
    // Two elements, as in the chat sidebar: the outer one animates its width, the inner one keeps
    // the full width so the content doesn't reflow on its way out — it fades instead.
    <aside
      // Accept the drag anywhere in the pane, and do nothing with it. A release over ground that
      // never called `preventDefault` makes Chrome animate the drag back to its origin and hold
      // `dragend` until that finishes — which is the lag on letting go.
      onDragOver={(e) => {
        e.preventDefault();
        // Reached only over dead space — folder blocks and the gutter stop propagation — so this is
        // the cursor having left every drop target.
        setDropTarget(null);
        setRootDragOver(false);
      }}
      onDrop={(e) => e.preventDefault()}
      className={sidebarShell(isOpen, ["relative", isOpen && "border-r border-neutral-800"])}
    >
      {/* The drag preview. The native ghost is suppressed because browsers rasterize it at 1× —
          always blurry on a HiDPI screen — so this real element follows the cursor instead. It is
          portalled out because the pane it belongs to clips its overflow. */}
      {draggingLabel !== null &&
        createPortal(
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
              <FolderIcon className="size-4 shrink-0 text-neutral-400" />
            ) : (
              <FileTextIcon className="size-4 shrink-0 text-neutral-400" />
            )}
            <span className="truncate">{draggingLabel}</span>
          </div>,
          document.body,
        )}

      <div className={sidebarShellInner(isOpen)}>
        <MainNavbar />
        {/* New note — shares the toolbar height for a uniform top band */}
        <div className="flex h-11.5 shrink-0 items-center gap-x-1 px-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className={sidebarNavRow(false, "flex-1 text-white disabled:cursor-not-allowed disabled:opacity-50")}
          >
            <SquarePenIcon className="size-4.5 shrink-0" />
            New note
          </button>
          <button
            type="button"
            onClick={() => void handleAddFolder()}
            aria-label="New folder"
            title="New folder"
            className="shrink-0 cursor-pointer rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white"
          >
            <FolderPlusIcon className="size-4.5" />
          </button>
        </div>

        {/* The way out to the top level, for a folder as much as a note: drag to the far left edge,
            the way VS Code's explorer un-nests. A gutter rather than a banner — it costs no layout,
            never covers a row's label, and reads as "outdent" instead of as a button. */}
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

        {/* Explorer body — scrolls independently of the editor and context panel */}
        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {/* Tags first — a cross-cutting view of the same notes the tree below files by folder. */}
          <SidebarSection
            label="Tags"
            count={notesByTag.length}
            open={showTags}
            onToggle={() => dispatch(toggleTagsSection())}
            emptyLabel="No tags yet"
          >
            <div className={SIDEBAR_LIST}>
              {notesByTag.map(([tag, tagNotes]) => (
                <div key={tag}>
                  <button type="button" onClick={() => dispatch(toggleTagExpanded(tag))} className={sidebarRow()}>
                    {openTags.has(tag) ? (
                      <ChevronDownIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
                    ) : (
                      <ChevronRightIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
                    )}
                    <HashIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-400")} />
                    <span className="truncate">{tag}</span>
                    <span className="ml-auto caption-small-regular text-neutral-600">{tagNotes.length}</span>
                  </button>
                  {openTags.has(tag) && (
                    <div className={cn("mt-1", SIDEBAR_LIST)}>
                      {tagNotes.map((note) => noteEntry(note, { compact: true, depth: 1, scope: tag }))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SidebarSection>

          {/* Loose notes, then the folders holding the rest — the two sections partition the list. */}
          <SidebarSection
            label="Notes"
            count={rootNotes.length}
            open={showNotes}
            onToggle={() => dispatch(toggleNotesSection())}
            emptyLabel="No top-level notes"
          >
            <NoteTree {...treeProps} only="notes" />
          </SidebarSection>

          <SidebarSection
            label="Folders"
            count={rootFolders.length}
            open={showFolders}
            onToggle={() => dispatch(toggleFoldersSection())}
            emptyLabel="No folders yet"
          >
            <NoteTree {...treeProps} only="folders" />
          </SidebarSection>
        </div>
      </div>
    </aside>
  );
});

export default NoteList;
