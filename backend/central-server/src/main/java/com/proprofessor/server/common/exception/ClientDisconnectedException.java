package com.proprofessor.server.common.exception;

/**
 * Raised when writing to a stream fails because the client disconnected
 * (e.g. the user hit Stop, closing the SSE connection mid-generation).
 *
 * <p>Shared between the web layer (which raises it on a failed SSE write) and the
 * service layer (which rethrows it so a client disconnect is not mistaken for a
 * generation failure and persisted as an error).
 */
public class ClientDisconnectedException extends RuntimeException {
    public ClientDisconnectedException(Throwable cause) {
        super(cause);
    }
}
