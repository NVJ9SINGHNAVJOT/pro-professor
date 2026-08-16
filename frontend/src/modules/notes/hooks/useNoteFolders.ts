import { useNavigate, useSearchParams } from "react-router";
import { confirm } from "@/components/common/confirm";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { removeNote, upsertNote } from "@/redux/slices/notesListSlice";
import { removeNoteFolder, upsertNoteFolder } from "@/redux/slices/noteFolderListSlice";
import { expandFolder, forgetFolders } from "@/redux/slices/notesSidebarSlice";
import { notesRoute, type NoteFolderSummary, type NoteSummary } from "@/services/operations/notes/notes.route";
import { summaryOf } from "@/modules/notes/utils";
import { ROUTES } from "@/constants/routes";
import { ancestorIds, descendantIds, isDescendant, nextUntitled } from "@/utils/folderTree";
import { cascadeMessage } from "@/utils/cascade";

/** What a move is carrying. Shared by the sidebar tree's drag and the explorer grid's. */
export type NoteRow = { kind: "folder"; id: number } | { kind: "note"; id: number };

/**
 * Every folder mutation the note explorer can perform, in one place.
 *
 * Both surfaces need all of them — the sidebar tree and the center-pane grid — and they are two
 * different components in two different files, so the alternative was passing a dozen handlers
 * down from `NotesScreen` into a memoized `NoteList` and defeating the memo.
 *
 * Each one patches the two list slices locally rather than refetching the explorer, the same
 * contract the rest of the app follows (see `createListSlice`).
 */
export function useNoteFolders(notes: NoteSummary[], folders: NoteFolderSummary[], openId: number | null) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();

  const { execute: createNoteRequest } = useApi(notesRoute.createNote);
  const { execute: deleteNoteRequest } = useApi(notesRoute.deleteNote);
  const { execute: moveNote } = useApi(notesRoute.moveNote);
  const { execute: createFolderRequest } = useApi(notesRoute.createNoteFolder);
  const { execute: renameFolderRequest } = useApi(notesRoute.renameNoteFolder);
  const { execute: moveFolder } = useApi(notesRoute.moveNoteFolder);
  const { execute: deleteFolderRequest } = useApi(notesRoute.deleteNoteFolder);

  /**
   * The name a "New note" field opens with — the first free "Untitled".
   *
   * Checked against every note, not just the folder's: note titles are globally unique server-side
   * (`notes_title_unique`) because `[[wiki links]]` resolve by title alone.
   */
  const suggestedNoteTitle = () =>
    nextUntitled(
      notes.map((note) => note.title),
      "Untitled",
    );

  /**
   * Creates the note a placeholder row stood for and opens it.
   *
   * The right-click path, as opposed to the toolbar button's draft: the row has to exist the moment
   * the name is accepted, because the whole point of the placeholder is that you can see where the
   * note is going before it is there.
   *
   * Listing the row and navigating happen in one batch, so the placeholder the caller is still
   * showing is replaced by the real row in a single frame — never both, never neither.
   *
   * @returns whether the note was created.
   */
  const createNoteNamed = async (title: string, folderId: number | null): Promise<boolean> => {
    const res = await createNoteRequest({ title, content: "", folderId });
    if (res.error) {
      toast.error(res.error.message || "Failed to create note");
      return false;
    }
    const detail = res.response.data;
    dispatch(upsertNote(summaryOf(detail)));
    navigate(ROUTES.NOTES_DETAIL(detail.id));
    return true;
  };

  const deleteNote = async (id: number) => {
    const res = await deleteNoteRequest(id);
    // An abort is this hook's own doing — `useApi` cancels the previous call of the same instance,
    // so deleting a second row supersedes the first request the server has already carried out.
    // Treat it as done rather than reporting a failure and leaving a row that no longer exists.
    if (res.error && !res.error.aborted) {
      toast.error(res.error.message || "Failed to delete note");
      return;
    }
    dispatch(removeNote(id));
    if (openId === id) navigate(ROUTES.NOTES);
  };

  /** @returns the new folder's id, so the caller can open it straight into rename. */
  const addFolder = async (parentId: number | null): Promise<number | null> => {
    const siblings = folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.name);
    const res = await createFolderRequest(nextUntitled(siblings, "New folder"), parentId);
    if (res.error) {
      toast.error("Failed to create folder");
      return null;
    }
    const folder = res.response.data;
    dispatch(upsertNoteFolder(folder));
    // Or the new folder would be created inside one that is shut, and vanish.
    if (parentId !== null) dispatch(expandFolder(parentId));
    return folder.id;
  };

  const renameFolder = async (id: number, name: string) => {
    const res = await renameFolderRequest(id, name);
    if (res.error) {
      toast.error("Failed to rename folder");
      return;
    }
    dispatch(upsertNoteFolder(res.response.data));
  };

  /**
   * The server cascades — subfolders and every note inside them go with the folder, with no
   * reference guard and nothing to undo it — so this asks first, naming what goes. On success
   * prune the same subtree locally instead of refetching the explorer.
   */
  const deleteFolder = async (id: number) => {
    const folder = folders.find((f) => f.id === id);
    if (folder === undefined) return;
    // Computed before the request so the dialog can say what it costs.
    const gone = descendantIds(folders, id);
    const goneNoteIds = notes.filter((n) => n.folderId !== null && gone.has(n.folderId)).map((n) => n.id);

    const confirmed = await confirm({
      title: `Delete "${folder.name}"?`,
      message: cascadeMessage(goneNoteIds.length, "note", gone.size - 1),
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    const res = await deleteFolderRequest(id);
    if (res.error && !res.error.aborted) {
      toast.error(res.error.message);
      return;
    }
    gone.forEach((folderId) => dispatch(removeNoteFolder(folderId)));
    goneNoteIds.forEach((deletedId) => dispatch(removeNote(deletedId)));
    dispatch(forgetFolders([...gone]));
    // Leaving for the root drops the query string with it, so nothing below has to run.
    if (openId !== null && goneNoteIds.includes(openId)) {
      navigate(ROUTES.NOTES);
      return;
    }
    leaveDeletedFolders(gone);
  };

  /**
   * Walks the grid's `?folder=` out of a subtree that was just deleted, up to the nearest survivor.
   *
   * Left pointing at a folder that no longer exists, the grid shows an empty pane under a
   * breadcrumb that has collapsed to the root, and creating in it would POST a dead `parentId`.
   * `folders` is still the pre-delete list here, so the chain up from the dead folder is intact.
   */
  const leaveDeletedFolders = (gone: Set<number>) => {
    const browsing = Number(searchParams.get("folder"));
    if (!gone.has(browsing)) return;
    const survivor = ancestorIds(folders, browsing).find((folderId) => !gone.has(folderId));
    const next = new URLSearchParams(searchParams);
    if (survivor === undefined) next.delete("folder");
    else next.set("folder", String(survivor));
    setSearchParams(next, { replace: true });
  };

  /**
   * Moves a row into `folderId` (null = the root level).
   *
   * Applied locally first and rolled back if the server refuses: awaiting the round-trip before
   * redrawing leaves the row sitting under the cursor after the drop, and the drag feels stuck.
   */
  const moveRow = async (item: NoteRow, folderId: number | null) => {
    // Open the target, or the row just dropped would vanish into a collapsed folder.
    if (folderId !== null) dispatch(expandFolder(folderId));

    if (item.kind === "note") {
      const moved = notes.find((n) => n.id === item.id);
      if (moved === undefined || moved.folderId === folderId) return;
      dispatch(upsertNote({ id: item.id, folderId }));
      const res = await moveNote(item.id, folderId);
      if (res.error) {
        dispatch(upsertNote({ id: item.id, folderId: moved.folderId }));
        toast.error("Failed to move note");
      }
      return;
    }

    const moved = folders.find((f) => f.id === item.id);
    if (moved === undefined || moved.parentId === folderId) return;
    // A folder dropped into itself or its own descendant would strand that whole branch.
    if (folderId !== null && isDescendant(folders, folderId, item.id)) return;
    dispatch(upsertNoteFolder({ id: item.id, parentId: folderId }));
    const res = await moveFolder(item.id, folderId);
    if (res.error) {
      dispatch(upsertNoteFolder({ id: item.id, parentId: moved.parentId }));
      toast.error("Failed to move folder");
    }
  };

  return { suggestedNoteTitle, createNoteNamed, deleteNote, addFolder, renameFolder, deleteFolder, moveRow };
}
