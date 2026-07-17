import { useEffect, useState } from "react";
import Markdown, { type WikiHandlers } from "@/components/common/Markdown";
import { useApi } from "@/hooks/useApi";
import { useAppSelector } from "@/redux/store";
import { notesRoute } from "@/services/operations/notes/notes.route";
import { mediaApi } from "@/services/operations/media/media.api";
import { extractSection, isImageTarget, stripFrontmatter } from "@/modules/notes/utils";

interface NoteEmbedProps {
  target: string;
  /** Transclude only this heading's section (the `![[Note#Heading]]` form). */
  heading?: string;
  /** Depth-1 handlers (no renderEmbed) — nested embeds render as plain wiki-links. */
  wiki: WikiHandlers;
}

/** `![[target]]` transclusion: an image via the media service, or another note's body inline. */
const NoteEmbed = ({ target, heading, wiki }: NoteEmbedProps) => {
  const notes = useAppSelector((state) => state.notes.notes);
  const { execute: fetchNote } = useApi(notesRoute.getNote);
  const [body, setBody] = useState<string | null>(null);

  const embedded = notes.find((note) => note.title.toLowerCase() === target.toLowerCase());
  const embeddedId = embedded?.id;

  useEffect(() => {
    if (embeddedId === undefined) return;
    (async () => {
      const res = await fetchNote(embeddedId);
      if (!res.error) setBody(res.response.data.content);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedId]);

  if (isImageTarget(target)) {
    return <img src={mediaApi.fileByNameUrl(target)} alt={target} className="my-2 max-h-96 max-w-full rounded-xl" />;
  }
  if (!embedded) {
    return (
      <span className="my-2 block rounded-xl border border-dashed border-neutral-700 px-3 py-2 caption-small-regular text-neutral-500">
        Unresolved embed: [[{target}]]
      </span>
    );
  }
  return (
    <span className="my-2 block rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <span className="mb-1 block caption-small-medium text-neutral-500">
        {embedded.title}
        {heading && ` › ${heading}`}
      </span>
      {body !== null && (
        <Markdown wiki={wiki}>
          {heading ? extractSection(stripFrontmatter(body), heading) : stripFrontmatter(body)}
        </Markdown>
      )}
    </span>
  );
};

export default NoteEmbed;
