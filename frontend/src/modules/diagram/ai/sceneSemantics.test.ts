import { describe, expect, it } from "vitest";
import { applyCommands, buildSkeletons, placeNewNodes, readSemantics } from "@/modules/diagram/ai/sceneSemantics";
import type { DiagramCommand } from "@/modules/diagram/types";

/** A minimal two-node, one-edge scene: a → b, labelled "Alpha"/"Beta". */
const scene = [
  { id: "ra", type: "rectangle", x: 0, y: 0, width: 160, height: 64, boundElements: [{ id: "ta", type: "text" }], customData: { nodeId: "a" } },
  { id: "ta", type: "text", x: 0, y: 0, width: 0, height: 0, text: "Alpha", containerId: "ra" },
  { id: "rb", type: "ellipse", x: 300, y: 0, width: 160, height: 64, boundElements: [{ id: "tb", type: "text" }], customData: { nodeId: "b" } },
  { id: "tb", type: "text", x: 0, y: 0, width: 0, height: 0, text: "Beta", containerId: "rb" },
  { id: "ar", type: "arrow", x: 0, y: 0, width: 0, height: 0, startBinding: { elementId: "ra" }, endBinding: { elementId: "rb" }, customData: { edgeId: "e1" } },
];

describe("readSemantics", () => {
  it("recovers the logical graph from tagged elements", () => {
    const { nodes, edges } = readSemantics(scene);
    expect(nodes).toEqual([
      expect.objectContaining({ id: "a", label: "Alpha", shape: "rectangle" }),
      expect.objectContaining({ id: "b", label: "Beta", shape: "ellipse" }),
    ]);
    expect(edges).toEqual([{ id: "e1", source: "a", target: "b", label: undefined }]);
  });

  it("ignores elements without our customData tags", () => {
    const { nodes, edges } = readSemantics([{ id: "x", type: "rectangle", x: 0, y: 0, width: 1, height: 1 }]);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});

describe("applyCommands", () => {
  const base = readSemantics(scene);

  it("adds a node and connects it, tracking new ids", () => {
    const ops: DiagramCommand[] = [
      { op: "addNode", node: { id: "c", label: "Cache", shape: "diamond" } },
      { op: "connectNodes", source: "b", target: "c", label: "writes" },
    ];
    const result = applyCommands(base, ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newNodeIds).toEqual(["c"]);
    expect(result.semantics.nodes.map((n) => n.id)).toContain("c");
    expect(result.semantics.edges).toContainEqual(expect.objectContaining({ source: "b", target: "c", label: "writes" }));
  });

  it("deletes a node and cascades its edges", () => {
    const result = applyCommands(base, [{ op: "deleteNode", id: "a" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.semantics.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(result.semantics.edges).toHaveLength(0); // e1 (a→b) removed with a
  });

  it("rejects an op that references a missing node", () => {
    const result = applyCommands(base, [{ op: "renameNode", id: "zzz", label: "X" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/no node "zzz"/);
  });
});

describe("buildSkeletons", () => {
  it("emits container + arrow skeletons that bind by node id", () => {
    const semantics = readSemantics(scene);
    placeNewNodes(semantics, new Set());
    const skeletons = buildSkeletons(semantics);
    const arrow = skeletons.find((s) => s.type === "arrow") as { start: { id: string }; end: { id: string } };
    expect(arrow.start.id).toBe("a");
    expect(arrow.end.id).toBe("b");
    const node = skeletons.find((s) => s.type === "rectangle") as { id: string; label: { text: string } };
    expect(node.id).toBe("a");
    expect(node.label.text).toBe("Alpha");
  });
});
