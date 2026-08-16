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
  title: string;
}

/**
 * A row that doesn't exist yet — the field a right-click "New …" opens, before Enter creates it.
 *
 * Held per surface, next to that surface's `renaming` key and for the same reason: the sidebar tree
 * and the explorer grid can each be showing one, and neither owns the other's.
 */
export interface PendingRow {
  /** Which level the field sits in — null is the root. */
  parentId: number | null;
  /** Pre-filled and pre-deduplicated: "Untitled", "Untitled 2", … */
  name: string;
  /**
   * The name has been accepted and the create is in flight: the row stays exactly where it is,
   * as a plain label instead of a field.
   *
   * Without this the row was taken down on Enter and only came back when the response landed, so
   * it blinked out and in. It is also what stops a second Enter firing a second create.
   */
  busy?: boolean;
}

/**
 * A→Z, digits compared as numbers so "Untitled 2" precedes "Untitled 10" — which matters now that
 * `nextUntitled` hands out exactly that series.
 */
export const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * The first free "Base", "Base 2", "Base 3" … — the same rule the server applies on insert, so the
 * name a create field opens with is the name the row keeps.
 *
 * Case-insensitive, matching `NotesService.isTaken`: the DB constraint is case-sensitive but the
 * app-level rule is stricter, and guessing the looser one would show a name the server then changes.
 */
export const nextUntitled = (taken: string[], base: string): string => {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
};

/** Folders directly under `parentId` (null = root level), A→Z. */
export const childFolders = <F extends TreeFolder>(folders: F[], parentId: number | null): F[] =>
  folders.filter((folder) => folder.parentId === parentId).sort((a, b) => byName(a.name, b.name));

/**
 * Items directly inside `folderId` (null = root level), A→Z.
 *
 * By title rather than by `updatedAt`: recency meant a row jumped to the top of its folder on every
 * save, so nothing ever sat where it was left. The API orders by title too — this only has to agree
 * with it, and adds numeric collation Postgres doesn't do.
 */
export const itemsIn = <I extends TreeItem>(items: I[], folderId: number | null): I[] =>
  items.filter((item) => item.folderId === folderId).sort((a, b) => byName(a.title, b.title));

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
