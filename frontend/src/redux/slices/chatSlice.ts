import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

interface ChatHistoryMessage {
  id: string;
  title: string;
  model: string;
  createdAt: string;
}

interface ChatState {
  chatHistoryLoading: boolean;
  history: ChatHistoryMessage[];
}

const initialState: ChatState = {
  chatHistoryLoading: true,
  history: [
    {
      id: "chat-001",
      title: "Introduction to Redux",
      model: "Gemini 2.5 Flash",
      createdAt: new Date().toISOString(),
    },
    {
      id: "chat-002",
      title: "Project Setup Help",
      model: "Gemini 1.0 Pro",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
};

const chatSlice = createSlice({
  name: "chat",
  initialState: initialState,
  reducers: {
    setChatHistoryLoading(state, action: PayloadAction<boolean>) {
      state.chatHistoryLoading = action.payload;
    },
    addChatToHistory(state, action: PayloadAction<ChatHistoryMessage>) {
      state.history.unshift(action.payload);
    },
    removeChatFromHistory(state, action: PayloadAction<string>) {
      state.history = state.history.filter((chat) => chat.id !== action.payload);
    },
  },
});

export const { setChatHistoryLoading, addChatToHistory, removeChatFromHistory } = chatSlice.actions;
export default chatSlice.reducer;
