import { DIAGRAM_SCHEMA_VERSION, type DiagramBundle } from "@/modules/diagram/types";

/** A small known-good bundle: 3 nodes (one of each registered type), 2 edges, 2 placed nodes. */
export function makeSampleBundle(): DiagramBundle {
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    semantic: {
      nodes: [
        { id: "gateway", type: "service", label: "API Gateway" },
        { id: "db", type: "database", label: "PostgreSQL" },
        { id: "todo", type: "note", label: "Add a cache here later" },
      ],
      edges: [
        { id: "e1", source: "gateway", target: "db", type: "straight", label: "reads/writes" },
        { id: "e2", source: "todo", target: "gateway", type: "curved" },
      ],
    },
    layout: {
      gateway: { x: 0, y: 0, w: 180, h: 64 },
      db: { x: 320, y: 40, w: 180, h: 64 },
      // "todo" intentionally unplaced — layout keys are a subset of semantic nodes
    },
    theme: "default-dark",
    metadata: {
      created: "2026-07-18T00:00:00Z",
      updated: "2026-07-18T00:00:00Z",
      rendererVersion: "1",
    },
  };
}
