package com.proprofessor.server.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown when a chat/load request targets a different model than the one that is
 * currently generating. The server keeps at most one model resident at a time
 * (Ollama or AI service), so it refuses to swap models out from under an in-flight
 * turn instead of loading a second model into memory.
 *
 * <p>Maps to HTTP 409. On the chat SSE stream it surfaces as a {@code chat.busy}
 * frame (toast-only, never persisted to history).
 */
public class ModelBusyException extends AppException {

    public ModelBusyException(String activeModelName) {
        super(HttpStatus.CONFLICT,
                "'" + activeModelName + "' is generating in another chat. "
                        + "Wait for it to finish before switching models.");
    }
}
