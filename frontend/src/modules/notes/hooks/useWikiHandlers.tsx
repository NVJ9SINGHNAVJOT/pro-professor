import { useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "@/components/common/toast";
import { type WikiHandlers } from "@/components/common/Markdown";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { upsertNote } from "@/redux/slices/notesSlice";
import { notesRoute } from "@/services/operations/notes/notes.route";
import { diagramsRoute } from "@/services/operations/diagrams/diagrams.route";
import NoteEmbed from "@/modules/notes/components/NoteEmbed";
import { DIAGRAM_SUFFIX } from "@/modules/notes/constants";
import { ROUTES } from "@/constants/routes";

/** Navigation + existence checks for wiki-links; clicking a missing link creates the note. */
function useWikiBase(): WikiHandlers {
  const notes = useAppSelector((state) => state.notes.notes);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { execute: createNote } = useApi(notesRoute.createNote);
  const { execute: fetchDiagramByTitle } = useApi(diagramsRoute.getDiagramByTitle);

  return useMemo<WikiHandlers>(
    () => ({
      linkExists: (target) => notes.some((note) => note.title.toLowerCase() === target.toLowerCase()),
      onLinkClick: async (target, heading) => {
        // `[[Title.diagram]]` is a link to a standalone diagram — resolve title→id and open the diagram page.
        if (target.toLowerCase().endsWith(DIAGRAM_SUFFIX)) {
          const title = target.slice(0, -DIAGRAM_SUFFIX.length);
          const res = await fetchDiagramByTitle(title);
          if (res.error) {
            toast.error(`No diagram titled "${title}"`);
            return;
          }
          navigate(ROUTES.DIAGRAMS_DETAIL(res.response.data.id));
          return;
        }
        const existing = notes.find((note) => note.title.toLowerCase() === target.toLowerCase());
        if (existing) {
          // the heading rides along as router state; NotesScreen scrolls the preview to it
          navigate(ROUTES.NOTES_DETAIL(existing.id), { state: heading ? { heading } : undefined });
          return;
        }
        // Obsidian behavior: clicking an unresolved link creates the note.
        const res = await createNote({ title: target, content: `# ${target}\n\n` });
        if (res.error) {
          toast.error("Failed to create note");
          return;
        }
        const detail = res.response.data;
        dispatch(upsertNote({ id: detail.id, title: detail.title, tags: detail.tags, updatedAt: detail.updatedAt }));
        navigate(ROUTES.NOTES_DETAIL(detail.id));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes],
  );
}

/** Full wiki handlers for the note preview: links + `![[...]]` transclusions. */
export function useWikiHandlers(): WikiHandlers {
  const base = useWikiBase();
  return useMemo<WikiHandlers>(
    () => ({
      ...base,
      // `![[...]]` transcludes a note/image. Diagrams are referenced by LINK
      // (`[[Title.diagram]]`), handled in onLinkClick — not embedded inline.
      renderEmbed: (target, heading) => <NoteEmbed target={target} heading={heading} wiki={base} />,
    }),
    [base],
  );
}
