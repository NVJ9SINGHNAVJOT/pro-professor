package com.proprofessor.server.common.http;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;

/**
 * Central factory for outbound HTTP clients used by provider clients.
 *
 * <p>All external service calls (Ollama, AI service) are local plaintext HTTP.
 * The JDK {@link HttpClient} defaults to HTTP/2, which attempts an h2c upgrade over
 * cleartext — a combo that strict servers like uvicorn/h11 reject. We pin HTTP/1.1
 * globally so every {@link RestClient} produced here sends a plain request with
 * {@code Content-Length} and no upgrade handshake.
 */
public final class HttpClientFactory {

    private static final HttpClient HTTP_1_1 = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    private HttpClientFactory() {
    }

    /**
     * Returns a {@link RestClient} pre-configured for the given base URL.
     *
     * @param baseUrl the target service root (trailing slash is stripped automatically)
     */
    public static RestClient forBaseUrl(String baseUrl) {
        return RestClient.builder()
                .baseUrl(stripTrailingSlash(baseUrl))
                .requestFactory(new JdkClientHttpRequestFactory(HTTP_1_1))
                .requestInterceptor(new CorrelationIdInterceptor())
                .build();
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
