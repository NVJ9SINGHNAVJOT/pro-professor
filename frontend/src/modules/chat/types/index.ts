import type { ModelProvider } from "@/services/operations/models.route";
import type { MediaAttachment } from "@/services/media";

export interface UiMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: MediaAttachment[];
}

export interface SelectedModel {
  provider: ModelProvider;
  model: string;
  inputModalities: string[];
}

export type Group = "Today" | "Yesterday" | "Previous 7 Days" | "Previous 30 Days" | "Older";
