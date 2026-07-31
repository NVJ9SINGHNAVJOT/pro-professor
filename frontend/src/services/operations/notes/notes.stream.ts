import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/* ── Payload & callback types ─────────────────────────────────────────────── */

export type NoteAiAction = "ai-update" | "summarize" | "continue";

/**
 * What the stream carries. `replace` is the complete new note — stream it into the editor.
 * `fragment` is one piece the server splices in, so the buffer must be left alone and the note
 * refetched on `note.done`.
 */
export type NoteAiMode = "replace" | "fragment";

export interface NoteAiPayload {
  /** Required for "ai-update"; ignored by the other actions. */
  instruction?: string;
  /** "ollama" or "ai-service". */
  provider: string;
  /** Provider model id — required. */
  model?: string;
}

export interface NoteAiStreamCallbacks {
  onStart: (data: { noteId: number; mode: NoteAiMode }) => void;
  onChunk: (data: { delta: string }) => void;
  /** The note was saved; revisionId points at the snapshot of the prior content. */
  onDone: (data: { noteId: number; revisionId: number }) => void;
  onError: (message: string, meta?: { requestId?: string }) => void;
}

/* ── SSE frame types (mirror backend NoteStreamEvent) ─────────────────────── */

interface NoteStartFrame {
  type: "note.start";
  noteId: number;
  mode: NoteAiMode;
}

interface NoteChunkFrame {
  type: "note.chunk";
  noteId: number;
  delta: string;
}

interface NoteDoneFrame {
  type: "note.done";
  noteId: number;
  revisionId: number;
}

interface NoteErrorFrame {
  type: "note.error";
  message: string;
  requestId?: string;
}

type NoteStreamFrame = NoteStartFrame | NoteChunkFrame | NoteDoneFrame | NoteErrorFrame;

/* ── Stream parser ────────────────────────────────────────────────────────── */

/**
 * Calls one of the {@code POST /api/v1/notes/{id}/(ai-update|summarize|continue)}
 * SSE endpoints and dispatches each frame, mirroring {@link chatsStream.send}.
 *
 * @returns An {@link AbortController} to cancel mid-stream; the backend catches
 *          the disconnect and stops generation (the note is left untouched).
 */
function run(
  noteId: number,
  action: NoteAiAction,
  payload: NoteAiPayload,
  callbacks: NoteAiStreamCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await rawFetch(
        `${BASE_URL_SERVER}/notes/${noteId}/${action}`,
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
      cb.onStart({ noteId: event.noteId, mode: event.mode });
      break;
    case "note.chunk":
      cb.onChunk({ delta: event.delta });
      break;
    case "note.done":
      cb.onDone({ noteId: event.noteId, revisionId: event.revisionId });
      break;
    case "note.error":
      cb.onError(event.message, { requestId: event.requestId });
      break;
  }
}

export const notesStream = { run };
