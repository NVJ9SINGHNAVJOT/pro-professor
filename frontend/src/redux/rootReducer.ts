import { combineReducers } from "@reduxjs/toolkit";
import modelsReducer from "@/redux/slices/modelsSlice";
import notesListReducer from "@/redux/slices/notesListSlice";
import chatListReducer from "@/redux/slices/chatListSlice";
import diagramListReducer from "@/redux/slices/diagramListSlice";

const rootReducer = combineReducers({
  models: modelsReducer,
  // The three sidebar lists. Everything else a page needs is route loader data — these live here
  // because mutations patch a single row instead of refetching; see createListSlice.ts.
  notesList: notesListReducer,
  chatList: chatListReducer,
  diagramList: diagramListReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
