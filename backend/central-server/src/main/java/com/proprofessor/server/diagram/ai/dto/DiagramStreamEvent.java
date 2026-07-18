package com.proprofessor.server.diagram.ai.dto;

/**
 * Events streamed over SSE by the diagram AI edit, mirroring {@code NoteStreamEvent}.
 * Unlike notes, chunks are progress-display only — the client applies nothing
 * until {@code diagram.done} delivers the full buffered reply for validation.
 */
public sealed interface DiagramStreamEvent
        permits DiagramStreamEvent.DiagramStart, DiagramStreamEvent.DiagramChunk,
        DiagramStreamEvent.DiagramDone, DiagramStreamEvent.DiagramError {

    String TYPE_START = "diagram.start";
    String TYPE_CHUNK = "diagram.chunk";
    String TYPE_DONE = "diagram.done";
    String TYPE_ERROR = "diagram.error";

    String type();

    /** {@code diagram.start} — generation began. */
    record DiagramStart(String type, long diagramId) implements DiagramStreamEvent {
        public static DiagramStart of(long diagramId) {
            return new DiagramStart(TYPE_START, diagramId);
        }
    }

    /** {@code diagram.chunk} — one streamed token, for progress display only. */
    record DiagramChunk(String type, long diagramId, String delta) implements DiagramStreamEvent {
        public static DiagramChunk of(long diagramId, String delta) {
            return new DiagramChunk(TYPE_CHUNK, diagramId, delta);
        }
    }

    /** {@code diagram.done} — the complete buffered reply; the client validates and applies it. */
    record DiagramDone(String type, long diagramId, String raw) implements DiagramStreamEvent {
        public static DiagramDone of(long diagramId, String raw) {
            return new DiagramDone(TYPE_DONE, diagramId, raw);
        }
    }

    /** {@code diagram.error} — generation failed; nothing was applied anywhere. */
    record DiagramError(String type, String requestId, String message) implements DiagramStreamEvent {
        public static DiagramError of(String requestId, String message) {
            return new DiagramError(TYPE_ERROR, requestId, message);
        }
    }
}
