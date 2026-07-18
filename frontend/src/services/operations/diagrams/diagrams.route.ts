import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";

const diagramsEndPoints = {
  GET_ALL: `${BASE_URL_SERVER}/diagrams`,
  GET_ONE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}`,
  GET_BY_TITLE: (title: string) => `${BASE_URL_SERVER}/diagrams/by-title/${encodeURIComponent(title)}`,
  CREATE: `${BASE_URL_SERVER}/diagrams`,
  UPDATE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}`,
  DELETE_ONE: (id: number) => `${BASE_URL_SERVER}/diagrams/${id}`,
};

export interface DiagramSummary {
  id: number;
  title: string;
  updatedAt: string;
}

export interface DiagramDetail {
  id: number;
  title: string;
  /** The DiagramBundle document — validated client-side before entering the store. */
  content: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramSavePayload {
  title?: string;
  content: unknown;
  /** Snapshot the current row into diagram_revisions before overwriting (set on AI-edit saves). */
  snapshot?: boolean;
}

export type GetDiagramsResponse = {
  message: string;
  data: { diagrams: DiagramSummary[] };
};

export type GetDiagramResponse = {
  message: string;
  data: DiagramDetail;
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

  deleteDiagram: createRoute<[id: number], { message: string }>((id) => ({
    method: "DELETE",
    url: diagramsEndPoints.DELETE_ONE(id),
  })),
};
