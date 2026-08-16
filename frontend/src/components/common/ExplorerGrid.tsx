import { useState, type ReactNode } from "react";
import { ChevronRightIcon, FolderIcon, FolderPlusIcon, PencilLineIcon, Trash2Icon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import InlineRename from "@/components/common/InlineRename";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import {
  ancestorIds,
  childFolders,
  itemsIn,
  rowKey,
  type PendingRow,
  type TreeFolder,
  type TreeItem,
} from "@/utils/folderTree";
import { cn } from "@/lib/utils";

/** What a drag is carrying — the same shape both sidebar trees use. */
type DragItem = { kind: "folder"; id: number } | { kind: "item"; id: number };

interface ExplorerGridProps<F extends TreeFolder, I extends TreeItem> {
  folders: F[];
  items: I[];
  /** The folder being browsed — null is the root. Owned by the screen, from `?folder=`. */
  folderId: number | null;
  onOpenFolder: (folderId: number | null) => void;
  onOpenItem: (id: number) => void;
  /** Shown on every item card, and beside the "New …" actions. */
  itemIcon: LucideIcon;
  /** Singular, lowercase — "note", "diagram". */
  itemNoun: string;
  /** The crumb for the root level: "Notes", "Diagrams". */
  rootLabel: string;
  /** Creates a folder, resolving to its id — null if the server refused. See `createFolder` below. */
  onNewFolder: (parentId: number | null) => Promise<number | null>;
  /** The name a new item's field opens with — the first free "Untitled". See `createItem` below. */
  suggestItemName: () => string;
  /**
   * Creates the item the placeholder card stood for, once its name is accepted. The card holds its
   * place until this resolves, so the row never blinks out between the two.
   */
  onNewItem: (title: string, folderId: number | null) => Promise<boolean>;
  onRenameFolder: (id: number, name: string) => void;
  onRenameItem: (id: number, title: string) => void;
  onDeleteFolder: (id: number) => void;
  onDeleteItem: (id: number) => void;
  /** Moves a folder or an item into `targetId` — null is the root. Drives drag-and-drop. */
  onMove: (item: DragItem, targetId: number | null) => void;
  /** Rendered above the breadcrumb — the screen's top band (sidebar toggle, extra buttons). */
  header?: ReactNode;
}

const CARD =
  "group flex h-28 w-full cursor-pointer flex-col justify-between rounded-xl border border-neutral-800 bg-grey-50 p-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-800/50";

/**
 * A file-explorer view of a folder tree — one folder at a time, as cards.
 *
 * The sidebar tree shows the whole hierarchy at once and is built for reaching a known item; this
 * is the other half, for browsing: **double-click** opens (a folder descends, an item opens in the
 * editor), **right-click** a card acts on it, **right-click the background** creates, and cards
 * drag onto folder cards to move. Both notes and diagrams render it — hence global, and generic
 * over anything shaped like `{id, name, parentId}` and `{id, title, folderId}`.
 *
 * The screens own the data and every mutation; this only decides what a gesture means.
 */
const ExplorerGrid = <F extends TreeFolder, I extends TreeItem>({
  folders,
  items,
  folderId,
  onOpenFolder,
  onOpenItem,
  itemIcon: ItemIcon,
  itemNoun,
  rootLabel,
  onNewFolder,
  suggestItemName,
  onNewItem,
  onRenameFolder,
  onRenameItem,
  onDeleteFolder,
  onDeleteItem,
  onMove,
  header,
}: ExplorerGridProps<F, I>) => {
  const [renaming, setRenaming] = useState<string | null>(null);
  // The card standing in for an item that doesn't exist yet. Owned here, like `renaming`, because
  // the sidebar tree keeps its own and only one of the two surfaces was right-clicked.
  const [pending, setPending] = useState<PendingRow | null>(null);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const visibleFolders = childFolders(folders, folderId);
  const visibleItems = itemsIn(items, folderId);
  // `ancestorIds` walks upward from the current folder, so reverse it to read root → here.
  const trail = ancestorIds(folders, folderId)
    .slice()
    .reverse()
    .map((id) => folders.find((folder) => folder.id === id))
    .filter((folder): folder is F => folder !== undefined);

  /** A folder can't swallow itself or anything beneath it — that would strand the branch. */
  const canDrop = (targetId: number) =>
    dragging !== null &&
    !(dragging.kind === "folder" && dragging.id === targetId) &&
    !(dragging.kind === "folder" && ancestorIds(folders, targetId).includes(dragging.id));

  const endDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };

  const drop = (targetId: number | null) => {
    if (dragging !== null && (targetId === null || canDrop(targetId))) onMove(dragging, targetId);
    endDrag();
  };

  const dragProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      setDragging(item);
    },
    onDragEnd: endDrag,
  });

  /** The browsing area's own menu — creates inside whatever folder is on screen. */
  const backgroundActions = [
    { label: `New ${itemNoun}`, icon: ItemIcon, onSelect: () => createItem(folderId) },
    { label: "New folder", icon: FolderPlusIcon, onSelect: () => void createFolder(folderId) },
  ];

  /**
   * Every folder is born "New folder", so the new card opens straight into its rename field rather
   * than leaving that name to be corrected afterwards — the same thing the sidebar tree does.
   *
   * This is why `onNewFolder` reports the id back: rename state belongs to whichever surface the
   * folder was created from, and the screen owns neither.
   */
  const createFolder = async (parentId: number | null) => {
    const id = await onNewFolder(parentId);
    if (id === null) return;
    // Created from a folder *card*, the new one lands a level below what is on screen — descend, or
    // the rename field would be attached to a card that isn't rendered and never appear.
    if (parentId !== folderId) onOpenFolder(parentId);
    setRenaming(rowKey("folder", id));
  };

  /**
   * Opens a placeholder card with the name the item would take, the way VS Code's explorer opens a
   * field for a new file. Nothing is sent until that name is accepted — Escape leaves no trace.
   *
   * Descends for the same reason `createFolder` does: from a folder *card*'s menu the placeholder
   * belongs a level down, where it isn't currently rendered.
   */
  const createItem = (parentId: number | null) => {
    if (parentId !== folderId) onOpenFolder(parentId);
    setPending({ parentId, name: suggestItemName() });
  };

  const commitItem = async (title: string) => {
    const parentId = pending?.parentId ?? null;
    // The card stays put and turns into a plain label while the create is in flight — see
    // `PendingRow.busy`. Cleared either way afterwards: the surface that opens the new item is not
    // always torn down by that navigation, and a card left behind would double the row.
    setPending({ parentId, name: title, busy: true });
    await onNewItem(title, parentId);
    setPending(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {/* Breadcrumb — every crumb but the last navigates. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-1 px-6 pt-5 pb-4 para-small-medium">
        <button
          type="button"
          onClick={() => onOpenFolder(null)}
          className={cn(
            "cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-neutral-800 hover:text-white",
            folderId === null ? "text-white" : "text-neutral-400",
          )}
        >
          {rootLabel}
        </button>
        {trail.map((folder, index) => (
          <span key={folder.id} className="flex items-center gap-x-1">
            <ChevronRightIcon className="size-3.5 shrink-0 text-neutral-600" />
            <button
              type="button"
              onClick={() => onOpenFolder(folder.id)}
              className={cn(
                "cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-neutral-800 hover:text-white",
                index === trail.length - 1 ? "text-white" : "text-neutral-400",
              )}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {/* The browsing area is the background target: right-clicking empty space creates, and
          releasing a card over it outdents to the folder being browsed. The header and breadcrumb
          sit outside it, so a right-click on their controls isn't captured. Cards stop the event,
          so the innermost target wins. */}
      <SidebarRowMenu label="this folder" actions={backgroundActions}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(folderId);
          }}
          className="chat-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6"
        >
          {/* The pending card counts as content — otherwise the empty state would replace the very
              field the right-click just opened. */}
          {visibleFolders.length === 0 && visibleItems.length === 0 && pending === null ? (
            <div className="flex flex-col items-center justify-center gap-y-3 py-20 text-neutral-500">
              <FolderIcon className="size-10" />
              <p className="para-small-medium">This folder is empty</p>
              <p className="caption-regular text-neutral-600">Right-click here to add a {itemNoun} or a folder</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {visibleFolders.map((folder) => {
                const key = rowKey("folder", folder.id);
                const isRenaming = renaming === key;
                const isOver = dropTarget === folder.id;
                return (
                  <SidebarRowMenu
                    key={key}
                    label={folder.name}
                    disabled={isRenaming}
                    actions={[
                      { label: "Open", icon: FolderIcon, onSelect: () => onOpenFolder(folder.id) },
                      { label: `New ${itemNoun}`, icon: ItemIcon, onSelect: () => createItem(folder.id) },
                      { label: "New folder", icon: FolderPlusIcon, onSelect: () => void createFolder(folder.id) },
                      { label: "Rename", icon: PencilLineIcon, onSelect: () => setRenaming(key) },
                      {
                        label: "Delete",
                        icon: Trash2Icon,
                        destructive: true,
                        onSelect: () => onDeleteFolder(folder.id),
                      },
                    ]}
                  >
                    <div
                      role="button"
                      {...(isRenaming ? {} : dragProps({ kind: "folder", id: folder.id }))}
                      onDoubleClick={() => !isRenaming && onOpenFolder(folder.id)}
                      onDragOver={(e) => {
                        // preventDefault runs unconditionally — a card that refuses the drop
                        // still has to accept the dragover, or releasing over it hands the
                        // gesture back to Chrome's snap-back animation and stalls `dragend`.
                        e.stopPropagation();
                        e.preventDefault();
                        setDropTarget(canDrop(folder.id) ? folder.id : null);
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (canDrop(folder.id)) drop(folder.id);
                        else endDrag();
                      }}
                      className={cn(
                        CARD,
                        dragging?.kind === "folder" && dragging.id === folder.id && "opacity-40",
                        isOver && "border-neutral-500 bg-neutral-800",
                      )}
                    >
                      <FolderIcon className="size-7 shrink-0 text-neutral-400" />
                      {isRenaming ? (
                        <InlineRename
                          value={folder.name}
                          ariaLabel="Folder name"
                          onCommit={(next) => {
                            setRenaming(null);
                            onRenameFolder(folder.id, next);
                          }}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        <span className="truncate para-small-medium text-white" title={folder.name}>
                          {folder.name}
                        </span>
                      )}
                    </div>
                  </SidebarRowMenu>
                );
              })}

              {visibleItems.map((item) => {
                const key = rowKey("item", item.id);
                const isRenaming = renaming === key;
                return (
                  <SidebarRowMenu
                    key={key}
                    label={item.title}
                    disabled={isRenaming}
                    actions={[
                      { label: "Open", icon: ItemIcon, onSelect: () => onOpenItem(item.id) },
                      { label: "Rename", icon: PencilLineIcon, onSelect: () => setRenaming(key) },
                      {
                        label: "Delete",
                        icon: Trash2Icon,
                        destructive: true,
                        onSelect: () => onDeleteItem(item.id),
                      },
                    ]}
                  >
                    <div
                      role="button"
                      {...(isRenaming ? {} : dragProps({ kind: "item", id: item.id }))}
                      onDoubleClick={() => !isRenaming && onOpenItem(item.id)}
                      className={cn(CARD, dragging?.kind === "item" && dragging.id === item.id && "opacity-40")}
                    >
                      <ItemIcon className="size-7 shrink-0 text-neutral-500" />
                      {isRenaming ? (
                        <InlineRename
                          value={item.title}
                          ariaLabel={`${itemNoun} title`}
                          onCommit={(next) => {
                            setRenaming(null);
                            onRenameItem(item.id, next);
                          }}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        <span className="truncate para-small-medium text-white" title={item.title}>
                          {item.title}
                        </span>
                      )}
                    </div>
                  </SidebarRowMenu>
                );
              })}

              {/* The item that doesn't exist yet. No menu and no drag — there is nothing to act on
                  until the name is accepted, and once it has been the card holds its place as a
                  plain label until the real one replaces it. */}
              {pending !== null && pending.parentId === folderId && (
                <div className={cn(CARD, "cursor-default", pending.busy && "opacity-60")}>
                  <ItemIcon className="size-7 shrink-0 text-neutral-500" />
                  {pending.busy ? (
                    <span className="truncate para-small-medium text-white">{pending.name}</span>
                  ) : (
                    <InlineRename
                      value={pending.name}
                      commitUnchanged
                      ariaLabel={`New ${itemNoun} title`}
                      onCommit={(next) => void commitItem(next)}
                      onCancel={() => setPending(null)}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SidebarRowMenu>
    </div>
  );
};

export default ExplorerGrid;
