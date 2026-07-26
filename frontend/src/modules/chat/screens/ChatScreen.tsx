import { useState } from "react";
import SideBar from "@/modules/chat/components/SideBar";
import ChatMessages from "@/modules/chat/components/ChatMessages";
import type { ConversationDetail, ConversationSummary } from "@/services/operations/chats/chats.route";

interface ChatScreenProps {
  /** The history list, loaded by the parent route. */
  conversations: ConversationSummary[];
  /** The conversation named in the URL, loaded by the route loader; null on `/chat`. */
  conversation: ConversationDetail | null;
}

const ChatScreen = ({ conversations, conversation }: ChatScreenProps) => {
  // open by default on desktop; closed on mobile where the sidebar overlays the chat
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const toggleSidebar = () => setSidebarOpen((open) => !open);

  return (
    <div className="flex h-full w-full overflow-hidden bg-grey">
      <SideBar conversations={conversations} isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <ChatMessages conversation={conversation} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
    </div>
  );
};

export default ChatScreen;
