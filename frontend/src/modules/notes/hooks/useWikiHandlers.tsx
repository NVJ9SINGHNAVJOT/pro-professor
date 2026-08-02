import { useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "@/components/common/toast";
import { type WikiHandlers } from "@/components/common/Markdown";
import { useApi } from "@/hooks/useApi";
import { type NoteSummary } from "@/services/operations/notes/notes.route";
import { diagramsRoute } from "@/services/operations/diagrams/diagrams.route";
import NoteEmbed from "@/modules/notes/components/NoteEmbed";
import { DIAGRAM_SUFFIX } from "@/modules/notes/constants";
import { ROUTES } from "@/constants/routes";

/** Navigation + existence checks for wiki-links; clicking a missing link opens a draft for it. */
function useWikiBase(notes: NoteSummary[], embedUrls?: Record<string, string>): WikiHandlers {
  const navigate = useNavigate();
  const { execute: fetchDiagramByTitle } = useApi(diagramsRoute.getDiagramByTitle);

  return useMemo<WikiHandlers>(
    () => ({
      embedUrls,
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
        // Obsidian behavior: clicking an unresolved link opens the note it would create — as a
        // draft, so nothing is written (and nothing is fetched) until it's saved.
        navigate(`${ROUTES.NOTES_NEW}?title=${encodeURIComponent(target)}`);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, embedUrls],
  );
}

/** Full wiki handlers for the note preview: links + `![[...]]` transclusions. */
export function useWikiHandlers(notes: NoteSummary[], embedUrls?: Record<string, string>): WikiHandlers {
  const base = useWikiBase(notes, embedUrls);
  return useMemo<WikiHandlers>(
    () => ({
      ...base,
      // `![[...]]` transcludes a note/image. Diagrams are referenced by LINK
      // (`[[Title.diagram]]`), handled in onLinkClick — not embedded inline.
      renderEmbed: (target, heading) => <NoteEmbed target={target} heading={heading} wiki={base} notes={notes} />,
    }),
    [base, notes],
  );
}
