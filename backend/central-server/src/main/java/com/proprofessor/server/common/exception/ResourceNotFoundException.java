package com.proprofessor.server.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown when a requested resource (conversation, model, ...) does not exist.
 * Translated to HTTP 404 by the {@link GlobalExceptionHandler}.
 */
public class ResourceNotFoundException extends AppException {

    public ResourceNotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, message);
    }
}
