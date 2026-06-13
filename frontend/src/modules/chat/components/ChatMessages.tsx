import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  CopyIcon,
  PanelLeftOpenIcon,
  PaperclipIcon,
  SquareIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat } from "@/services/chatStream";
import { useApi } from "@/hooks/useApi";
import { chatsRoute } from "@/services/operations/chats.route";
import { useAppDispatch } from "@/redux/store";
import { addConversation } from "@/redux/slices/chatSlice";
import ModelSelector from "@/modules/chat/components/ModelSelector";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import type { ModelProvider } from "@/services/operations/models.route";
import type { SelectedModel, UiMessage } from "@/modules/chat/types";
import { AUTOSCROLL_THRESHOLD_PX, MAX_TEXTAREA_HEIGHT_PX, SUGGESTIONS } from "@/modules/chat/constants";



const AssistantMessage = ({ content, isStreaming }: { content: string; isStreaming: boolean }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex gap-x-3">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-neutral-700">
        <BotIcon className="size-4 text-neutral-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="chat-markdown wrap-break-word para-regular text-neutral-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          {isStreaming && <span className="ct-cursor-blink">▋</span>}
        </div>
        {!isStreaming && content && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy message"
            className="mt-1 cursor-pointer rounded-md p-1.5 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-800 hover:text-white group-hover:opacity-100"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

interface ChatMessagesProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const ChatMessages = ({ sidebarOpen, onToggleSidebar }: ChatMessagesProps) => {
  const chatId = useParams().chatId;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { execute: fetchConversation } = useApi(chatsRoute.getConversation);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<SelectedModel | null>(null);

  // refs
  const convIdRef = useRef<number | null>(null);
  const loadedRef = useRef<number | null>(null);
  const isNewChatRef = useRef<boolean>(true);
  const selectedRef = useRef<SelectedModel | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // load (or reset) conversation when the route param changes
  useEffect(() => {
    autoScrollRef.current = true;

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

  // auto-scroll on new content unless the user scrolled away from the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // auto-grow the textarea with its content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [input]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < AUTOSCROLL_THRESHOLD_PX;
  };

  const handleSend = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    if (!selected) {
      toast.error("Select a model first");
      return;
    }

    autoScrollRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = streamChat(
      {
        conversationId: convIdRef.current,
        provider: selected.provider,
        model: selected.model,
        content,
      },
      {
        onStart: ({ conversationId, title }) => {
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
        },
        onChunk: ({ delta }) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          });
        },
        onDone: () => {
          setStreaming(false);
        },
        onError: (message) => {
          setStreaming(false);
          toast.error(message);
        },
      }
    );

    abortRef.current = controller;
  };

  // Real stop: aborts the fetch, backend catches disconnect and stops generation
  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showEmptyState = !chatId && messages.length === 0;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-grey text-white">
      {/* Header bar */}
      <header className="flex items-center gap-x-2 px-4 py-2.5">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
            className="cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
          >
            <PanelLeftOpenIcon className="size-5" />
          </button>
        )}
        <ModelSelector value={selected} onChange={setSelected} disabled={Boolean(chatId)} />
      </header>

      {/* Empty state or message list */}
      {showEmptyState ? (
        <div className="relative flex flex-1 flex-col items-center justify-center px-4">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="ct-float absolute left-1/2 top-1/3 size-150 rounded-full bg-linear-to-br from-richblue-300/15 to-neutral-700/20 blur-3xl" />
          </div>
          <h1 className="relative heading-small-medium text-center">What can I help with?</h1>
          <div className="relative mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.title}
                type="button"
                onClick={() => handleSend(suggestion.prompt)}
                className="cursor-pointer rounded-2xl border border-neutral-800 bg-neutral-800/40 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-600 hover:bg-neutral-800"
              >
                <div className="para-small-semibold text-neutral-200">{suggestion.title}</div>
                <div className="truncate caption-small-regular text-neutral-500">{suggestion.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={scrollRef} onScroll={handleScroll} className="chat-scroll flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-y-6">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[75%] whitespace-pre-wrap wrap-break-word rounded-3xl bg-linear-to-br from-neutral-700 to-neutral-600 px-4 py-2 para-small-medium shadow-sm">
                    {message.content}
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={index}
                  content={message.content}
                  isStreaming={streaming && index === messages.length - 1}
                />
              )
            )}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-x-1.5 rounded-3xl bg-chat-input px-3 py-2 shadow-lg">
            <button
              type="button"
              disabled
              aria-label="Attach file (coming soon)"
              className="cursor-not-allowed rounded-full p-2.5 text-neutral-500 opacity-50"
            >
              <PaperclipIcon className="size-4.5" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Message..."
              className={cn("flex-1 resize-none bg-transparent px-1 py-2 outline-none para-small-medium", "placeholder:text-neutral-500")}
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                aria-label="Stop generating"
                className="cursor-pointer rounded-full bg-white p-2.5 text-black transition-transform hover:scale-105"
              >
                <SquareIcon className="size-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                aria-label="Send message"
                className="cursor-pointer rounded-full bg-linear-to-br from-white to-neutral-400 p-2.5 text-black transition-all not-disabled:hover:scale-105 disabled:cursor-default disabled:opacity-40"
              >
                <ArrowUpIcon className="size-4.5" />
              </button>
            )}
          </div>
          <div className="mt-2 text-center caption-small-regular text-neutral-600">
            Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChatMessages;
