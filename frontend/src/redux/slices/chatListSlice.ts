import { createListSlice } from "@/redux/createListSlice";
import type { ConversationSummary } from "@/services/operations/chats/chats.route";

/** The chat sidebar's rows — seeded by `chatListLoader`, patched as conversations start/rename/go. */
const chatListSlice = createListSlice<ConversationSummary>("chatList");

export const {
  setItems: setConversations,
  upsertItem: upsertConversation,
  removeItem: removeConversation,
} = chatListSlice.actions;
export default chatListSlice.reducer;
