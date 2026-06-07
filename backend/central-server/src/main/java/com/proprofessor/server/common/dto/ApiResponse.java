package com.proprofessor.server.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Standard response envelope returned by every REST endpoint.
 *
 * <p>Mirrors the {@code { success, message, data }} shape from the old Node
 * {@code utils/response.ts}, giving the frontend a single predictable contract.
 * {@code null} fields are omitted from the JSON output.
 *
 * @param success whether the request succeeded
 * @param message human-readable message (especially useful on errors)
 * @param data    the payload on success; {@code null} on error
 * @param <T>     payload type
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(
        boolean success,
        String message,
        T data
) {

    /** Success with a payload. */
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, null, data);
    }

    /** Success with a payload and a message. */
    public static <T> ApiResponse<T> ok(String message, T data) {
        return new ApiResponse<>(true, message, data);
    }

    /** Failure with an error message and no payload. */
    public static <T> ApiResponse<T> error(String message) {
        return new ApiResponse<>(false, message, null);
    }
}
