package com.proprofessor.server.common.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.ByteArrayHttpMessageConverter;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Logs the body of every JSON response, closing the loop opened by {@link RequestIdFilter}'s
 * {@code Request received} line. Mirrors the AI service's {@code send_response} helper.
 *
 * <p>This hooks the response <em>object</em> just before serialization rather than buffering the
 * serialized bytes in a servlet filter. That is deliberate: buffering would stall the SSE chat stream and
 * pull whole media files into memory. Consequently:
 *
 * <ul>
 *   <li>Error responses are covered for free — {@code GlobalExceptionHandler} returns an
 *       {@code ApiResponse} envelope, which passes through here like any other body.
 *   <li>Binary responses ({@code ResponseEntity<byte[]>}: TTS audio, media downloads) are logged as a
 *       byte count, never dumped.
 *   <li>The SSE chat stream never reaches this advice — it is written by an async emitter, not a message
 *       converter — so {@code ChatController} logs its own accumulated frames.
 * </ul>
 */
@RestControllerAdvice
public class ResponseLoggingAdvice implements ResponseBodyAdvice<Object> {

    private static final Logger log = LoggerFactory.getLogger(ResponseLoggingAdvice.class);

    private final LogFormat logFormat;

    public ResponseLoggingAdvice(LogFormat logFormat) {
        this.logFormat = logFormat;
    }

    @Override
    public boolean supports(
            @NonNull MethodParameter returnType,
            @NonNull Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    @Nullable
    public Object beforeBodyWrite(
            @Nullable Object body,
            @NonNull MethodParameter returnType,
            @NonNull MediaType selectedContentType,
            @NonNull Class<? extends HttpMessageConverter<?>> selectedConverterType,
            @NonNull ServerHttpRequest request,
            @NonNull ServerHttpResponse response) {

        int status = response instanceof ServletServerHttpResponse servlet
                ? servlet.getServletResponse().getStatus()
                : 200;

        if (ByteArrayHttpMessageConverter.class.isAssignableFrom(selectedConverterType)) {
            int bytes = body instanceof byte[] raw ? raw.length : 0;
            log.info("Response sent | {} | {} bytes {}", status, bytes, selectedContentType);
            return body;
        }

        log.info("Response sent\n{}", logFormat.dumps(envelope(status, body)));
        return body;
    }

    /** Shared envelope shape, so a streamed response can be logged the same way — see ChatController. */
    public static Map<String, Object> envelope(int status, Object body) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("request_id", MDC.get(RequestIdFilter.MDC_KEY));
        envelope.put("status_code", status);
        envelope.put("body", body);
        return envelope;
    }
}
