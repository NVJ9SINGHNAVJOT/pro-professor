package com.proprofessor.server.common.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.AsyncEvent;
import jakarta.servlet.AsyncListener;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Logs every HTTP request on arrival and tags it with a short {@code requestId} for correlation.
 *
 * <p>The id is taken from an incoming {@code X-Request-Id} header (so a caller / gateway can supply
 * its own) or generated, placed in the SLF4J {@link MDC} (rendered on every log line — see
 * {@code logging.pattern.level}), and echoed back on the response. Everything logged while handling the
 * request therefore carries the same id, and it is forwarded to downstream services as
 * {@code X-Correlation-Id} (see {@code CorrelationIdInterceptor}), so one user action can be traced
 * across the central server and the AI service.
 *
 * <p>Mirrors the AI service's {@code LoggingMiddleware}: a {@code Request received} envelope with the
 * method, URL, client, whitelisted headers and body, closed by a completion line. Response bodies are
 * logged separately by {@link ResponseLoggingAdvice} — this filter never buffers the response, because
 * doing so would stall the SSE chat stream and pull whole media files into memory.
 *
 * <p>Async work (the SSE chat stream) runs on a separate executor; the {@code requestId} is carried onto
 * those threads by the {@code TaskDecorator} configured on {@code chatStreamExecutor}, and the completion
 * line is deferred to an {@link AsyncListener} so it reports the real duration of the stream rather than
 * firing the moment the emitter is handed to the container.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "requestId";
    public static final String HEADER = "X-Request-Id";

    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);

    private final LogFormat logFormat;
    private final ObjectMapper objectMapper;

    public RequestIdFilter(LogFormat logFormat, ObjectMapper objectMapper) {
        this.logFormat = logFormat;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String requestId = resolveRequestId(request);
        MDC.put(MDC_KEY, requestId);
        response.setHeader(HEADER, requestId);

        long start = System.currentTimeMillis();
        HttpServletRequest logged = request;
        Object body = null;

        String contentType = request.getContentType() == null ? "" : request.getContentType();
        if (contentType.contains("multipart/form-data")) {
            // Reading the body here would exhaust the stream before the handler parses the upload.
            // Log a non-consuming summary instead — raw bytes are never logged anyway.
            body = "<multipart/form-data, content-length=" + request.getContentLengthLong() + ">";
        } else if (contentType.contains("application/json")) {
            byte[] raw = StreamUtils.copyToByteArray(request.getInputStream());
            logged = new CachedBodyHttpServletRequest(request, raw);
            body = parseJson(raw);
        }

        log.info("Request received\n{}", logFormat.dumps(requestEnvelope(request, requestId, body)));

        try {
            filterChain.doFilter(logged, response);
        } finally {
            if (request.isAsyncStarted()) {
                // The SSE chat send: the handler has only handed back an emitter, nothing has streamed
                // yet. Defer the completion line until the stream actually ends so its duration means
                // something. The MDC is re-established inside the listener because the container may run
                // it on a different thread.
                request.getAsyncContext().addListener(new CompletionLogger(requestId, request, response, start));
            } else {
                logCompletion(request, response.getStatus(), start);
            }
            MDC.remove(MDC_KEY);
        }
    }

    private Map<String, Object> requestEnvelope(HttpServletRequest request, String requestId, Object body) {
        Map<String, String> headers = new LinkedHashMap<>();
        for (String name : LogFormat.LOGGED_HEADERS) {
            headers.put(name, request.getHeader(name));
        }

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("request_id", requestId);
        envelope.put("method", request.getMethod());
        envelope.put("url", request.getRequestURI()
                + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
        envelope.put("client_ip", request.getRemoteAddr());
        envelope.put("headers", headers);
        envelope.put("body", body);
        return envelope;
    }

    /** Parses the body for logging only — an unreadable body must not fail the request. */
    private Object parseJson(byte[] raw) {
        if (raw.length == 0) {
            return null;
        }
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ex) {
            return "<unparseable JSON>";
        }
    }

    private static void logCompletion(HttpServletRequest request, int status, long start) {
        log.info("<-- {} {} {} ({}ms)",
                request.getMethod(), request.getRequestURI(), status, System.currentTimeMillis() - start);
    }

    private static String resolveRequestId(HttpServletRequest request) {
        String incoming = request.getHeader(HEADER);
        if (incoming != null && !incoming.isBlank()) {
            return incoming;
        }
        return UUID.randomUUID().toString().substring(0, 8);
    }

    /** Logs the completion line once an async (SSE) response has actually finished streaming. */
    private record CompletionLogger(
            String requestId, HttpServletRequest request, HttpServletResponse response, long start)
            implements AsyncListener {

        @Override
        public void onComplete(AsyncEvent event) {
            MDC.put(MDC_KEY, requestId);
            try {
                logCompletion(request, response.getStatus(), start);
            } finally {
                MDC.remove(MDC_KEY);
            }
        }

        @Override
        public void onTimeout(AsyncEvent event) {
            // onComplete still fires afterwards, which logs the line — nothing to do here.
        }

        @Override
        public void onError(AsyncEvent event) {
            // onComplete still fires afterwards, which logs the line — nothing to do here.
        }

        @Override
        public void onStartAsync(AsyncEvent event) {
            // The listener is not carried over to a re-started async cycle, so re-register it.
            event.getAsyncContext().addListener(this);
        }
    }
}
