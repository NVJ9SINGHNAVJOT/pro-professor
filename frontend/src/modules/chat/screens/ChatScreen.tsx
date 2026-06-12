import { useState } from "react";
import SideBar from "@/modules/chat/components/SideBar";
import ChatMessages from "@/modules/chat/components/ChatMessages";

const ChatScreen = () => {
  // open by default on desktop; closed on mobile where the sidebar overlays the chat
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const toggleSidebar = () => setSidebarOpen((open) => !open);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-grey">
      <SideBar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <ChatMessages sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
    </div>
  );
};

export default ChatScreen;
