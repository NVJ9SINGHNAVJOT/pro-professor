import type { LoaderFunctionArgs } from "react-router";
import { NEW_ITEM_ID } from "@/constants/routes";
import store from "@/redux/store";
import { setDiagrams } from "@/redux/slices/diagramListSlice";
import { setDiagramFolders } from "@/redux/slices/diagramFolderListSlice";
import { load } from "@/services/client/loadRoute";
import { diagramsRoute, type DiagramDetail } from "@/services/operations/diagrams/diagrams.route";

export type DiagramDetailLoaderData = {
  /** null on `/diagrams/new` — the draft canvas has no server-side row yet. */
  diagram: DiagramDetail | null;
};

/**
 * Parent `/diagrams` route: the sidebar list. It seeds `diagramList` and `diagramFolderList` rather
 * than returning loader data — the editor autosaves every ~800ms while you draw, and each save
 * patches that row's title and position from its own response instead of refetching the list. Runs
 * once per entry into the section (`shouldRevalidate: () => false`).
 *
 * Folders ride along in the same response, so the whole sidebar still costs one request.
 */
export async function diagramsListLoader({ request }: LoaderFunctionArgs) {
  const diagrams = await load(request.signal, diagramsRoute.getDiagrams);
  store.dispatch(setDiagramFolders(diagrams.data.folders));
  store.dispatch(setDiagrams(diagrams.data.diagrams));
  return null;
}

/**
 * Child `/diagrams/:diagramId` route: the open scene.
 *
 * `/diagrams/new` is the unsaved draft and rides on this same route (see `NEW_ITEM_ID`) — nothing
 * to fetch, and staying on one route is what keeps `<Excalidraw>` mounted (scene + undo history
 * intact) when the first autosave swaps `new` for a real id.
 */
export async function diagramDetailLoader({ params, request }: LoaderFunctionArgs): Promise<DiagramDetailLoaderData> {
  if (params.diagramId === NEW_ITEM_ID) return { diagram: null };

  const id = Number(params.diagramId);
  if (!Number.isFinite(id)) throw new Response("Not a diagram id", { status: 404 });

  const diagram = await load(request.signal, diagramsRoute.getDiagram, id);
  return { diagram: diagram.data };
}
