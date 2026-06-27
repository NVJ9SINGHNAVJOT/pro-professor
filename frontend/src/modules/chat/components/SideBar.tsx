import { useEffect, useMemo, useState } from "react";
import { SearchIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router";
import { toast } from "@/components/common/toast";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { removeConversation, setHistory, type ChatHistoryItem } from "@/redux/slices/chatSlice";
import { useApi } from "@/hooks/useApi";
import { chatsRoute } from "@/services/operations/chats/chats.route";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";
import { GROUPS } from "@/modules/chat/constants";
import type { Group } from "@/modules/chat/types";
import { groupOf } from "@/modules/chat/utils";

interface SideBarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const SideBar = ({ isOpen, onToggle }: SideBarProps) => {
  const history = useAppSelector((state) => state.chat.history);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chatId = useParams().chatId;
  const [query, setQuery] = useState("");
  const { execute: fetchConversations } = useApi(chatsRoute.getConversations);
  const { execute: deleteConversation } = useApi(chatsRoute.deleteConversation);

  useEffect(() => {
    (async () => {
      const res = await fetchConversations();
      if (!res.error) {
        dispatch(setHistory(res.response.data.conversations));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // filter by search query, then bucket by recency
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? history.filter((chat) => chat.title.toLowerCase().includes(q)) : history;
    const buckets = new Map<Group, ChatHistoryItem[]>();
    filtered.forEach((chat) => {
      const group = groupOf(chat.updatedAt);
      buckets.set(group, [...(buckets.get(group) ?? []), chat]);
    });
    return GROUPS.filter((group) => buckets.has(group)).map((group) => ({
      label: group,
      chats: buckets.get(group)!,
    }));
  }, [history, query]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await deleteConversation(id);
    if (res.error) {
      toast.error("Failed to delete chat");
      return;
    }
    dispatch(removeConversation(id));
    if (chatId === String(id)) navigate(ROUTES.CHAT);
  };

  return (
    <>
      {/* mobile backdrop */}
      <div
        onClick={onToggle}
        className={cn(
          "fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "z-40 h-full shrink-0 overflow-hidden bg-chat-sidebar text-white transition-all duration-300 ease-in-out",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-67.5",
          isOpen ? "w-67.5 max-md:translate-x-0" : "w-0 max-md:-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-full w-67.5 flex-col gap-y-2 transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0",
          )}
        >
          {/* New chat — shares the chat top bar's height for a uniform top band */}
          <div className="flex h-11.5 shrink-0 items-center px-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.CHAT)}
              className="flex w-full cursor-pointer items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium hover:bg-neutral-800"
            >
              <SquarePenIcon className="size-4.5" />
              New chat
            </button>
          </div>

          {/* Search */}
          <div className="px-2">
            <div className="flex items-center gap-x-2 rounded-lg px-2 py-1.5 focus-within:bg-neutral-800/60 hover:bg-neutral-800/60">
              <SearchIcon className="size-4.5 shrink-0 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats"
                className="w-full bg-transparent para-small-medium outline-none placeholder:text-neutral-500"
              />
            </div>
          </div>

          {/* Chat history, grouped by recency */}
          <div className="chat-scroll flex-1 overflow-y-auto px-2 pb-2">
            {grouped.length === 0 && (
              <div className="px-2 caption-regular text-neutral-500">{query ? "No chats found" : "No chats yet"}</div>
            )}
            {grouped.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="px-2 pb-1 caption-small-medium text-neutral-500">{group.label}</div>
                {group.chats.map((chat) => (
                  <NavLink
                    key={chat.id}
                    to={ROUTES.CHAT_DETAIL(chat.id)}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center justify-between gap-x-1 rounded-lg px-2 py-1.5 para-small-medium hover:bg-neutral-800",
                        isActive && "bg-neutral-800",
                      )
                    }
                  >
                    <span className="truncate">{chat.title}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, chat.id)}
                      aria-label="Delete chat"
                      className="shrink-0 cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};

export default SideBar;
