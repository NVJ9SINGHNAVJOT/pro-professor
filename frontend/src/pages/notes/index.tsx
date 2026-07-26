import { useLoaderData } from "react-router";
import NotesScreen from "@/modules/notes/screens/NotesScreen";
import { useAppSelector } from "@/redux/store";
import { type NoteDetailLoaderData } from "@/pages/notes/loader";

export default function NotesPage() {
  // The explorer list is Redux state seeded by the parent route's loader, so a save can patch one
  // row instead of refetching the list; the open note stays plain loader data.
  const notes = useAppSelector((state) => state.notesList.items);
  // undefined on the index route (`/notes`), which has no detail loader
  const data = useLoaderData<NoteDetailLoaderData | undefined>();
  return <NotesScreen notes={notes} loadedNote={data?.note ?? null} backlinks={data?.backlinks ?? []} />;
}
