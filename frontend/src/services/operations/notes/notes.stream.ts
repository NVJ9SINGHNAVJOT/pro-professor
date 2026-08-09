import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/* ── Payload & callback types ─────────────────────────────────────────────── */

export interface NoteAiPayload {
  /** What the AI should change — required. */
  instruction?: string;
  /** "ollama" or "ai-service". */
  provider: string;
  /** Provider model id — required. */
  model?: string;
  /**
   * The exact text to rewrite, when the edit is scoped to an editor selection. The server locates it
   * in the saved note, marks it for the model, and asks for *only* its replacement back. Omitted for
   * a whole-note rewrite. Sent as text rather than offsets: the note is saved right before this
   * runs, and that save re-derives frontmatter, which can shift every offset in the buffer.
   */
  selection?: string;
}

export interface NoteAiStreamCallbacks {
  onStart: (data: { noteId: number }) => void;
  onChunk: (data: { delta: string }) => void;
  /** Generation finished and the proposal passed validation. Nothing was written to the note. */
  onDone: (data: { noteId: number }) => void;
  onError: (message: string, meta?: { requestId?: string }) => void;
}

/* ── SSE frame types (mirror backend NoteStreamEvent) ─────────────────────── */

interface NoteStartFrame {
  type: "note.start";
  noteId: number;
}

interface NoteChunkFrame {
  type: "note.chunk";
  noteId: number;
  delta: string;
}

interface NoteDoneFrame {
  type: "note.done";
  noteId: number;
}

interface NoteErrorFrame {
  type: "note.error";
  message: string;
  requestId?: string;
}

type NoteStreamFrame = NoteStartFrame | NoteChunkFrame | NoteDoneFrame | NoteErrorFrame;

/* ── Stream parser ────────────────────────────────────────────────────────── */

/**
 * Calls {@code POST /api/v1/notes/{id}/ai-update} and dispatches each frame, mirroring
 * {@link chatsStream.send}. The endpoint only *generates* — the caller stages the streamed text
 * and the user applies or discards it, so nothing here writes to the note.
 *
 * @returns An {@link AbortController} to cancel mid-stream; the backend catches
 *          the disconnect and stops generation.
 */
function run(
  noteId: number,
  payload: NoteAiPayload,
  callbacks: NoteAiStreamCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await rawFetch(
        `${BASE_URL_SERVER}/notes/${noteId}/ai-update`,
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
            dispatch(JSON.parse(jsonStr) as NoteStreamFrame, callbacks);
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

function dispatch(event: NoteStreamFrame, cb: NoteAiStreamCallbacks) {
  switch (event.type) {
    case "note.start":
      cb.onStart({ noteId: event.noteId });
      break;
    case "note.chunk":
      cb.onChunk({ delta: event.delta });
      break;
    case "note.done":
      cb.onDone({ noteId: event.noteId });
      break;
    case "note.error":
      cb.onError(event.message, { requestId: event.requestId });
      break;
  }
}

export const notesStream = { run };
