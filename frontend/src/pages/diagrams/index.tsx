import { useLoaderData } from "react-router";
import DiagramsScreen from "@/modules/diagram/screens/DiagramsScreen";
import { useAppSelector } from "@/redux/store";
import type { DiagramDetailLoaderData } from "@/pages/diagrams/loader";

export default function DiagramsPage() {
  // The list is Redux state seeded by the parent route's loader, so an autosave can patch one row
  // instead of refetching the list; the open scene stays plain loader data.
  const diagrams = useAppSelector((state) => state.diagramList.items);
  const folders = useAppSelector((state) => state.diagramFolderList.items);
  // undefined on the index route (`/diagrams`), which has no detail loader
  const data = useLoaderData<DiagramDetailLoaderData | undefined>();
  return <DiagramsScreen diagrams={diagrams} folders={folders} diagram={data?.diagram ?? null} />;
}
