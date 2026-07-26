import { combineReducers } from "@reduxjs/toolkit";
import modelsReducer from "@/redux/slices/modelsSlice";
import notesListReducer from "@/redux/slices/notesListSlice";
import chatListReducer from "@/redux/slices/chatListSlice";
import diagramListReducer from "@/redux/slices/diagramListSlice";
import diagramFolderListReducer from "@/redux/slices/diagramFolderListSlice";
import diagramSidebarReducer from "@/redux/slices/diagramSidebarSlice";

const rootReducer = combineReducers({
  models: modelsReducer,
  // The three sidebar lists. Everything else a page needs is route loader data — these live here
  // because mutations patch a single row instead of refetching; see createListSlice.ts.
  notesList: notesListReducer,
  chatList: chatListReducer,
  diagramList: diagramListReducer,
  // The diagram sidebar's folders, seeded by the same loader as diagramList.
  diagramFolderList: diagramFolderListReducer,
  // Which folders/sections that sidebar has open — here rather than in the screen because the
  // screen remounts on the first navigation into a diagram. See the slice.
  diagramSidebar: diagramSidebarReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
