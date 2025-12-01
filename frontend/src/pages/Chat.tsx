import ChatMessages from "@/components/core/chat/ChatMessages";
import SideBar from "@/components/core/chat/SideBar";
import Page from "@/components/wrapper/Page";

const Chat = () => {
  return (
    <Page className="flex">
      <SideBar />
      <ChatMessages />
    </Page>
  );
};

export default Chat;
