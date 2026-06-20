package com.proprofessor.server.common.web;

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
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Tags every HTTP request with a short {@code requestId} for log correlation.
 *
 * <p>The id is taken from an incoming {@code X-Request-Id} header (so a caller / gateway can supply
 * its own) or generated, placed in the SLF4J {@link MDC} (rendered on every log line — see
 * {@code logging.pattern.level}), and echoed back on the response. Entry and completion lines bracket
 * the request so a failure can be traced from request to response.
 *
 * <p>Async work (the SSE chat stream) runs on a separate executor; the {@code requestId} is carried
 * onto those threads by the {@code TaskDecorator} configured on {@code chatStreamExecutor}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "requestId";
    public static final String HEADER = "X-Request-Id";

    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String requestId = resolveRequestId(request);
        MDC.put(MDC_KEY, requestId);
        response.setHeader(HEADER, requestId);

        long start = System.currentTimeMillis();
        log.info("--> {} {}{} ip={} origin={} secFetchSite={} platform={}",
                request.getMethod(),
                request.getRequestURI(),
                request.getQueryString() == null ? "" : "?" + request.getQueryString(),
                request.getRemoteAddr(),
                request.getHeader("origin"),
                request.getHeader("sec-fetch-site"),
                request.getHeader("sec-ch-ua-platform"));
        try {
            filterChain.doFilter(request, response);
        } finally {
            log.info("<-- {} {} {} ({}ms)",
                    request.getMethod(), request.getRequestURI(), response.getStatus(),
                    System.currentTimeMillis() - start);
            MDC.remove(MDC_KEY);
        }
    }

    private static String resolveRequestId(HttpServletRequest request) {
        String incoming = request.getHeader(HEADER);
        if (incoming != null && !incoming.isBlank()) {
            return incoming;
        }
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
