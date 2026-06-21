import { createRoute } from "@/services/client/apiRoute";
import { BASE_URL_SERVER } from "@/services/client/config";
import type { MediaAttachment } from "@/services/operations/media/media.api";

const chatsEndPoints = {
  GET_ALL: `${BASE_URL_SERVER}/chats`,
  GET_ONE: (id: number) => `${BASE_URL_SERVER}/chats/${id}`,
  DELETE_ONE: (id: number) => `${BASE_URL_SERVER}/chats/${id}`,
};

export interface ConversationSummary {
  id: number;
  title: string;
  model: string;
  provider: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  createdAt: string;
  attachments: MediaAttachment[];
}

export interface ConversationDetail {
  id: number;
  title: string;
  model: string;
  provider: string;
  mode: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export type GetConversationsResponse = {
  message: string;
  data: { conversations: ConversationSummary[] };
};

export type GetConversationResponse = {
  message: string;
  data: ConversationDetail;
};

export const chatsRoute = {
  getConversations: createRoute<[], GetConversationsResponse>(() => ({
    method: "GET",
    url: chatsEndPoints.GET_ALL,
  })),

  getConversation: createRoute<[id: number], GetConversationResponse>((id) => ({
    method: "GET",
    url: chatsEndPoints.GET_ONE(id),
  })),

  deleteConversation: createRoute<[id: number], { message: string }>((id) => ({
    method: "DELETE",
    url: chatsEndPoints.DELETE_ONE(id),
  })),
};
