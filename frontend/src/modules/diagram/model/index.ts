import { combineReducers } from "@reduxjs/toolkit";
import docReducer from "@/modules/diagram/model/docSlice";
import semanticReducer from "@/modules/diagram/model/semanticSlice";
import layoutReducer from "@/modules/diagram/model/layoutSlice";
import viewportReducer from "@/modules/diagram/model/viewportSlice";
import selectionReducer from "@/modules/diagram/model/selectionSlice";
import historyReducer from "@/modules/diagram/model/historySlice";

/**
 * The diagram domain — four namespace slices plus doc/history bookkeeping,
 * combined so the root store gains a single `diagram` key (state.diagram.semantic, …).
 */
const diagramReducer = combineReducers({
  doc: docReducer,
  semantic: semanticReducer,
  layout: layoutReducer,
  viewport: viewportReducer,
  selection: selectionReducer,
  history: historyReducer,
});

export type DiagramState = ReturnType<typeof diagramReducer>;
export default diagramReducer;
