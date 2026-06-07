package com.proprofessor.server.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Base application exception. Carries the {@link HttpStatus} the
 * {@link GlobalExceptionHandler} should respond with, so services can throw a
 * domain error and let the web layer translate it to the right HTTP code.
 *
 * <p>Throw this (or a subclass) from the service layer. Do not throw raw
 * {@code ResponseStatusException} from services — keep web concerns out of
 * business logic.
 */
public class AppException extends RuntimeException {

    private final HttpStatus status;

    public AppException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
