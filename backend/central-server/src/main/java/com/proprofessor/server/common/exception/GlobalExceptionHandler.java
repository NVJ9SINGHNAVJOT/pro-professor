package com.proprofessor.server.common.exception;

import com.proprofessor.server.common.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

/**
 * Centralized exception handling for all REST controllers.
 *
 * <p>Keeps error-to-HTTP translation in one place so controllers stay thin and
 * never build error responses themselves. Every handler returns the standard
 * {@link ApiResponse} envelope.
 *
 * <p>This is also the single place errors are logged: the service layer throws, and the failure is
 * recorded here once, with a stack trace, correlated by the {@code requestId} in the MDC. The error
 * response body itself is logged by {@code ResponseLoggingAdvice}, so a failed request reads
 * end-to-end as {@code Request received} → {@code Request failed} → {@code Response sent}.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Domain errors thrown by the service layer. */
    @ExceptionHandler(AppException.class)
    public ResponseEntity<ApiResponse<Void>> handleAppException(AppException ex) {
        HttpStatus status = ex.getStatus();
        // A 4xx is the caller's mistake, a 5xx is ours — but log the stack trace either way; a domain
        // error with no trace is the hardest kind to chase down.
        if (status.is5xxServerError()) {
            log.error("Request failed | {} {}", status.value(), ex.getMessage(), ex);
        } else {
            log.warn("Request failed | {} {}", status.value(), ex.getMessage(), ex);
        }
        return ResponseEntity
                .status(status)
                .body(ApiResponse.error(ex.getMessage()));
    }

    /** Bean Validation failures on {@code @Valid} request bodies. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::formatFieldError)
                .collect(Collectors.joining("; "));
        log.warn("Request failed | 400 validation error | {}", message, ex);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    /** Anything unhandled — never leak stack traces to the client, but always log them. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        log.error("Unhandled error | {}: {}", ex.getClass().getSimpleName(), ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("An unexpected error occurred"));
    }

    private static String formatFieldError(FieldError error) {
        return error.getField() + ": " + error.getDefaultMessage();
    }
}
