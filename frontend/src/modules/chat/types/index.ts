import type { ModelProvider } from "@/services/operations/models/models.route";
import type { MediaAttachment } from "@/services/operations/media/media.api";

export interface UiMessage {
  role: "user" | "assistant" | "error";
  content: string;
  attachments?: MediaAttachment[];
}

export interface SelectedModel {
  provider: ModelProvider;
  model: string;
  inputModalities: string[];
}

export type Group = "Today" | "Yesterday" | "Previous 7 Days" | "Previous 30 Days" | "Older";
