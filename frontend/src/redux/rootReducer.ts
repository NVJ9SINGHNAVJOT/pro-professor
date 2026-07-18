import { combineReducers } from "@reduxjs/toolkit";
import loadingReducer from "@/redux/slices/loadingSlice";
import chatReducer from "@/redux/slices/chatSlice";
import modelsReducer from "@/redux/slices/modelsSlice";
import notesReducer from "@/redux/slices/notesSlice";
import diagramReducer from "@/modules/diagram/model";

const rootReducer = combineReducers({
  loading: loadingReducer,
  chat: chatReducer,
  models: modelsReducer,
  notes: notesReducer,
  diagram: diagramReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
