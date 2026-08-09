/* ── Sidebar / explorer folder trees ──────────────────────────────────────────
 * The server sends folders flat (each with a `parentId`); the tree is assembled
 * here, per level, at render time. Pure functions so the drag-and-drop guards
 * are testable without a DOM.
 *
 * Global rather than module-scoped because the diagram tree, the note tree and
 * the shared explorer grid all walk the same shape — modules may not import
 * from one another.
 */

/**
 * Identifies the row showing a rename field.
 *
 * A key rather than an id, because the same item can occupy more than one row — a note sits under
 * both its tag and its folder — and only the row that was right-clicked should turn into a field.
 * Which item to rename is never read back off this: each row already closes over its own.
 */
export const rowKey = (kind: string, id: number, scope?: string) =>
  scope === undefined ? `${kind}:${id}` : `${kind}:${id}@${scope}`;

/** The shape every folder row shares, whatever it holds. */
export interface TreeFolder {
  id: number;
  name: string;
  parentId: number | null;
}

/** The shape every foldered item shares — a diagram, a note. */
export interface TreeItem {
  id: number;
  folderId: number | null;
  updatedAt: string;
}

/** Folders directly under `parentId` (null = root level), A→Z. */
export const childFolders = <F extends TreeFolder>(folders: F[], parentId: number | null): F[] =>
  folders.filter((folder) => folder.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

/** Items directly inside `folderId` (null = root level), most recently updated first. */
export const itemsIn = <I extends TreeItem>(items: I[], folderId: number | null): I[] =>
  items.filter((item) => item.folderId === folderId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/**
 * `rootId` plus every folder beneath it. Used to prune the local list after a delete (the server
 * cascades) and to reject a move that would strand a branch.
 */
export const descendantIds = (folders: TreeFolder[], rootId: number): Set<number> => {
  const ids = new Set([rootId]);
  const pending = [rootId];
  while (pending.length > 0) {
    const current = pending.pop() as number;
    for (const folder of folders) {
      if (folder.parentId === current && !ids.has(folder.id)) {
        ids.add(folder.id);
        pending.push(folder.id);
      }
    }
  }
  return ids;
};

/**
 * `folderId` and every folder above it, up to the root. Used to reveal the chain leading to the
 * open item when a section is entered by reload or by a `[[wiki link]]`, and to build the
 * explorer's breadcrumb.
 *
 * The walk is bounded by the folder count so a malformed cycle can't hang the sidebar.
 */
export const ancestorIds = (folders: TreeFolder[], folderId: number | null): number[] => {
  const chain: number[] = [];
  let current = folderId;
  while (current !== null && chain.length <= folders.length) {
    chain.push(current);
    current = folders.find((folder) => folder.id === current)?.parentId ?? null;
  }
  return chain;
};

/** Whether `candidateId` is `ancestorId` itself or sits somewhere beneath it. */
export const isDescendant = (folders: TreeFolder[], candidateId: number, ancestorId: number): boolean =>
  descendantIds(folders, ancestorId).has(candidateId);
