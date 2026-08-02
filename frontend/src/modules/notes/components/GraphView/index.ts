/* Default only, deliberately: re-exporting ForceGraph here would make `import GraphView from
 * ".../GraphView"` pull d3-force and the canvas painter into the eager notes chunk, and the lazy
 * split inside GraphView.tsx would become dead code. */
export { default } from "@/modules/notes/components/GraphView/GraphView";
