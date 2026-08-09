import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const notesEndPoints = {
  GET_ALL: `${BASE_URL_SERVER}/notes`,
  GET_ONE: (id: number) => `${BASE_URL_SERVER}/notes/${id}`,
  CREATE: `${BASE_URL_SERVER}/notes`,
  UPDATE: (id: number) => `${BASE_URL_SERVER}/notes/${id}`,
  RENAME: (id: number) => `${BASE_URL_SERVER}/notes/${id}/title`,
  DELETE_ONE: (id: number) => `${BASE_URL_SERVER}/notes/${id}`,
  SEARCH: `${BASE_URL_SERVER}/notes/search`,
  LINKS: `${BASE_URL_SERVER}/notes/links`,
  REVISIONS: (id: number) => `${BASE_URL_SERVER}/notes/${id}/revisions`,
  RESTORE: (id: number, revisionId: number) => `${BASE_URL_SERVER}/notes/${id}/revisions/${revisionId}/restore`,
  BACKLINKS: (id: number) => `${BASE_URL_SERVER}/notes/${id}/backlinks`,
  MOVE: (id: number) => `${BASE_URL_SERVER}/notes/${id}/folder`,
  // Its own top-level path rather than `/notes/folders`, which would sit under `/notes/{id}`.
  CREATE_FOLDER: `${BASE_URL_SERVER}/note-folders`,
  RENAME_FOLDER: (id: number) => `${BASE_URL_SERVER}/note-folders/${id}`,
  MOVE_FOLDER: (id: number) => `${BASE_URL_SERVER}/note-folders/${id}/parent`,
  DELETE_FOLDER: (id: number) => `${BASE_URL_SERVER}/note-folders/${id}`,
};

/** One folder in the note explorer's tree. Sent flat — the client assembles the levels. */
export interface NoteFolderSummary {
  id: number;
  name: string;
  /** null at the root level. */
  parentId: number | null;
}

export interface NoteSummary {
  id: number;
  title: string;
  tags: string[];
  /** null at the root level. */
  folderId: number | null;
  updatedAt: string;
}

export interface NoteDetail {
  id: number;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  /** Image `![[file.png]]` embed filename → its direct storage-server URL (empty when the note has none). */
  embedUrls: Record<string, string>;
  /** null at the root level. */
  folderId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteSavePayload {
  title?: string;
  content: string;
  /** Only on create, and only when the note was started from a folder's own menu. */
  folderId?: number | null;
}

export interface NoteRevision {
  id: number;
  createdAt: string;
}

export type GetRevisionsResponse = {
  message: string;
  data: { revisions: NoteRevision[] };
};

export interface NoteLink {
  sourceNoteId: number;
  targetRef: string;
  linkType: "link" | "embed";
}

export type GetNoteLinksResponse = {
  message: string;
  data: { links: NoteLink[] };
};

/** Search hits and backlinks — a plain list, with no folders to draw. */
export type GetNotesResponse = {
  message: string;
  data: { notes: NoteSummary[] };
};

/**
 * The explorer's listing. Folders ride along with the notes because the tree needs both to draw a
 * single level, and one request keeps them consistent.
 */
export type GetNoteExplorerResponse = {
  message: string;
  data: { folders: NoteFolderSummary[]; notes: NoteSummary[] };
};

export type NoteFolderResponse = {
  message: string;
  data: NoteFolderSummary;
};

export type GetNoteResponse = {
  message: string;
  data: NoteDetail;
};

export const notesRoute = {
  getNotes: createRoute<[], GetNoteExplorerResponse>(() => ({
    method: "GET",
    url: notesEndPoints.GET_ALL,
  })),

  getNote: createRoute<[id: number], GetNoteResponse>((id) => ({
    method: "GET",
    url: notesEndPoints.GET_ONE(id),
  })),

  createNote: createRoute<[payload: NoteSavePayload], GetNoteResponse>((payload) => ({
    method: "POST",
    url: notesEndPoints.CREATE,
    data: payload,
  })),

  updateNote: createRoute<[id: number, payload: NoteSavePayload], GetNoteResponse>((id, payload) => ({
    method: "PUT",
    url: notesEndPoints.UPDATE(id),
    data: payload,
  })),

  /** Rename only — the content is left alone, so unsaved editor edits survive it. */
  renameNote: createRoute<[id: number, title: string], GetNoteResponse>((id, title) => ({
    method: "PUT",
    url: notesEndPoints.RENAME(id),
    data: { title },
  })),

  /** Moves a note between folders — null is the root level. Never touches the buffer. */
  moveNote: createRoute<[id: number, folderId: number | null], GetNoteResponse>((id, folderId) => ({
    method: "PUT",
    url: notesEndPoints.MOVE(id),
    data: { folderId },
  })),

  deleteNote: createRoute<[id: number], { message: string }>((id) => ({
    method: "DELETE",
    url: notesEndPoints.DELETE_ONE(id),
  })),

  searchNotes: createRoute<[query: string], GetNotesResponse>((query) => ({
    method: "GET",
    url: notesEndPoints.SEARCH,
    params: { q: query },
  })),

  getBacklinks: createRoute<[id: number], GetNotesResponse>((id) => ({
    method: "GET",
    url: notesEndPoints.BACKLINKS(id),
  })),

  getLinks: createRoute<[], GetNoteLinksResponse>(() => ({
    method: "GET",
    url: notesEndPoints.LINKS,
  })),

  getRevisions: createRoute<[id: number], GetRevisionsResponse>((id) => ({
    method: "GET",
    url: notesEndPoints.REVISIONS(id),
  })),

  restoreRevision: createRoute<[id: number, revisionId: number], GetNoteResponse>((id, revisionId) => ({
    method: "POST",
    url: notesEndPoints.RESTORE(id, revisionId),
  })),

  createNoteFolder: createRoute<[name: string, parentId: number | null], NoteFolderResponse>((name, parentId) => ({
    method: "POST",
    url: notesEndPoints.CREATE_FOLDER,
    data: { name, parentId },
  })),

  renameNoteFolder: createRoute<[id: number, name: string], NoteFolderResponse>((id, name) => ({
    method: "PUT",
    url: notesEndPoints.RENAME_FOLDER(id),
    data: { name },
  })),

  moveNoteFolder: createRoute<[id: number, parentId: number | null], NoteFolderResponse>((id, parentId) => ({
    method: "PUT",
    url: notesEndPoints.MOVE_FOLDER(id),
    data: { parentId },
  })),

  /** Cascades: subfolders and every note inside them go with it. */
  deleteNoteFolder: createRoute<[id: number], { message: string }>((id) => ({
    method: "DELETE",
    url: notesEndPoints.DELETE_FOLDER(id),
  })),
};
