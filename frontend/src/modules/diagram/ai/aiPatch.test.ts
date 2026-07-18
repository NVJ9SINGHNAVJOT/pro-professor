import { describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "@/redux/rootReducer";
import { bundleLoaded } from "@/modules/diagram/model/actions";
import { selectBundle } from "@/modules/diagram/model/selectors";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";
import { parsePatchText } from "@/modules/diagram/ai/patchParser";
import { applyAiPatch } from "@/modules/diagram/ai/applyAiPatch";
import { undoCommand } from "@/modules/diagram/commands";
import { nearParentPlacement } from "@/modules/diagram/layout/NearParentPlacement";
import type { DiagramOp } from "@/modules/diagram/commands/ops";

const makeLoadedStore = () => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(bundleLoaded({ id: 1, title: "authentication", bundle: makeSampleBundle() }));
  return store;
};

describe("phase 4 gate (a) — AI edits never move an existing position", () => {
  it("add/rename/connect: every frozen layout entry is byte-identical after the patch", () => {
    const store = makeLoadedStore();
    const frozenBefore = JSON.stringify(store.getState().diagram.layout);

    const result = store.dispatch(
      applyAiPatch([
        { op: "addNode", node: { id: "cache", type: "service", label: "Redis" } },
        { op: "connectNodes", id: "e3", source: "gateway", target: "cache", type: "straight" },
        { op: "renameNode", id: "db", label: "Postgres 17" },
      ]),
    );
    expect(result.ok).toBe(true);

    const layoutAfter = store.getState().diagram.layout;
    // the new node was placed…
    expect(layoutAfter.cache).toBeDefined();
    // …and every pre-existing entry is untouched, byte for byte
    const frozenAfter = Object.fromEntries(Object.entries(layoutAfter).filter(([key]) => key !== "cache"));
    expect(JSON.stringify(frozenAfter)).toBe(frozenBefore);
  });

  it("the whole AI edit is ONE history entry — a single undo restores the initial document", () => {
    const store = makeLoadedStore();
    const initial = JSON.stringify(selectBundle(store.getState()));

    store.dispatch(
      applyAiPatch([
        { op: "addNode", node: { id: "cache", type: "service", label: "Redis" } },
        { op: "connectNodes", id: "e3", source: "gateway", target: "cache" },
      ]),
    );
    expect(store.getState().diagram.history.past).toHaveLength(1);

    store.dispatch(undoCommand());
    expect(JSON.stringify(selectBundle(store.getState()))).toBe(initial);
  });

  it("a patch may reference nodes it adds earlier in the same list", () => {
    const store = makeLoadedStore();
    const result = store.dispatch(
      applyAiPatch([
        { op: "addNode", node: { id: "queue", type: "service", label: "RabbitMQ" } },
        { op: "addNode", node: { id: "worker", type: "service", label: "Worker" } },
        { op: "connectNodes", source: "queue", target: "worker" },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(store.getState().diagram.semantic.nodes).toHaveLength(5);
  });
});

describe("phase 4 gate (b) — invalid patches leave the state byte-identical", () => {
  it("one bad op anywhere rejects the whole patch atomically", () => {
    const store = makeLoadedStore();
    const before = JSON.stringify(selectBundle(store.getState()));

    const result = store.dispatch(
      applyAiPatch([
        { op: "addNode", node: { id: "cache", type: "service", label: "Redis" } }, // valid
        { op: "connectNodes", source: "cache", target: "ghost" }, // ghost target → invalid
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("command 2 (connectNodes)");
    expect(JSON.stringify(selectBundle(store.getState()))).toBe(before);
    expect(store.getState().diagram.history.past).toHaveLength(0);
  });

  it("layout ops are rejected by the AI patch schema — AI never owns layout", () => {
    const raw = JSON.stringify({ commands: [{ op: "moveNode", id: "gateway", x: 0, y: 0 }] });
    const parsed = parsePatchText(raw);
    expect(parsed.ok).toBe(false);
  });
});

describe("phase 4 gate (c) — the parser recovers prose-wrapped JSON", () => {
  const patch = { commands: [{ op: "renameNode", id: "db", label: "PG" }] as DiagramOp[] };

  it("recovers JSON preceded and followed by prose", () => {
    const raw = `Sure! Here is the edit you asked for:\n${JSON.stringify(patch)}\nLet me know if you need anything else.`;
    const parsed = parsePatchText(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.ops).toEqual(patch.commands);
  });

  it("recovers JSON wrapped in a markdown fence", () => {
    const raw = "```json\n" + JSON.stringify(patch) + "\n```";
    expect(parsePatchText(raw).ok).toBe(true);
  });

  it("rejects a reply with no JSON at all", () => {
    const parsed = parsePatchText("I cannot help with that.");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]).toContain("no parseable JSON");
  });

  it("rejects structurally wrong command objects", () => {
    const parsed = parsePatchText(JSON.stringify({ commands: [{ op: "addNode" }] }));
    expect(parsed.ok).toBe(false);
  });
});

describe("NearParentPlacement", () => {
  it("places a new node beside its placed parent without overlapping anything", () => {
    const bundle = makeSampleBundle();
    const placements = nearParentPlacement.place(
      ["cache"],
      bundle.layout,
      [...bundle.semantic.edges, { id: "e3", source: "gateway", target: "cache", type: "straight" }],
    );
    const entry = placements.cache;
    // right of gateway (x:0 w:180 + gap 80)
    expect(entry.x).toBe(260);
    // no overlap with db at (320,40,180,64): either clear vertically or horizontally
    const clearOfDb = entry.x + 180 <= 320 || entry.x >= 500 || entry.y + 64 <= 40 || entry.y >= 104;
    expect(clearOfDb).toBe(true);
  });

  it("returns entries for new ids only — frozen is never included", () => {
    const bundle = makeSampleBundle();
    const placements = nearParentPlacement.place(["cache"], bundle.layout, []);
    expect(Object.keys(placements)).toEqual(["cache"]);
  });
});
