import { useLoaderData } from "react-router";
import ChatScreen from "@/modules/chat/screens/ChatScreen";
import { useAppSelector } from "@/redux/store";
import { type ChatDetailLoaderData } from "@/pages/chat/loader";

export default function ChatPage() {
  // The history list is Redux state seeded by the parent route's loader, so a new or renamed
  // conversation patches one row instead of refetching; the open chat stays plain loader data.
  const conversations = useAppSelector((state) => state.chatList.items);
  // conversation is null on `/chat/new` — a draft, which the loader fetches nothing for
  const data = useLoaderData<ChatDetailLoaderData>();
  return <ChatScreen conversations={conversations} conversation={data.conversation} />;
}
