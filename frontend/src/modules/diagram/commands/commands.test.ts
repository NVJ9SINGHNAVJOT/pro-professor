import { describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "@/redux/rootReducer";
import { bundleLoaded } from "@/modules/diagram/model/actions";
import { selectBundle } from "@/modules/diagram/model/selectors";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";
import {
  addNodeCommand,
  connectNodesCommand,
  deleteNodeCommand,
  moveNodeCommand,
  redoCommand,
  renameNodeCommand,
  undoCommand,
} from "@/modules/diagram/commands";

const makeLoadedStore = () => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(bundleLoaded({ id: 1, title: "authentication", bundle: makeSampleBundle() }));
  return store;
};

describe("phase 3 gate — one validated path", () => {
  it("rejects invalid commands and leaves the store byte-identical", () => {
    const store = makeLoadedStore();
    const before = JSON.stringify(selectBundle(store.getState()));

    const results = [
      store.dispatch(addNodeCommand({ id: "gateway", type: "service", label: "Duplicate id" })),
      store.dispatch(addNodeCommand({ id: "ufo", type: "spaceship", label: "Unregistered type" })),
      store.dispatch(connectNodesCommand({ source: "gateway", target: "ghost" })),
      store.dispatch(renameNodeCommand("ghost", "nope")),
      store.dispatch(deleteNodeCommand("ghost")),
      store.dispatch(moveNodeCommand("ghost", 1, 2)),
    ];

    for (const result of results) expect(result.ok).toBe(false);
    expect(JSON.stringify(selectBundle(store.getState()))).toBe(before);
    expect(store.getState().diagram.history.past).toHaveLength(0);
  });

  it("valid commands apply and record history", () => {
    const store = makeLoadedStore();
    expect(store.dispatch(addNodeCommand({ id: "cache", type: "service", label: "Redis" }, { x: 100, y: 200, w: 180, h: 64 })).ok).toBe(true);
    expect(store.dispatch(connectNodesCommand({ source: "gateway", target: "cache", type: "straight" })).ok).toBe(true);

    const state = store.getState();
    expect(state.diagram.semantic.nodes).toHaveLength(4);
    expect(state.diagram.semantic.edges).toHaveLength(3);
    expect(state.diagram.layout.cache).toEqual({ x: 100, y: 200, w: 180, h: 64 });
    expect(state.diagram.history.past).toHaveLength(2);
  });
});

describe("phase 3 gate — undo/redo across semantic AND layout", () => {
  it("a mixed sequence fully unwinds to the initial document and replays forward", () => {
    const store = makeLoadedStore();
    const initial = JSON.stringify(selectBundle(store.getState()));

    store.dispatch(addNodeCommand({ id: "cache", type: "service", label: "Redis" }, { x: 100, y: 200, w: 180, h: 64 }));
    store.dispatch(connectNodesCommand({ id: "e3", source: "gateway", target: "cache" }));
    store.dispatch(renameNodeCommand("db", "Postgres 17"));
    store.dispatch(moveNodeCommand("gateway", 640, 480));
    const afterAll = JSON.stringify(selectBundle(store.getState()));

    for (let i = 0; i < 4; i++) expect(store.dispatch(undoCommand()).ok).toBe(true);
    expect(JSON.stringify(selectBundle(store.getState()))).toBe(initial);
    expect(store.dispatch(undoCommand()).ok).toBe(false); // stack empty

    for (let i = 0; i < 4; i++) expect(store.dispatch(redoCommand()).ok).toBe(true);
    expect(JSON.stringify(selectBundle(store.getState()))).toBe(afterAll);
  });

  it("deleting a node cascades edges + layout, and undo restores all of it", () => {
    const store = makeLoadedStore();
    const before = JSON.stringify(selectBundle(store.getState()));

    expect(store.dispatch(deleteNodeCommand("gateway")).ok).toBe(true);
    const state = store.getState();
    expect(state.diagram.semantic.nodes).toHaveLength(2);
    expect(state.diagram.semantic.edges).toHaveLength(0); // both edges touched gateway
    expect(state.diagram.layout.gateway).toBeUndefined();

    store.dispatch(undoCommand());
    expect(JSON.stringify(selectBundle(store.getState()))).toBe(before);
  });

  it("undoing a first-move of an unplaced node removes its layout entry again", () => {
    const store = makeLoadedStore();
    store.dispatch(moveNodeCommand("todo", 50, 60)); // "todo" starts unplaced
    expect(store.getState().diagram.layout.todo).toMatchObject({ x: 50, y: 60 });
    store.dispatch(undoCommand());
    expect(store.getState().diagram.layout.todo).toBeUndefined();
  });

  it("a new command wipes the redo branch", () => {
    const store = makeLoadedStore();
    store.dispatch(renameNodeCommand("db", "A"));
    store.dispatch(undoCommand());
    store.dispatch(renameNodeCommand("db", "B"));
    expect(store.dispatch(redoCommand()).ok).toBe(false);
    expect(store.getState().diagram.history.future).toHaveLength(0);
  });
});
