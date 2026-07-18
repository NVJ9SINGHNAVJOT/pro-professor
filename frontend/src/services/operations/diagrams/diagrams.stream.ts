import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/* ── Payload & callback types ─────────────────────────────────────────────── */

export interface DiagramAiPayload {
  instruction: string;
  /** "ollama" or "ai-service". */
  provider: string;
  /** Provider model id — required. */
  model?: string;
  /** The CURRENT semantic JSON from the store — the edit targets what the user sees. */
  semantic: unknown;
  /** Repair retry only: the model's previous (invalid) reply + why it was rejected. */
  priorReply?: string;
  validationErrors?: string;
}

export interface DiagramAiStreamCallbacks {
  onStart: (data: { diagramId: number }) => void;
  /** Progress display only — never applied. */
  onChunk: (data: { delta: string }) => void;
  /** The full buffered reply; the caller validates and applies it. */
  onDone: (data: { diagramId: number; raw: string }) => void;
  onError: (message: string, meta?: { requestId?: string }) => void;
}

/* ── SSE frame types (mirror backend DiagramStreamEvent) ──────────────────── */

interface DiagramStartFrame {
  type: "diagram.start";
  diagramId: number;
}

interface DiagramChunkFrame {
  type: "diagram.chunk";
  diagramId: number;
  delta: string;
}

interface DiagramDoneFrame {
  type: "diagram.done";
  diagramId: number;
  raw: string;
}

interface DiagramErrorFrame {
  type: "diagram.error";
  message: string;
  requestId?: string;
}

type DiagramStreamFrame = DiagramStartFrame | DiagramChunkFrame | DiagramDoneFrame | DiagramErrorFrame;

/* ── Stream parser ────────────────────────────────────────────────────────── */

/**
 * Calls {@code POST /api/v1/diagrams/{id}/ai-edit} and dispatches each SSE
 * frame, mirroring {@link "@/services/operations/notes/notes.stream"}.
 *
 * @returns An {@link AbortController} to cancel mid-stream; the backend catches
 *          the disconnect and stops generation (nothing is applied anywhere).
 */
function run(diagramId: number, payload: DiagramAiPayload, callbacks: DiagramAiStreamCallbacks): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await rawFetch(
        `${BASE_URL_SERVER}/diagrams/${diagramId}/ai-edit`,
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

      const handleLines = (chunk: string) => {
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5);
          if (!jsonStr) continue;
          try {
            dispatch(JSON.parse(jsonStr) as DiagramStreamFrame, callbacks);
          } catch {
            // skip malformed frames
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by double newlines; keep the last partial chunk buffered.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        frames.forEach(handleLines);
      }
      if (buffer.trim()) handleLines(buffer);
    } catch (err: unknown) {
      // AbortError is expected when the user cancels
      if (err instanceof DOMException && err.name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err.message : "Stream failed");
    }
  })();

  return controller;
}

function dispatch(event: DiagramStreamFrame, cb: DiagramAiStreamCallbacks) {
  switch (event.type) {
    case "diagram.start":
      cb.onStart({ diagramId: event.diagramId });
      break;
    case "diagram.chunk":
      cb.onChunk({ delta: event.delta });
      break;
    case "diagram.done":
      cb.onDone({ diagramId: event.diagramId, raw: event.raw });
      break;
    case "diagram.error":
      cb.onError(event.message, { requestId: event.requestId });
      break;
  }
}

export const diagramsStream = { run };
