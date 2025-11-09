import Page from "@/components/wrapper/Page";

const Chat = () => {
  return (
    <Page className="flex">
      <section className="text-white w-[270px] bg-grey-50">SideBar</section>
      <section className="bg-grey flex-1">Chat Messages</section>
    </Page>
  );
};

export default Chat;
