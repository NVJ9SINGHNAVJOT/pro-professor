import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ProviderModel } from "@/services/operations/models/models.route";

interface ModelsState {
  models: ProviderModel[];
  loaded: boolean;
}

const initialState: ModelsState = {
  models: [],
  loaded: false,
};

const modelsSlice = createSlice({
  name: "models",
  initialState,
  reducers: {
    setModels(state, action: PayloadAction<ProviderModel[]>) {
      state.models = action.payload;
      state.loaded = true;
    },
  },
});

export const { setModels } = modelsSlice.actions;
export default modelsSlice.reducer;
