import { combineReducers } from "@reduxjs/toolkit";
import loadingReducer from "@/redux/slices/loadingSlice";
import chatReducer from "@/redux/slices/chatSlice";
import modelsReducer from "@/redux/slices/modelsSlice";
import notesReducer from "@/redux/slices/notesSlice";

const rootReducer = combineReducers({
  loading: loadingReducer,
  chat: chatReducer,
  models: modelsReducer,
  notes: notesReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
