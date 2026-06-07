import Page from "@/components/common/Page";
import SideBar from "@/modules/chat/components/SideBar";
import ChatMessages from "@/modules/chat/components/ChatMessages";

const ChatScreen = () => {
  return (
    <Page className="flex">
      <SideBar />
      <ChatMessages />
    </Page>
  );
};

export default ChatScreen;
