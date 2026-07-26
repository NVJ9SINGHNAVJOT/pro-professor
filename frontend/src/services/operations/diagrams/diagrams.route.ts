import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const diagramsEndPoints = {
  GET_ALL: `${BASE_URL_SERVER}/diagrams`,
  GET_ONE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}`,
  GET_BY_TITLE: (title: string) => `${BASE_URL_SERVER}/diagrams/by-title/${encodeURIComponent(title)}`,
  CREATE: `${BASE_URL_SERVER}/diagrams`,
  UPDATE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}`,
  MOVE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}/folder`,
  DELETE_ONE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}`,
  CREATE_FOLDER: `${BASE_URL_SERVER}/diagram-folders`,
  RENAME_FOLDER: (id: number) => `${BASE_URL_SERVER}/diagram-folders/${id}`,
  MOVE_FOLDER: (id: number) => `${BASE_URL_SERVER}/diagram-folders/${id}/parent`,
  DELETE_FOLDER: (id: number) => `${BASE_URL_SERVER}/diagram-folders/${id}`,
};

/** A sidebar folder. `parentId` is null at the root level; the tree is built client-side. */
export interface DiagramFolderSummary {
  id: number;
  name: string;
  parentId: number | null;
}

export interface DiagramSummary {
  id: number;
  title: string;
  /** null at the root level. */
  folderId: number | null;
  updatedAt: string;
}

export interface DiagramDetail {
  id: number;
  title: string;
  /** The Excalidraw scene document ({ type, elements, appState, files }). */
  content: unknown;
  folderId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramSavePayload {
  title?: string;
  content: unknown;
}

export type GetDiagramsResponse = {
  message: string;
  data: { folders: DiagramFolderSummary[]; diagrams: DiagramSummary[] };
};

export type GetDiagramResponse = {
  message: string;
  data: DiagramDetail;
};

export type DiagramFolderResponse = {
  message: string;
  data: DiagramFolderSummary;
};

export const diagramsRoute = {
  getDiagrams: createRoute<[], GetDiagramsResponse>(() => ({
    method: "GET",
    url: diagramsEndPoints.GET_ALL,
  })),

  getDiagram: createRoute<[id: number], GetDiagramResponse>((id) => ({
    method: "GET",
    url: diagramsEndPoints.GET_ONE(id),
  })),

  getDiagramByTitle: createRoute<[title: string], GetDiagramResponse>((title) => ({
    method: "GET",
    url: diagramsEndPoints.GET_BY_TITLE(title),
  })),

  createDiagram: createRoute<[payload: DiagramSavePayload], GetDiagramResponse>((payload) => ({
    method: "POST",
    url: diagramsEndPoints.CREATE,
    data: payload,
  })),

  updateDiagram: createRoute<[id: number, payload: DiagramSavePayload], GetDiagramResponse>((id, payload) => ({
    method: "PUT",
    url: diagramsEndPoints.UPDATE(id),
    data: payload,
  })),

  /**
   * Moves a diagram between folders — `null` is the root level. Deliberately not part of
   * `updateDiagram`: that one is the editor's autosave, and folding the folder into it would make
   * every save send an absent `folderId` and drag the diagram back to the root.
   */
  moveDiagram: createRoute<[id: number, folderId: number | null], GetDiagramResponse>((id, folderId) => ({
    method: "PUT",
    url: diagramsEndPoints.MOVE(id),
    data: { folderId },
  })),

  deleteDiagram: createRoute<[id: number], { message: string }>((id) => ({
    method: "DELETE",
    url: diagramsEndPoints.DELETE_ONE(id),
  })),

  createDiagramFolder: createRoute<[name: string, parentId: number | null], DiagramFolderResponse>(
    (name, parentId) => ({
      method: "POST",
      url: diagramsEndPoints.CREATE_FOLDER,
      data: { name, parentId },
    }),
  ),

  renameDiagramFolder: createRoute<[id: number, name: string], DiagramFolderResponse>((id, name) => ({
    method: "PUT",
    url: diagramsEndPoints.RENAME_FOLDER(id),
    data: { name },
  })),

  moveDiagramFolder: createRoute<[id: number, parentId: number | null], DiagramFolderResponse>((id, parentId) => ({
    method: "PUT",
    url: diagramsEndPoints.MOVE_FOLDER(id),
    data: { parentId },
  })),

  /** 409 when any diagram in the folder's subtree is still linked from a note. */
  deleteDiagramFolder: createRoute<[id: number], { message: string }>((id) => ({
    method: "DELETE",
    url: diagramsEndPoints.DELETE_FOLDER(id),
  })),
};
