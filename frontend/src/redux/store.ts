import { configureStore } from "@reduxjs/toolkit";
import { type TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import rootReducer from "@/redux/rootReducer";
import { GRAPH_PERSIST_THROTTLE_MS, GRAPH_STORAGE_KEY, graphPersistPayload } from "@/redux/slices/notesGraphSlice";
import { createThrottledWriter } from "@/utils/localStore";

const store = configureStore({
  reducer: rootReducer,
});

/* The notes graph view's preferences are the one bit of state that outlives the tab. No persistence
 * middleware for it: this listener runs after every dispatch, and its first act is a reference
 * compare against the slice it last saw — an RTK reducer returns the identical object when nothing
 * changed, so every unrelated dispatch in the app costs one property read and one `===`. The writes
 * themselves are throttled inside the writer, because the camera moves on every wheel tick. */
const writeGraphState = createThrottledWriter(GRAPH_STORAGE_KEY, GRAPH_PERSIST_THROTTLE_MS);
let lastGraphState = store.getState().notesGraph;
store.subscribe(() => {
  const next = store.getState().notesGraph;
  if (next === lastGraphState) return;
  lastGraphState = next;
  writeGraphState(graphPersistPayload(next));
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => typeof store.dispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
