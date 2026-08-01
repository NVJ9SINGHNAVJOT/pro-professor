import { useMemo } from "react";
import { SquarePenIcon, Trash2Icon } from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import { SIDEBAR_LIST, SIDEBAR_ROW_WRAPPER, sidebarRow } from "@/components/common/sidebarRow";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { removeConversation } from "@/redux/slices/chatListSlice";
import { chatsRoute, type ConversationSummary } from "@/services/operations/chats/chats.route";
import { NEW_ITEM_ID, ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";
import { GROUPS } from "@/modules/chat/constants";
import type { Group } from "@/modules/chat/types";
import { groupOf } from "@/modules/chat/utils";

interface SideBarProps {
  /** The history list, loaded by the parent `/chat` route. */
  conversations: ConversationSummary[];
  isOpen: boolean;
  onToggle: () => void;
}

const SideBar = ({ conversations, isOpen, onToggle }: SideBarProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const chatId = useParams().chatId;
  const { execute: deleteConversation } = useApi(chatsRoute.deleteConversation);

  // Bucket by recency. Searching is not here — ⌘K searches chats *and* notes, over full message
  // text rather than the titles this list happens to have loaded.
  const grouped = useMemo(() => {
    const buckets = new Map<Group, ConversationSummary[]>();
    conversations.forEach((chat) => {
      const group = groupOf(chat.updatedAt);
      buckets.set(group, [...(buckets.get(group) ?? []), chat]);
    });
    return GROUPS.filter((group) => buckets.has(group)).map((group) => ({
      label: group,
      chats: buckets.get(group)!,
    }));
  }, [conversations]);

  const handleDelete = async (id: number) => {
    const res = await deleteConversation(id);
    if (res.error) {
      toast.error("Failed to delete chat");
      return;
    }
    dispatch(removeConversation(id));
    if (chatId === String(id)) navigate(ROUTES.CHAT_NEW);
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
          <LeftNav />
          {/* New chat — shares the chat top bar's height for a uniform top band */}
          <div className="flex h-11.5 shrink-0 items-center px-2">
            <button
              type="button"
              // Already on the new-chat screen: staying put costs nothing, whereas re-navigating
              // to the URL we're on reads as a revalidation and refetches the list.
              onClick={() => chatId !== NEW_ITEM_ID && navigate(ROUTES.CHAT_NEW)}
              className="flex w-full cursor-pointer items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium hover:bg-neutral-800"
            >
              <SquarePenIcon className="size-4.5" />
              New chat
            </button>
          </div>

          {/* Chat history, grouped by recency */}
          <div className="chat-scroll flex-1 overflow-y-auto px-2 pb-2">
            {grouped.length === 0 && <div className="px-2 caption-regular text-neutral-500">No chats yet</div>}
            {grouped.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="px-2 pb-1 caption-small-medium text-neutral-500">{group.label}</div>
                <div className={SIDEBAR_LIST}>
                  {group.chats.map((chat) => (
                    <SidebarRowMenu
                      key={chat.id}
                      label={chat.title}
                      actions={[
                        {
                          label: "Delete",
                          icon: Trash2Icon,
                          destructive: true,
                          onSelect: () => handleDelete(chat.id),
                        },
                      ]}
                    >
                      <div className={SIDEBAR_ROW_WRAPPER}>
                        <NavLink
                          to={ROUTES.CHAT_DETAIL(chat.id)}
                          // Re-navigating to the chat we're already on reads as a revalidation and
                          // refetches the list, so swallow that click.
                          onClick={(e) => chatId === String(chat.id) && e.preventDefault()}
                          className={({ isActive }) => sidebarRow(isActive)}
                        >
                          <span className="truncate">{chat.title}</span>
                        </NavLink>
                      </div>
                    </SidebarRowMenu>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};

export default SideBar;
