import { data, type ShouldRevalidateFunction } from "react-router";
import { NEW_ITEM_ID } from "@/constants/routes";
import { fetchApi } from "@/services/client/fetchApi";
import type { ApiRoute } from "@/services/client/apiRoute";

/**
 * Runs an ApiRoute inside a router loader. `fetchApi` never throws — it returns
 * `{ error, response }` — but a loader needs the opposite contract, so a failure is
 * re-thrown as a router error response and the route's `errorElement` renders instead
 * of the screen.
 *
 * Always pass the loader's `request.signal` so an interrupted navigation cancels its
 * in-flight fetches.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function load<A extends any[], R>(signal: AbortSignal, route: ApiRoute<A, R>, ...args: A): Promise<R> {
  const result = await fetchApi<R>({ ...route.build(...args), signal });
  if (result.error) throw data(result.error, { status: result.error.status || 500 });
  return result.response;
}

/** Same as `load`, but a failure yields `fallback` — for data that must not fail the whole page. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadOptional<A extends any[], R>(
  fallback: R,
  signal: AbortSignal,
  route: ApiRoute<A, R>,
  ...args: A
): Promise<R> {
  const result = await fetchApi<R>({ ...route.build(...args), signal });
  return result.error ? fallback : result.response;
}

/** Per section param, the id its screen just created — pending that screen's own `new → :id` hop. */
const draftCreated = new Map<string, string>();

/**
 * Called by a screen immediately before it navigates a saved draft to its real URL. That hop is
 * the screen relabeling *itself*: it already holds the item the server just returned (and on chat
 * it is mid-stream), so the loader must not run — a refetch there costs a request and puts the app
 * in a pending navigation, progress bar and all, for data nobody is waiting on.
 */
export const markDraftCreated = (param: string, id: number) => {
  draftCreated.set(param, String(id));
};

/** True (once) if `id` is the item that screen just created and is navigating to. */
const consumeDraftCreated = (param: string, id: string | undefined): boolean => {
  if (id === undefined || draftCreated.get(param) !== id) return false;
  draftCreated.delete(param);
  return true;
};

/**
 * `shouldRevalidate` for a section's **item** loader (`/notes/:noteId`, `/chat/:chatId`,
 * `/diagrams/:diagramId`). The open item is arrival data: it only needs refetching when the URL
 * names a *different* one. Without this, React Router's default refetches it on any navigation
 * that keeps the route matched — including a same-URL one carrying router state (a
 * `[[Note#Heading]]` jump).
 *
 * The `new → :id` hop is a different id, so it is only skipped when the screen marked it
 * (`markDraftCreated`) — opening an *existing* item from the draft screen is the same param hop
 * and must still load.
 */
export const detailShouldRevalidate =
  (param: string): ShouldRevalidateFunction =>
  ({ currentParams, nextParams }) => {
    if (currentParams[param] === NEW_ITEM_ID && consumeDraftCreated(param, nextParams[param])) return false;
    return currentParams[param] !== nextParams[param];
  };
