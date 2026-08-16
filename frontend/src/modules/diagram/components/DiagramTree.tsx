import type { RefObject } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, PencilLine, Trash2, Workflow } from "lucide-react";
import InlineRename from "@/components/common/InlineRename";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import {
  SIDEBAR_ICON_SLOT,
  SIDEBAR_LIST,
  SIDEBAR_ROW_WRAPPER,
  sidebarIndent,
  sidebarRow,
} from "@/components/common/sidebar";
import { EMPTY_DRAG_IMAGE } from "@/utils/dragPreview";
import { childFolders, itemsIn, rowKey, type PendingRow } from "@/utils/folderTree";
import type { DiagramFolderSummary, DiagramSummary } from "@/services/operations/diagrams/diagrams.route";
import { cn } from "@/lib/utils";

/** What a drag is carrying. Held in a ref, not `dataTransfer` — see `DiagramsScreen`. */
export type DragItem = { kind: "folder"; id: number } | { kind: "diagram"; id: number };

/** Alias kept so the many call sites below stay short; the rule lives in `sidebarRow`. */
const indentOf = sidebarIndent;

const IconSlot = () => <span className={SIDEBAR_ICON_SLOT} />;

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
  onDeleteFolder: (id: number) => void;
  /**
   * The one row in rename mode (see `rowKey`), owned by `DiagramsScreen` rather than by the row.
   *
   * Lifted because renaming is started from outside the row as often as from it: creating a folder
   * opens it straight into rename, the way an explorer does.
   */
  renaming: string | null;
  onStartRename: (key: string) => void;
  onCancelRename: () => void;
  onRenameFolder: (id: number, name: string) => void;
  onRenameDiagram: (id: number, title: string) => void;
  /** Create inside a folder from its own menu — null creates at the root. */
  onNewFolderIn: (parentId: number | null) => void;
  onNewDiagramIn: (folderId: number | null) => void;
  /**
   * The "New diagram" field, sitting in the level it will be created in. Owned by `DiagramsScreen`
   * rather than by the row, for the same reason `renaming` is: the explorer grid can be showing one
   * too, and only one of the two was right-clicked.
   */
  pending: PendingRow | null;
  onCommitPending: (title: string) => void;
  onCancelPending: () => void;
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
 * One level of the sidebar tree, recursing into expanded folders. Folders sort A→Z, then diagrams
 * A→Z, at every level.
 */
const DiagramTree = (props: DiagramTreeProps) => {
  const { folders, diagrams, parentId, depth, only, openId, onOpenDiagram, onDeleteDiagram } = props;
  const { renaming, onStartRename, onCancelRename, onRenameDiagram } = props;
  const { pending, onCommitPending, onCancelPending } = props;
  const { dragRef, dragging, onDragging, onDragMove } = props;

  return (
    <div className={SIDEBAR_LIST}>
      {only !== "diagrams" &&
        childFolders(folders, parentId).map((folder) => <FolderRow key={folder.id} folder={folder} {...props} />)}

      {only !== "folders" &&
        itemsIn(diagrams, parentId).map((diagram) => {
          const key = rowKey("diagram", diagram.id);
          const isRenaming = renaming === key;
          return (
            <SidebarRowMenu
              key={diagram.id}
              label={diagram.title}
              disabled={isRenaming}
              actions={[
                { label: "Rename", icon: PencilLine, onSelect: () => onStartRename(key) },
                { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDeleteDiagram(diagram.id) },
              ]}
            >
              <div style={{ marginLeft: indentOf(depth) }} className={SIDEBAR_ROW_WRAPPER}>
                {isRenaming ? (
                  // A plain div while renaming: an <input> nested in the button below would be
                  // invalid markup, and Space would activate the button instead of typing.
                  <div className={sidebarRow(openId === diagram.id)}>
                    <IconSlot />
                    <Workflow className="size-4 shrink-0 text-neutral-500" />
                    <InlineRename
                      value={diagram.title}
                      ariaLabel="Diagram title"
                      onCommit={(next) => onRenameDiagram(diagram.id, next)}
                      onCancel={onCancelRename}
                    />
                  </div>
                ) : (
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
                )}
              </div>
            </SidebarRowMenu>
          );
        })}

      {/* The diagram that doesn't exist yet, at the end of the level it is being created in. No menu
          and no button — there is nothing to act on until the name is accepted, and once it has been
          the row holds its place as a plain label until the real one replaces it. */}
      {only !== "folders" && pending !== null && pending.parentId === parentId && (
        <div style={{ marginLeft: indentOf(depth) }} className={SIDEBAR_ROW_WRAPPER}>
          <div className={sidebarRow(false, pending.busy && "opacity-60")}>
            <IconSlot />
            <Workflow className="size-4 shrink-0 text-neutral-500" />
            {pending.busy ? (
              <span className="truncate">{pending.name}</span>
            ) : (
              <InlineRename
                value={pending.name}
                commitUnchanged
                ariaLabel="New diagram title"
                onCommit={onCommitPending}
                onCancel={onCancelPending}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FolderRowProps extends DiagramTreeProps {
  folder: DiagramFolderSummary;
}

const FolderRow = ({ folder, ...props }: FolderRowProps) => {
  const { depth, expanded, onToggle, onRenameFolder, onDeleteFolder, onDropInto, canDropInto } = props;
  const { renaming, onStartRename, onCancelRename, onNewFolderIn, onNewDiagramIn } = props;
  const { dragRef, dragging, onDragging, onDragMove, dropTarget, onDropTarget } = props;
  const key = rowKey("folder", folder.id);
  const isRenaming = renaming === key;
  const isExpanded = expanded.has(folder.id);
  const dragOver = dropTarget === folder.id;
  // A pending "New diagram" field counts as content: the short-circuit below renders "Empty"
  // *instead of* recursing, so without this the field would never appear in an empty folder — the
  // one place creating a diagram is most likely.
  const isEmpty =
    childFolders(props.folders, folder.id).length === 0 &&
    itemsIn(props.diagrams, folder.id).length === 0 &&
    props.pending?.parentId !== folder.id;

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
        disabled={isRenaming}
        actions={[
          { label: "New diagram", icon: Workflow, onSelect: () => onNewDiagramIn(folder.id) },
          { label: "New folder", icon: FolderPlus, onSelect: () => onNewFolderIn(folder.id) },
          { label: "Rename", icon: PencilLine, onSelect: () => onStartRename(key) },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDeleteFolder(folder.id) },
        ]}
      >
        <div style={{ marginLeft: indentOf(depth) }} className={SIDEBAR_ROW_WRAPPER}>
          {isRenaming ? (
            <div className={sidebarRow()}>
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
              <InlineRename
                value={folder.name}
                ariaLabel="Folder name"
                onCommit={(next) => onRenameFolder(folder.id, next)}
                onCancel={onCancelRename}
              />
            </div>
          ) : (
            <div
              role="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                beginDrag(e, { kind: "folder", id: folder.id }, props);
              }}
              onDrag={(e) => onDragMove(e.clientX, e.clientY)}
              onDragEnd={() => {
                dragRef.current = null;
                onDragging(null);
              }}
              onClick={() => onToggle(folder.id)}
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
              <span className="truncate">{folder.name}</span>
            </div>
          )}
        </div>
      </SidebarRowMenu>

      {/* `DiagramTree` brings its own list spacing; this only separates it from the folder row. */}
      {isExpanded && (
        <div className="mt-1">
          {isEmpty ? (
            // Without this an open empty folder is indistinguishable from a closed one — the
            // chevron turns and nothing else happens.
            //
            // Built from `sidebarRow` rather than its own box: this row is *replaced* by a real one
            // the moment anything is created here, and `caption-regular`'s shorter line-height made
            // the list jump by a few pixels at that swap. Only the paint differs — no hover, since
            // there is nothing to click.
            <div style={{ marginLeft: indentOf(depth + 1) }}>
              <div
                className={sidebarRow(
                  false,
                  "cursor-default text-neutral-600 italic hover:bg-transparent hover:text-neutral-600",
                )}
              >
                <IconSlot />
                <IconSlot />
                Empty
              </div>
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
