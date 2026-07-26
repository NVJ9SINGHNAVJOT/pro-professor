import { useEffect, useMemo, useState } from "react";
import MermaidBlock from "@/components/common/MermaidBlock";
import { useApi } from "@/hooks/useApi";
import { notesRoute, type NoteLink, type NoteSummary } from "@/services/operations/notes/notes.route";

/** Mermaid node label: quoted string, quotes stripped (they'd close the label). */
const label = (text: string) => `"${text.replace(/"/g, "'")}"`;

/**
 * The note network rendered as a generated Mermaid `graph` definition — reuses the
 * same lazy Mermaid renderer as ```mermaid fences, so the graph view costs no
 * extra dependency. Non-interactive by design.
 */
interface GraphViewProps {
  /** The explorer list, loaded by the parent `/notes` route. */
  notes: NoteSummary[];
}

const GraphView = ({ notes }: GraphViewProps) => {
  const { execute: fetchLinks } = useApi(notesRoute.getLinks);
  const [links, setLinks] = useState<NoteLink[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchLinks();
      if (!res.error) setLinks(res.response.data.links);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const definition = useMemo(() => {
    if (links === null) return null;
    const lines = ["graph TD", "  classDef missing stroke-dasharray: 5 5,opacity:0.6"];
    notes.forEach((note) => lines.push(`  n${note.id}[${label(note.title)}]`));
    const missing = new Map<string, string>();
    links.forEach((link) => {
      const target = notes.find((note) => note.title.toLowerCase() === link.targetRef.toLowerCase());
      let targetId: string;
      if (target) {
        targetId = `n${target.id}`;
      } else {
        // unresolved reference — render as a dashed placeholder node
        const key = link.targetRef.toLowerCase();
        if (!missing.has(key)) {
          missing.set(key, `m${missing.size}`);
          lines.push(`  ${missing.get(key)}[${label(link.targetRef)}]:::missing`);
        }
        targetId = missing.get(key)!;
      }
      lines.push(`  n${link.sourceNoteId} ${link.linkType === "embed" ? "-.->" : "-->"} ${targetId}`);
    });
    return lines.join("\n");
  }, [links, notes]);

  return (
    <div className="chat-scroll h-full overflow-y-auto p-6">
      {definition === null ? (
        <p className="caption-regular text-neutral-500">Loading graph…</p>
      ) : notes.length === 0 ? (
        <p className="caption-regular text-neutral-500">No notes to graph yet</p>
      ) : (
        <MermaidBlock code={definition} />
      )}
    </div>
  );
};

export default GraphView;
