import { useMemo } from "react";
import MermaidBlock from "@/components/common/MermaidBlock";
import { GRAPH_VIEW_MAX_SCALE } from "@/constants/ui";
import type { GraphModel } from "@/modules/notes/types";

/** Mermaid node label: quoted string, quotes stripped (they'd close the label). */
const label = (text: string) => `"${text.replace(/"/g, "'")}"`;

/**
 * The note network as a generated Mermaid `graph` definition — the graph view's original renderer,
 * and still its default. It reuses the same lazy Mermaid renderer as ```mermaid fences, so it costs
 * no extra dependency, and its hierarchical layout is the better read for a chain of links.
 * Non-interactive by design; the interactive graph is the other renderer.
 */
const MermaidGraph = ({ model }: { model: GraphModel }) => {
  const definition = useMemo(() => {
    const lines = ["graph TD", "  classDef missing stroke-dasharray: 5 5,opacity:0.6"];
    // Mermaid ids can't carry the model's `note:1` / `ref:foo` namespacing — it reads the colon as
    // syntax — so each node gets a safe alias here.
    const alias = new Map<string, string>();
    model.nodes.forEach((node, index) => {
      const id = node.noteId === null ? `m${index}` : `n${node.noteId}`;
      alias.set(node.id, id);
      lines.push(`  ${id}[${label(node.title)}]${node.noteId === null ? ":::missing" : ""}`);
    });
    model.edges.forEach((edge) => {
      lines.push(`  ${alias.get(edge.source)} ${edge.linkType === "embed" ? "-.->" : "-->"} ${alias.get(edge.target)}`);
    });
    return lines.join("\n");
  }, [model]);

  return <MermaidBlock code={definition} fill maxScale={GRAPH_VIEW_MAX_SCALE} />;
};

export default MermaidGraph;
