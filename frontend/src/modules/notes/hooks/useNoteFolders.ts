import { useNavigate } from "react-router";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { removeNote, upsertNote } from "@/redux/slices/notesListSlice";
import { removeNoteFolder, upsertNoteFolder } from "@/redux/slices/noteFolderListSlice";
import { expandFolder, forgetFolders } from "@/redux/slices/notesSidebarSlice";
import { notesRoute, type NoteFolderSummary, type NoteSummary } from "@/services/operations/notes/notes.route";
import { ROUTES } from "@/constants/routes";
import { descendantIds, isDescendant } from "@/utils/folderTree";

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

  const { execute: deleteNoteRequest } = useApi(notesRoute.deleteNote);
  const { execute: moveNote } = useApi(notesRoute.moveNote);
  const { execute: createFolderRequest } = useApi(notesRoute.createNoteFolder);
  const { execute: renameFolderRequest } = useApi(notesRoute.renameNoteFolder);
  const { execute: moveFolder } = useApi(notesRoute.moveNoteFolder);
  const { execute: deleteFolderRequest } = useApi(notesRoute.deleteNoteFolder);

  const deleteNote = async (id: number) => {
    const res = await deleteNoteRequest(id);
    if (res.error) {
      toast.error("Failed to delete note");
      return;
    }
    dispatch(removeNote(id));
    if (openId === id) navigate(ROUTES.NOTES);
  };

  /** @returns the new folder's id, so the caller can open it straight into rename. */
  const addFolder = async (parentId: number | null): Promise<number | null> => {
    const res = await createFolderRequest("New folder", parentId);
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
   * The server cascades — subfolders and every note inside them go with the folder. On success
   * prune the same subtree locally instead of refetching the explorer.
   */
  const deleteFolder = async (id: number) => {
    const res = await deleteFolderRequest(id);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    const gone = descendantIds(folders, id);
    const goneNoteIds = notes.filter((n) => n.folderId !== null && gone.has(n.folderId)).map((n) => n.id);
    gone.forEach((folderId) => dispatch(removeNoteFolder(folderId)));
    goneNoteIds.forEach((deletedId) => dispatch(removeNote(deletedId)));
    dispatch(forgetFolders([...gone]));
    if (openId !== null && goneNoteIds.includes(openId)) navigate(ROUTES.NOTES);
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

  return { deleteNote, addFolder, renameFolder, deleteFolder, moveRow };
}
