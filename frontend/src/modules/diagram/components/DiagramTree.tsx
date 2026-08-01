import { useState, type RefObject } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, PencilLine, Trash2, Workflow } from "lucide-react";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import {
  SIDEBAR_ICON_SLOT,
  SIDEBAR_LIST,
  SIDEBAR_ROW_WRAPPER,
  sidebarIndent,
  sidebarRow,
} from "@/components/common/sidebarRow";
import { childFolders, diagramsIn } from "@/modules/diagram/utils/folderTree";
import type { DiagramFolderSummary, DiagramSummary } from "@/services/operations/diagrams/diagrams.route";
import { cn } from "@/lib/utils";

/** What a drag is carrying. Held in a ref, not `dataTransfer` — see `DiagramsScreen`. */
export type DragItem = { kind: "folder"; id: number } | { kind: "diagram"; id: number };

/** Alias kept so the many call sites below stay short; the rule lives in `sidebarRow`. */
const indentOf = sidebarIndent;

const IconSlot = () => <span className={SIDEBAR_ICON_SLOT} />;

/**
 * A 1×1 transparent GIF used to suppress the native drag ghost.
 *
 * The browser rasterizes that ghost at 1× regardless of device pixel ratio, so on a HiDPI display
 * the dragged row is *always* upscaled and soft — nothing about the row's own styling can fix it.
 * So we don't draw one: the source row dims and the drop target rings instead, which is both
 * sharper and closer to how Linear/Notion handle a list drag.
 *
 * Module scope so it is decoded long before a drag begins — `setDragImage` with an unloaded image
 * silently falls back to the default ghost.
 */
const EMPTY_DRAG_IMAGE =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });

/**
 * Opens a drag: suppress the native ghost, record what's moving, and announce it.
 *
 * The announcement is deferred by a frame on purpose. Chrome **cancels a drag outright** if the DOM
 * mutates inside the `dragstart` handler, and announcing synchronously does exactly that — React
 * flushes discrete events immediately, dimming this row and revealing the drop strip while the
 * browser is still deciding whether a drag has begun. The ref is still set synchronously, because
 * `dragover` needs it on the very next event.
 */
const beginDrag = (
  e: React.DragEvent,
  item: DragItem,
  { dragRef, onDragMove, onDragging }: Pick<DiagramTreeProps, "dragRef" | "onDragMove" | "onDragging">,
) => {
  e.dataTransfer.effectAllowed = "move";
  if (EMPTY_DRAG_IMAGE !== null) e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
  dragRef.current = item;
  onDragMove(e.clientX, e.clientY);
  requestAnimationFrame(() => {
    // A drag that died in the same frame leaves nothing to announce.
    if (dragRef.current !== null) onDragging(item);
  });
};

interface DiagramTreeProps {
  folders: DiagramFolderSummary[];
  diagrams: DiagramSummary[];
  /** Which level this renders — null is the root. */
  parentId: number | null;
  depth: number;
  /**
   * Restricts a level to one kind of row. The root is split across two sidebar sections
   * ("Diagrams", then "Folders"); nested levels render both.
   */
  only?: "folders" | "diagrams";
  openId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onOpenDiagram: (id: number) => void;
  onDeleteDiagram: (id: number) => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number) => void;
  dragRef: RefObject<DragItem | null>;
  /** The row being dragged, dimmed while a custom preview follows the cursor. */
  dragging: DragItem | null;
  onDragging: (item: DragItem | null) => void;
  /** Pointer position during a drag — feeds the preview that replaces the native ghost. */
  onDragMove: (x: number, y: number) => void;
  onDropInto: (folderId: number | null) => void;
  /**
   * The folder currently under the cursor, highlighted as the drop target. One shared value rather
   * than per-row state: dropping into a nested folder never fires `dragleave` on its ancestors, so
   * their highlights would stay lit after the gesture ended.
   */
  dropTarget: number | null;
  onDropTarget: (folderId: number | null) => void;
  /** False for a folder dropped on itself or its own descendant — the row won't accept it. */
  canDropInto: (folderId: number) => boolean;
}

/**
 * One level of the sidebar tree, recursing into expanded folders. Folders sort A→Z and diagrams by
 * last-updated, at every level.
 */
const DiagramTree = (props: DiagramTreeProps) => {
  const { folders, diagrams, parentId, depth, only, openId, onOpenDiagram, onDeleteDiagram } = props;
  const { dragRef, dragging, onDragging, onDragMove } = props;

  return (
    <div className={SIDEBAR_LIST}>
      {only !== "diagrams" &&
        childFolders(folders, parentId).map((folder) => <FolderRow key={folder.id} folder={folder} {...props} />)}

      {only !== "folders" &&
        diagramsIn(diagrams, parentId).map((diagram) => (
          <SidebarRowMenu
            key={diagram.id}
            label={diagram.title}
            actions={[
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDeleteDiagram(diagram.id) },
            ]}
          >
            <div style={{ marginLeft: indentOf(depth) }} className={SIDEBAR_ROW_WRAPPER}>
              <button
                type="button"
                draggable
                onDragStart={(e) => beginDrag(e, { kind: "diagram", id: diagram.id }, props)}
                onDrag={(e) => onDragMove(e.clientX, e.clientY)}
                onDragEnd={() => {
                  dragRef.current = null;
                  onDragging(null);
                }}
                onClick={() => openId !== diagram.id && onOpenDiagram(diagram.id)}
                className={sidebarRow(
                  openId === diagram.id,
                  dragging?.kind === "diagram" && dragging.id === diagram.id && "opacity-40",
                )}
              >
                {/* Same two columns a folder row uses, so titles line up at every depth. */}
                <IconSlot />
                <Workflow className="size-4 shrink-0 text-neutral-500" />
                <span className="truncate">{diagram.title}</span>
              </button>
            </div>
          </SidebarRowMenu>
        ))}
    </div>
  );
};

interface FolderRowProps extends DiagramTreeProps {
  folder: DiagramFolderSummary;
}

const FolderRow = ({ folder, ...props }: FolderRowProps) => {
  const { depth, expanded, onToggle, onRenameFolder, onDeleteFolder, onDropInto, canDropInto } = props;
  const { dragRef, dragging, onDragging, onDragMove, dropTarget, onDropTarget } = props;
  const [renaming, setRenaming] = useState(false);
  const isExpanded = expanded.has(folder.id);
  const dragOver = dropTarget === folder.id;
  const isEmpty =
    childFolders(props.folders, folder.id).length === 0 && diagramsIn(props.diagrams, folder.id).length === 0;

  const commitRename = (name: string) => {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed !== "" && trimmed !== folder.name) onRenameFolder(folder.id, trimmed);
  };

  return (
    // The drop target is the folder's whole block — its row *and*, when open, everything nested
    // under it. Aiming at the one-row header was needlessly precise: dropping onto a folder's
    // visible contents plainly means "put it in this folder". Nested folders stop propagation, so
    // the innermost block under the cursor still wins, and diagram rows carry no handlers at all,
    // so they bubble up to whichever folder encloses them.
    <div
      // No `dragleave` handler: `dragover` fires continuously on whatever is innermost under the
      // cursor, so simply claiming the target on every one keeps the shared value correct as the
      // cursor moves. Leaving the tree entirely is handled by the sidebar clearing it.
      onDragOver={(e) => {
        // preventDefault runs unconditionally — a block that refuses the drop still has to *accept
        // the dragover*, or releasing over it hands the gesture back to Chrome's snap-back
        // animation and stalls `dragend`. Refusal is expressed by not highlighting, and in onDrop.
        e.stopPropagation();
        e.preventDefault();
        onDropTarget(canDropInto(folder.id) ? folder.id : null);
      }}
      onDrop={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (canDropInto(folder.id)) onDropInto(folder.id);
      }}
      className={cn("rounded-lg", dragOver && "bg-neutral-800/40 ring-1 ring-neutral-500")}
    >
      {/* Wraps the folder's own row only — never its nested contents, whose rows carry their own
          menus and would otherwise open two at once on right-click. */}
      <SidebarRowMenu
        label={folder.name}
        disabled={renaming}
        actions={[
          { label: "Rename", icon: PencilLine, onSelect: () => setRenaming(true) },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDeleteFolder(folder.id) },
        ]}
      >
        <div style={{ marginLeft: indentOf(depth) }} className={SIDEBAR_ROW_WRAPPER}>
          <div
            role="button"
            draggable={!renaming}
            onDragStart={(e) => {
              e.stopPropagation();
              beginDrag(e, { kind: "folder", id: folder.id }, props);
            }}
            onDrag={(e) => onDragMove(e.clientX, e.clientY)}
            onDragEnd={() => {
              dragRef.current = null;
              onDragging(null);
            }}
            onClick={() => !renaming && onToggle(folder.id)}
            className={sidebarRow(false, dragging?.kind === "folder" && dragging.id === folder.id && "opacity-40")}
          >
            {isExpanded ? (
              <ChevronDown className="size-4 shrink-0 text-neutral-500" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-neutral-500" />
            )}
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-neutral-400" />
            ) : (
              <Folder className="size-4 shrink-0 text-neutral-400" />
            )}

            {renaming ? (
              <input
                autoFocus
                defaultValue={folder.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => commitRename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(e.currentTarget.value);
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="min-w-0 flex-1 rounded bg-neutral-950 px-1 para-small-medium text-white outline-none ring-1 ring-neutral-700"
              />
            ) : (
              <span className="truncate">{folder.name}</span>
            )}
          </div>
        </div>
      </SidebarRowMenu>

      {/* `DiagramTree` brings its own list spacing; this only separates it from the folder row. */}
      {isExpanded && (
        <div className="mt-1">
          {isEmpty ? (
            // Without this an open empty folder is indistinguishable from a closed one — the
            // chevron turns and nothing else happens.
            <div
              style={{ marginLeft: indentOf(depth + 1) }}
              className="flex items-center gap-x-2 px-2 py-1.5 caption-regular text-neutral-600 italic"
            >
              <IconSlot />
              <IconSlot />
              Empty
            </div>
          ) : (
            <DiagramTree {...props} parentId={folder.id} depth={depth + 1} only={undefined} />
          )}
        </div>
      )}
    </div>
  );
};

export default DiagramTree;
