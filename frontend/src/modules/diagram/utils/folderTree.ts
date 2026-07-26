import type { DiagramFolderSummary, DiagramSummary } from "@/services/operations/diagrams/diagrams.route";

/* ── Diagram sidebar tree ─────────────────────────────────────────────────────
 * The server sends folders flat (each with a `parentId`); the tree is assembled
 * here, per level, at render time. Pure functions so the drag-and-drop guards
 * are testable without a DOM.
 */

/** Folders directly under `parentId` (null = root level), A→Z. */
export const childFolders = (folders: DiagramFolderSummary[], parentId: number | null): DiagramFolderSummary[] =>
  folders.filter((folder) => folder.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

/** Diagrams directly inside `folderId` (null = root level), most recently updated first. */
export const diagramsIn = (diagrams: DiagramSummary[], folderId: number | null): DiagramSummary[] =>
  diagrams
    .filter((diagram) => diagram.folderId === folderId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/**
 * `rootId` plus every folder beneath it. Used to prune the local list after a delete (the server
 * cascades) and to reject a move that would strand a branch.
 */
export const descendantIds = (folders: DiagramFolderSummary[], rootId: number): Set<number> => {
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
 * open diagram when the section is entered by reload or by a `[[Title.diagram]]` link.
 *
 * The walk is bounded by the folder count so a malformed cycle can't hang the sidebar.
 */
export const ancestorIds = (folders: DiagramFolderSummary[], folderId: number | null): number[] => {
  const chain: number[] = [];
  let current = folderId;
  while (current !== null && chain.length <= folders.length) {
    chain.push(current);
    current = folders.find((folder) => folder.id === current)?.parentId ?? null;
  }
  return chain;
};

/** Whether `candidateId` is `ancestorId` itself or sits somewhere beneath it. */
export const isDescendant = (folders: DiagramFolderSummary[], candidateId: number, ancestorId: number): boolean =>
  descendantIds(folders, ancestorId).has(candidateId);
