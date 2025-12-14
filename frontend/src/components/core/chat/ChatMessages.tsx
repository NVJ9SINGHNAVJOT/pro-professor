import { useParams } from "react-router-dom";

const ChatMessages = () => {
  const chatId = useParams().chatId;
  return (
    <section className="bg-grey flex-1">
      {/* Top section */}
      <div></div>
    </section>
  );
};

export default ChatMessages;
