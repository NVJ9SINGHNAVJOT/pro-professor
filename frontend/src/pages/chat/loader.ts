import type { LoaderFunctionArgs } from "react-router";
import { NEW_ITEM_ID } from "@/constants/routes";
import store from "@/redux/store";
import { setConversations } from "@/redux/slices/chatListSlice";
import { load } from "@/services/client/loadRoute";
import { chatsRoute, type ConversationDetail } from "@/services/operations/chats/chats.route";

export type ChatDetailLoaderData = {
  /** null on `/chat/new` — the draft has no conversation server-side yet. */
  conversation: ConversationDetail | null;
};

/**
 * Parent `/chat` route: the history list. It seeds `chatList` rather than returning loader data —
 * starting, renaming or deleting a conversation patches that row in place, which a loader result
 * can't do. Runs once per entry into the section (`shouldRevalidate: () => false`).
 */
export async function chatListLoader({ request }: LoaderFunctionArgs) {
  const conversations = await load(request.signal, chatsRoute.getConversations);
  store.dispatch(setConversations(conversations.data.conversations));
  return null;
}

/**
 * Child `/chat/:chatId` route: the open conversation.
 *
 * `/chat/new` is the unsaved draft and rides on this same route (see `NEW_ITEM_ID`) — there is
 * nothing to fetch, and staying on one route is what keeps ChatMessages mounted (and its SSE
 * stream alive) when the first turn swaps `new` for the real conversation id.
 */
export async function chatDetailLoader({ params, request }: LoaderFunctionArgs): Promise<ChatDetailLoaderData> {
  if (params.chatId === NEW_ITEM_ID) return { conversation: null };

  const id = Number(params.chatId);
  if (!Number.isFinite(id)) throw new Response("Not a conversation id", { status: 404 });

  const conversation = await load(request.signal, chatsRoute.getConversation, id);
  return { conversation: conversation.data };
}
