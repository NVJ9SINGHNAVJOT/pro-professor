import type { LoaderFunctionArgs } from "react-router";
import { NEW_ITEM_ID } from "@/constants/routes";
import store from "@/redux/store";
import { setNotes } from "@/redux/slices/notesListSlice";
import { setNoteFolders } from "@/redux/slices/noteFolderListSlice";
import { load } from "@/services/client/loadRoute";
import { notesRoute, type NoteDetail, type NoteSummary } from "@/services/operations/notes/notes.route";

export type NoteDetailLoaderData = {
  /** null on `/notes/new` — the draft has no server-side note yet. */
  note: NoteDetail | null;
  /** Notes linking to this one — the context panel is open by default, so this is arrival data. */
  backlinks: NoteSummary[];
};

/**
 * Parent `/notes` route: the explorer list. It seeds `notesList` rather than returning loader
 * data — a save patches that one row (title, tags, position) from the response it already has,
 * which a loader result can't do. Runs once per entry into the section
 * (`shouldRevalidate: () => false`).
 *
 * The list is also what resolves titles for NoteList, GraphView, NoteEmbed, the command palette
 * and useWikiHandlers, so all of them see the patch immediately.
 */
export async function notesListLoader({ request }: LoaderFunctionArgs) {
  const explorer = await load(request.signal, notesRoute.getNotes);
  // One response, two slices — the tree can't draw a level without both halves.
  store.dispatch(setNoteFolders(explorer.data.folders));
  store.dispatch(setNotes(explorer.data.notes));
  return null;
}

/**
 * Child `/notes/:noteId` route: the open note plus its backlinks, in parallel.
 *
 * `/notes/new` is the unsaved draft and rides on this same route (see `NEW_ITEM_ID`) — there is
 * nothing to fetch, and staying on one route is what keeps NotesScreen mounted when the first
 * save swaps `new` for a real id.
 */
export async function noteDetailLoader({ params, request }: LoaderFunctionArgs): Promise<NoteDetailLoaderData> {
  if (params.noteId === NEW_ITEM_ID) return { note: null, backlinks: [] };

  const id = Number(params.noteId);
  if (!Number.isFinite(id)) throw new Response("Not a note id", { status: 404 });

  const [note, backlinks] = await Promise.all([
    load(request.signal, notesRoute.getNote, id),
    load(request.signal, notesRoute.getBacklinks, id),
  ]);

  return { note: note.data, backlinks: backlinks.data.notes };
}
