import { describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "@/redux/rootReducer";
import { bundleLoaded, diagramClosed } from "@/modules/diagram/model/actions";
import { selectBundle } from "@/modules/diagram/model/selectors";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";
import { validateBundle } from "@/modules/diagram/schema/validate";

const makeStore = () => configureStore({ reducer: rootReducer });

describe("diagram store", () => {
  it("loads a validated bundle into the four namespaces", () => {
    const store = makeStore();
    const result = validateBundle(makeSampleBundle());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    store.dispatch(bundleLoaded({ id: 7, title: "authentication", bundle: result.bundle }));

    const state = store.getState();
    expect(state.diagram.doc).toMatchObject({ id: 7, title: "authentication", loaded: true });
    expect(state.diagram.semantic.nodes).toHaveLength(3);
    expect(state.diagram.semantic.edges).toHaveLength(2);
    expect(Object.keys(state.diagram.layout)).toEqual(["gateway", "db"]);
    expect(state.diagram.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(state.diagram.selection).toEqual({ nodeIds: [], edgeIds: [] });
  });

  it("selectBundle round-trips: store → bundle equals what was loaded", () => {
    const store = makeStore();
    const bundle = makeSampleBundle();
    store.dispatch(bundleLoaded({ id: null, title: "draft", bundle }));
    expect(selectBundle(store.getState())).toEqual(bundle);
  });

  it("closing the diagram resets every namespace", () => {
    const store = makeStore();
    store.dispatch(bundleLoaded({ id: 1, title: "x", bundle: makeSampleBundle() }));
    store.dispatch(diagramClosed());
    const state = store.getState();
    expect(state.diagram.doc.loaded).toBe(false);
    expect(state.diagram.semantic.nodes).toHaveLength(0);
    expect(state.diagram.layout).toEqual({});
  });
});
