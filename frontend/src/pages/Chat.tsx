import SideBar from "@/components/core/chat/SideBar";
import Page from "@/components/wrapper/Page";
import { Outlet } from "react-router-dom";

const Chat = () => {
  return (
    <Page className="flex">
      <SideBar />
      <Outlet />
    </Page>
  );
};

export default Chat;
