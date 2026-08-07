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

    /** {@code note.start} — generation began. The note itself is never written by this stream. */
    record NoteStart(String type, long noteId) implements NoteStreamEvent {
        public static NoteStart of(long noteId) {
            return new NoteStart(TYPE_START, noteId);
        }
    }

    /** {@code note.chunk} — one streamed token of the proposed note. */
    record NoteChunk(String type, long noteId, String delta) implements NoteStreamEvent {
        public static NoteChunk of(long noteId, String delta) {
            return new NoteChunk(TYPE_CHUNK, noteId, delta);
        }
    }

    /**
     * {@code note.done} — generation finished and the proposal passed validation. Nothing was
     * written: the client stages the streamed text for the user to apply or discard.
     */
    record NoteDone(String type, long noteId) implements NoteStreamEvent {
        public static NoteDone of(long noteId) {
            return new NoteDone(TYPE_DONE, noteId);
        }
    }

    /** {@code note.error} — generation failed; discard whatever was staged. */
    record NoteError(String type, String requestId, String message) implements NoteStreamEvent {
        public static NoteError of(String requestId, String message) {
            return new NoteError(TYPE_ERROR, requestId, message);
        }
    }
}
