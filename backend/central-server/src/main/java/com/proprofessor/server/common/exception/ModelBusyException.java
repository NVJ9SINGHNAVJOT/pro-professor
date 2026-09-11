package com.proprofessor.server.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown when a model request collides with a generation already in flight. The server keeps at
 * most one model resident at a time (Ollama or AI core), so it refuses to swap a model out from
 * under a running turn instead of loading a second model into memory.
 *
 * <p>Maps to HTTP 409. On the chat SSE stream it surfaces as a {@code chat.busy}
 * frame (toast-only, never persisted to history).
 */
public class ModelBusyException extends AppException {

    private ModelBusyException(String message) {
        super(HttpStatus.CONFLICT, message);
    }

    /** This server refused the switch: {@code activeModelName} is mid-turn on one of the engines. */
    public static ModelBusyException generating(String activeModelName) {
        return new ModelBusyException("'" + activeModelName + "' is generating in another chat. "
                + "Wait for it to finish before switching models.");
    }

    /**
     * The AI core refused: it serializes chat one request at a time and will neither swap its
     * resident model nor queue a turn indefinitely behind another. Nameless because the engine
     * doesn't say whose turn holds it.
     */
    public static ModelBusyException aiCoreBusy() {
        return new ModelBusyException(
                "The AI core is still generating. Wait for it to finish before trying again.");
    }
}
