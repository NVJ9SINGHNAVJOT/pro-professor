import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface ChatHistoryItem {
  id: number;
  title: string;
  model: string;
  updatedAt: string;
}

interface ChatState {
  chatHistoryLoading: boolean;
  history: ChatHistoryItem[];
}

const initialState: ChatState = {
  chatHistoryLoading: false,
  history: [],
};

const chatSlice = createSlice({
  name: "chat",
  initialState: initialState,
  reducers: {
    setChatHistoryLoading(state, action: PayloadAction<boolean>) {
      state.chatHistoryLoading = action.payload;
    },
    setHistory(state, action: PayloadAction<ChatHistoryItem[]>) {
      state.history = action.payload;
    },
    addConversation(state, action: PayloadAction<ChatHistoryItem>) {
      // de-dupe, then put newest on top
      state.history = [action.payload, ...state.history.filter((chat) => chat.id !== action.payload.id)];
    },
    renameConversation(state, action: PayloadAction<{ id: number; title: string }>) {
      const item = state.history.find((chat) => chat.id === action.payload.id);
      if (item) item.title = action.payload.title;
    },
    removeConversation(state, action: PayloadAction<number>) {
      state.history = state.history.filter((chat) => chat.id !== action.payload);
    },
  },
});

export const { setChatHistoryLoading, setHistory, addConversation, renameConversation, removeConversation } =
  chatSlice.actions;
export default chatSlice.reducer;
