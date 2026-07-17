import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const notesEndPoints = {
  GET_ALL: `${BASE_URL_SERVER}/notes`,
  GET_ONE: (id: number) => `${BASE_URL_SERVER}/notes/${id}`,
  CREATE: `${BASE_URL_SERVER}/notes`,
  UPDATE: (id: number) => `${BASE_URL_SERVER}/notes/${id}`,
  DELETE_ONE: (id: number) => `${BASE_URL_SERVER}/notes/${id}`,
  SEARCH: `${BASE_URL_SERVER}/notes/search`,
  LINKS: `${BASE_URL_SERVER}/notes/links`,
  REVISIONS: (id: number) => `${BASE_URL_SERVER}/notes/${id}/revisions`,
  RESTORE: (id: number, revisionId: number) => `${BASE_URL_SERVER}/notes/${id}/revisions/${revisionId}/restore`,
  BACKLINKS: (id: number) => `${BASE_URL_SERVER}/notes/${id}/backlinks`,
};

export interface NoteSummary {
  id: number;
  title: string;
  tags: string[];
  updatedAt: string;
}

export interface NoteDetail {
  id: number;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteSavePayload {
  title?: string;
  content: string;
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

export type GetNotesResponse = {
  message: string;
  data: { notes: NoteSummary[] };
};

export type GetNoteResponse = {
  message: string;
  data: NoteDetail;
};

export const notesRoute = {
  getNotes: createRoute<[], GetNotesResponse>(() => ({
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
};
