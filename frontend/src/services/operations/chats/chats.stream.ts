import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";
import type { ModelProvider } from "@/services/operations/models/models.route";
import type { ChatMetricsData } from "@/modules/chat/types";

/* ── Payload & callback types ─────────────────────────────────────────────── */

export interface ChatSendPayload {
  conversationId: number | null;
  provider?: ModelProvider;
  model?: string;
  content: string;
  attachmentIds?: number[];
  /** Persona/instructions for a new conversation; honored only on the first turn (no conversationId). */
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  verbose?: boolean;
  /** UI preference (show reasoning); persisted on the conversation, not forwarded to the provider. */
  thinkingEnabled?: boolean;
}

export interface ChatStreamCallbacks {
  onStart: (data: { conversationId: number; title: string }) => void;
  onTitle: (data: { conversationId: number; title: string }) => void;
  onTranscript: (data: { content: string }) => void;
  onChunk: (data: { delta: string }) => void;
  onSettings: (data: { messageId: number }) => void;
  onThinking: (data: { delta: string }) => void;
  onMetrics: (data: ChatMetricsData) => void;
  onDone: (data: { conversationId: number; messageId: number }) => void;
  onError: (message: string, meta?: { conversationId?: number; messageId?: number; requestId?: string }) => void;
}

/* ── SSE frame types (mirror backend ChatStreamEvent) ─────────────────────── */

interface ChatStartFrame {
  type: "chat.start";
  conversationId: number;
  title: string;
}

interface ChatTitleFrame {
  type: "chat.title";
  conversationId: number;
  title: string;
}

interface ChatTranscriptFrame {
  type: "chat.transcript";
  conversationId: number;
  content: string;
}

interface ChatChunkFrame {
  type: "chat.chunk";
  conversationId: number;
  delta: string;
}

interface ChatSettingsFrame {
  type: "chat.settings";
  conversationId: number;
  messageId: number;
}

interface ChatThinkingFrame {
  type: "chat.thinking";
  conversationId: number;
  delta: string;
}

interface ChatMetricsFrame {
  type: "chat.metrics";
  conversationId: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  evalRate: number | null;
  totalDurationS: number | null;
}

interface ChatDoneFrame {
  type: "chat.done";
  conversationId: number;
  messageId: number;
}

interface ChatErrorFrame {
  type: "chat.error";
  message: string;
  conversationId?: number;
  messageId?: number;
  requestId?: string;
}

type ChatStreamFrame =
  | ChatStartFrame
  | ChatTitleFrame
  | ChatTranscriptFrame
  | ChatChunkFrame
  | ChatSettingsFrame
  | ChatThinkingFrame
  | ChatMetricsFrame
  | ChatDoneFrame
  | ChatErrorFrame;

/* ── Stream parser ────────────────────────────────────────────────────────── */

/**
 * Calls {@code POST /api/v1/chats/send} and parses the SSE response stream,
 * dispatching each frame to the appropriate callback.
 *
 * @returns An {@link AbortController} the caller can use to cancel mid-stream.
 *          Aborting closes the connection; the backend catches the disconnect
 *          and stops generation.
 */
function send(payload: ChatSendPayload, callbacks: ChatStreamCallbacks): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      // rawFetch throws on a non-OK response; the catch below routes it to onError.
      const res = await rawFetch(
        `${BASE_URL_SERVER}/chats/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
        "Server error",
      );

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("Streaming not supported by this browser");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newlines. Each frame looks like:
        //   data:{"type":"chat.chunk","conversationId":1,"delta":"Hello"}
        const frames = buffer.split("\n\n");
        // Keep the last (possibly incomplete) chunk in the buffer
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5);
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as ChatStreamFrame;
              dispatch(event, callbacks);
            } catch {
              // skip malformed frames
            }
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5);
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr) as ChatStreamFrame;
            dispatch(event, callbacks);
          } catch {
            // skip malformed frames
          }
        }
      }
    } catch (err: unknown) {
      // AbortError is expected when the user hits Stop
      if (err instanceof DOMException && err.name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err.message : "Stream failed");
    }
  })();

  return controller;
}

function dispatch(event: ChatStreamFrame, cb: ChatStreamCallbacks) {
  switch (event.type) {
    case "chat.start":
      cb.onStart({ conversationId: event.conversationId, title: event.title });
      break;
    case "chat.title":
      cb.onTitle({ conversationId: event.conversationId, title: event.title });
      break;
    case "chat.transcript":
      cb.onTranscript({ content: event.content });
      break;
    case "chat.chunk":
      cb.onChunk({ delta: event.delta });
      break;
    case "chat.settings":
      cb.onSettings({ messageId: event.messageId });
      break;
    case "chat.thinking":
      cb.onThinking({ delta: event.delta });
      break;
    case "chat.metrics":
      cb.onMetrics({
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens,
        evalRate: event.evalRate,
        totalDurationS: event.totalDurationS,
      });
      break;
    case "chat.done":
      cb.onDone({
        conversationId: event.conversationId,
        messageId: event.messageId,
      });
      break;
    case "chat.error":
      cb.onError(event.message, {
        conversationId: event.conversationId,
        messageId: event.messageId,
        requestId: event.requestId,
      });
      break;
  }
}

export const chatsStream = { send };
