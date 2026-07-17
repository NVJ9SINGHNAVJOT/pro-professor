package com.proprofessor.server.notes.ai.dto;

/**
 * Events streamed over SSE by the notes AI actions, mirroring the chat stream's
 * envelope: each record carries its {@code type} so the frontend dispatches on it.
 */
public sealed interface NoteStreamEvent
        permits NoteStreamEvent.NoteStart, NoteStreamEvent.NoteChunk,
        NoteStreamEvent.NoteDone, NoteStreamEvent.NoteError {

    String TYPE_START = "note.start";
    String TYPE_CHUNK = "note.chunk";
    String TYPE_DONE = "note.done";
    String TYPE_ERROR = "note.error";

    String type();

    /** {@code note.start} — generation began; the prior content is snapshotted once it finishes. */
    record NoteStart(String type, long noteId) implements NoteStreamEvent {
        public static NoteStart of(long noteId) {
            return new NoteStart(TYPE_START, noteId);
        }
    }

    /** {@code note.chunk} — one streamed token of the rewritten note. */
    record NoteChunk(String type, long noteId, String delta) implements NoteStreamEvent {
        public static NoteChunk of(long noteId, String delta) {
            return new NoteChunk(TYPE_CHUNK, noteId, delta);
        }
    }

    /**
     * {@code note.done} — the note was saved. {@code revisionId} points at the snapshot of the
     * pre-AI content, so the edit is reversible.
     */
    record NoteDone(String type, long noteId, long revisionId) implements NoteStreamEvent {
        public static NoteDone of(long noteId, long revisionId) {
            return new NoteDone(TYPE_DONE, noteId, revisionId);
        }
    }

    /** {@code note.error} — generation failed; the note was left untouched. */
    record NoteError(String type, String requestId, String message) implements NoteStreamEvent {
        public static NoteError of(String requestId, String message) {
            return new NoteError(TYPE_ERROR, requestId, message);
        }
    }
}
