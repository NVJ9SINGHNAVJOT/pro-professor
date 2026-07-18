import { describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "@/redux/rootReducer";
import { bundleLoaded } from "@/modules/diagram/model/actions";
import { moveNode, resizeNode } from "@/modules/diagram/model/layoutSlice";
import { selectSemantic } from "@/modules/diagram/model/selectors";
import { commitNodeChanges } from "@/modules/diagram/adapter/ReactFlowAdapter";
import { buildSavePayload, parseLoadedDiagram } from "@/modules/diagram/persistence/bundleIO";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";

const makeLoadedStore = () => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(bundleLoaded({ id: 1, title: "authentication", bundle: makeSampleBundle() }));
  return store;
};

describe("phase 2 gate — layout edits never touch semantic", () => {
  it("moveNode/resizeNode change layout only; semantic stays byte-identical (and reference-equal)", () => {
    const store = makeLoadedStore();
    const semanticBefore = selectSemantic(store.getState());
    const bytesBefore = JSON.stringify(semanticBefore);

    store.dispatch(moveNode({ id: "gateway", x: 500, y: 300 }));
    store.dispatch(resizeNode({ id: "db", w: 240, h: 90 }));
    store.dispatch(moveNode({ id: "todo", x: 10, y: 20 })); // first move of an unplaced node

    const state = store.getState();
    expect(selectSemantic(state)).toBe(semanticBefore); // untouched slice = same reference
    expect(JSON.stringify(selectSemantic(state))).toBe(bytesBefore);
    expect(state.diagram.layout.gateway).toMatchObject({ x: 500, y: 300 });
    expect(state.diagram.layout.db).toMatchObject({ w: 240, h: 90 });
    expect(state.diagram.layout.todo).toEqual({ x: 10, y: 20, w: 0, h: 0 });
  });

  it("the guarded change handler drops transient drags and RF bookkeeping", () => {
    const store = makeLoadedStore();
    const layoutBefore = store.getState().diagram.layout;

    commitNodeChanges(
      [
        { type: "position", id: "gateway", position: { x: 999, y: 999 }, dragging: true }, // mid-drag → ignored
        { type: "dimensions", id: "db", dimensions: { width: 500, height: 500 } }, // measure, no resizing flag → ignored
        { type: "remove", id: "gateway" }, // RF deletion never reaches the domain
      ],
      store.dispatch,
    );
    expect(store.getState().diagram.layout).toBe(layoutBefore);
    expect(store.getState().diagram.semantic.nodes).toHaveLength(3);

    // drag END commits — layout only
    commitNodeChanges([{ type: "position", id: "gateway", position: { x: 640, y: 128 }, dragging: false }], store.dispatch);
    expect(store.getState().diagram.layout.gateway).toMatchObject({ x: 640, y: 128 });
  });
});

describe("phase 2 gate — save/load round trip", () => {
  it("drag → save payload → reload: positions survive, semantic byte-identical", () => {
    const store = makeLoadedStore();
    const semanticBytes = JSON.stringify(selectSemantic(store.getState()));
    store.dispatch(moveNode({ id: "gateway", x: 500, y: 300 }));

    const built = buildSavePayload(store.getState());
    expect("payload" in built).toBe(true);
    if (!("payload" in built)) return;

    // simulate the server echoing the saved document back on reload
    const reloaded = parseLoadedDiagram({
      id: 1,
      title: "authentication",
      content: built.payload.content,
      createdAt: "",
      updatedAt: "",
    });
    expect("action" in reloaded).toBe(true);
    if (!("action" in reloaded)) return;

    const freshStore = configureStore({ reducer: rootReducer });
    freshStore.dispatch(reloaded.action);
    expect(freshStore.getState().diagram.layout.gateway).toMatchObject({ x: 500, y: 300 });
    expect(JSON.stringify(selectSemantic(freshStore.getState()))).toBe(semanticBytes);
  });

  it("an invalid fetched document never reaches the store", () => {
    const parsed = parseLoadedDiagram({
      id: 9,
      title: "broken",
      content: { schemaVersion: "1.0.0" }, // structurally invalid
      createdAt: "",
      updatedAt: "",
    });
    expect("errors" in parsed).toBe(true);
  });
});
