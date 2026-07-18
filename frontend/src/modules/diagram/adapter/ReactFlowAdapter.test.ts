import { describe, expect, it } from "vitest";
import { toFlowEdges, toFlowNodes } from "@/modules/diagram/adapter/ReactFlowAdapter";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";
import { NODE_TYPES, EDGE_TYPES } from "@/modules/diagram/types";

describe("ReactFlowAdapter", () => {
  it("maps placed nodes to their layout position and pins their size", () => {
    const bundle = makeSampleBundle();
    const nodes = toFlowNodes(bundle.semantic.nodes, bundle.layout);

    const gateway = nodes.find((node) => node.id === "gateway");
    expect(gateway).toMatchObject({
      type: "service",
      position: { x: 0, y: 0 },
      width: 180,
      height: 64,
      data: { label: "API Gateway" },
    });
  });

  it("grids unplaced nodes below the arranged content without pinning size", () => {
    const bundle = makeSampleBundle();
    const nodes = toFlowNodes(bundle.semantic.nodes, bundle.layout);

    const todo = nodes.find((node) => node.id === "todo");
    // placed content ends at y = 40 + 64; fallback grid starts below with the gap
    expect(todo?.position.y).toBeGreaterThan(104);
    expect(todo?.width).toBeUndefined();
  });

  it("maps edges with type and optional label", () => {
    const bundle = makeSampleBundle();
    const edges = toFlowEdges(bundle.semantic.edges);
    expect(edges[0]).toMatchObject({ source: "gateway", target: "db", type: "straight", label: "reads/writes" });
    expect(edges[1]).not.toHaveProperty("label");
  });
});

describe("registry sync", () => {
  it("registered component maps match the validated type lists", async () => {
    const { nodeTypes } = await import("@/modules/diagram/nodes/registry");
    const { edgeTypes } = await import("@/modules/diagram/edges/registry");
    expect(Object.keys(nodeTypes).sort()).toEqual([...NODE_TYPES].sort());
    expect(Object.keys(edgeTypes).sort()).toEqual([...EDGE_TYPES].sort());
  });
});
