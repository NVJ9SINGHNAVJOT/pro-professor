import { combineReducers } from "@reduxjs/toolkit";
import loadingReducer from "@/redux/slices/loadingSlice";
import chatReducer from "@/redux/slices/chatSlice";
import modelsReducer from "@/redux/slices/modelsSlice";

const rootReducer = combineReducers({
  loading: loadingReducer,
  chat: chatReducer,
  models: modelsReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;
