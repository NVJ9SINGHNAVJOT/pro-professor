package com.proprofessor.server.common.http;

import com.proprofessor.server.common.web.RequestIdFilter;
import org.slf4j.MDC;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.lang.NonNull;

import java.io.IOException;

/**
 * Propagates the current request's id to downstream services as a correlation id.
 *
 * <p>The id is read from the SLF4J {@link MDC} (populated by {@link RequestIdFilter}) and, when
 * present, attached as the {@value #HEADER} header. Unlike {@code X-Request-Id} — which each hop
 * regenerates for its own logs — this header is set once at the origin and forwarded unchanged, so
 * a single user action can be traced across the central server, AI service, and storage service.
 */
public class CorrelationIdInterceptor implements ClientHttpRequestInterceptor {

    public static final String HEADER = "X-Correlation-Id";

    @Override
    @NonNull
    public ClientHttpResponse intercept(
            @NonNull HttpRequest request,
            @NonNull byte[] body,
            @NonNull ClientHttpRequestExecution execution) throws IOException {
        String correlationId = MDC.get(RequestIdFilter.MDC_KEY);
        if (correlationId != null && !correlationId.isBlank()) {
            request.getHeaders().add(HEADER, correlationId);
        }
        return execution.execute(request, body);
    }
}
