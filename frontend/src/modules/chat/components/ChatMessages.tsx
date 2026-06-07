import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SendIcon } from "lucide-react";
import { useSocketContext } from "@/context/SocketProvider";
import { clientE } from "@/socket/events";
import { useApi } from "@/hooks/useApi";
import { chatsRoute } from "@/services/operations/chats.route";
import { useAppDispatch } from "@/redux/store";
import { addConversation } from "@/redux/slices/chatSlice";
import ModelSelector, { type SelectedModel } from "@/modules/chat/components/ModelSelector";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import type { ModelProvider } from "@/services/operations/models.route";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

const ChatMessages = () => {
  const chatId = useParams().chatId;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { connect, sendChat, subscribe } = useSocketContext();
  const { execute: fetchConversation } = useApi(chatsRoute.getConversation);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<SelectedModel | null>(null);

  // refs so the once-registered socket handlers see current values
  const convIdRef = useRef<number | null>(null);
  const loadedRef = useRef<number | null>(null);
  const isNewChatRef = useRef<boolean>(true);
  const selectedRef = useRef<SelectedModel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // open the single shared connection
  useEffect(() => {
    connect();
  }, [connect]);

  // register streaming handlers once
  useEffect(() => {
    const unStart = subscribe(clientE.CHAT_START, ({ conversationId, title }) => {
      convIdRef.current = conversationId;
      loadedRef.current = conversationId;
      if (isNewChatRef.current) {
        isNewChatRef.current = false;
        dispatch(
          addConversation({
            id: conversationId,
            title,
            model: selectedRef.current?.model ?? "",
            updatedAt: new Date().toISOString(),
          })
        );
        navigate(ROUTES.CHAT_DETAIL(conversationId), { replace: true });
      }
    });

    const unChunk = subscribe(clientE.CHAT_CHUNK, ({ delta }) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: last.content + delta };
        }
        return next;
      });
    });

    const unDone = subscribe(clientE.CHAT_DONE, () => setStreaming(false));

    const unError = subscribe(clientE.CHAT_ERROR, ({ message }) => {
      setStreaming(false);
      toast.error(message);
    });

    return () => {
      unStart();
      unChunk();
      unDone();
      unError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load (or reset) conversation when the route param changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      convIdRef.current = null;
      loadedRef.current = null;
      isNewChatRef.current = true;
      setStreaming(false);
      return;
    }

    const id = Number(chatId);
    // already loaded (or currently streaming this one) — don't clobber live messages
    if (loadedRef.current === id) return;

    isNewChatRef.current = false;
    (async () => {
      const res = await fetchConversation(id);
      if (res.error) {
        toast.error("Failed to load conversation");
        return;
      }
      const detail = res.response.data;
      setMessages(
        detail.messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }))
      );
      setSelected({ provider: detail.provider as ModelProvider, model: detail.model });
      convIdRef.current = id;
      loadedRef.current = id;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || streaming) return;
    if (!selected) {
      toast.error("Select a model first");
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    sendChat({
      conversationId: convIdRef.current,
      provider: selected.provider,
      model: selected.model,
      content,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="bg-grey flex-1 flex flex-col h-full text-white">
      {/* Header: model selector */}
      <div className="flex items-center gap-x-3 px-4 py-3 border-b border-neutral-800">
        <ModelSelector value={selected} onChange={setSelected} disabled={Boolean(chatId)} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl flex flex-col gap-y-4">
          {messages.length === 0 && (
            <div className="text-neutral-500 text-center mt-20 para-small-medium">
              Pick a model and say hi 👋
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-2 max-w-[80%] whitespace-pre-wrap break-words para-small-medium",
                  message.role === "user" ? "bg-neutral-700" : "bg-neutral-800"
                )}
              >
                {message.content || (streaming ? "▋" : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-neutral-800">
        <div className="mx-auto max-w-3xl flex items-end gap-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Message..."
            className="flex-1 resize-none rounded-xl bg-neutral-800 px-4 py-2.5 outline-none para-small-medium max-h-40"
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="rounded-xl bg-white text-black p-2.5 disabled:opacity-40"
          >
            <SendIcon className="size-4.5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default ChatMessages;
