package com.proprofessor.server.notes.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Streams a completion from the Anthropic Messages API for notes AI actions.
 *
 * <p>Deliberately a plain JSON POST over the existing {@link RestClient} stack
 * (no Anthropic SDK): the request is {@code stream: true} and the SSE lines are
 * parsed by hand, mirroring how the frontend parses the chat stream.
 */
@Component
public class AnthropicClient {

    private static final Logger log = LoggerFactory.getLogger(AnthropicClient.class);
    private static final String ANTHROPIC_VERSION = "2023-06-01";
    /** Streamed, so a large ceiling is safe — a rewritten note is returned in full. */
    private static final int MAX_TOKENS = 64000;

    private final RestClient restClient;
    private final AppProperties.Anthropic properties;
    private final ObjectMapper objectMapper;

    public AnthropicClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this.properties = appProperties.anthropic();
        this.restClient = HttpClientFactory.forBaseUrl(properties.baseUrl());
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return properties.apiKey() != null && !properties.apiKey().isBlank();
    }

    /** The Claude model AI actions run on (from {@code app.anthropic.model}). */
    public String model() {
        return properties.model();
    }

    /**
     * Streams a Claude reply. Each text delta goes to {@code onToken}; the full
     * assembled text is returned for persistence.
     */
    public String streamMessage(String systemPrompt, String userPrompt, Consumer<String> onToken) {
        if (!isConfigured()) {
            throw new AppException(HttpStatus.BAD_REQUEST,
                    "Anthropic API key not configured — set ANTHROPIC_API_KEY to use the Claude provider.");
        }
        Map<String, Object> body = Map.of(
                "model", properties.model(),
                "max_tokens", MAX_TOKENS,
                "system", systemPrompt,
                "messages", List.of(Map.of("role", "user", "content", userPrompt)),
                "stream", true);

        long start = System.currentTimeMillis();
        log.info("Streaming Anthropic completion: model={}", properties.model());
        String result = restClient.post()
                .uri("/v1/messages")
                .header("x-api-key", properties.apiKey())
                .header("anthropic-version", ANTHROPIC_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> {
                    if (!response.getStatusCode().is2xxSuccessful()) {
                        String error = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                        throw new AppException(HttpStatus.BAD_GATEWAY,
                                "Anthropic API error (" + response.getStatusCode().value() + "): "
                                        + extractErrorMessage(error));
                    }
                    return readSseStream(response.getBody(), onToken);
                });
        log.info("Streamed Anthropic completion: model={} chars={} ({}ms)",
                properties.model(), result.length(), System.currentTimeMillis() - start);
        return result;
    }

    /** Reads the Messages API SSE stream, forwarding {@code text_delta} tokens. */
    private String readSseStream(java.io.InputStream inputStream, Consumer<String> onToken)
            throws java.io.IOException {
        StringBuilder full = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) {
                    continue;
                }
                JsonNode event = objectMapper.readTree(line.substring(5).trim());
                switch (event.path("type").asText()) {
                    case "content_block_delta" -> {
                        JsonNode delta = event.path("delta");
                        if ("text_delta".equals(delta.path("type").asText())) {
                            String text = delta.path("text").asText();
                            if (!text.isEmpty()) {
                                full.append(text);
                                onToken.accept(text);
                            }
                        }
                    }
                    case "message_delta" -> {
                        // safety classifiers can decline mid-stream — surface it instead of saving a stump
                        if ("refusal".equals(event.path("delta").path("stop_reason").asText())) {
                            throw new AppException(HttpStatus.BAD_GATEWAY, "Claude declined this request.");
                        }
                    }
                    case "error" -> throw new AppException(HttpStatus.BAD_GATEWAY,
                            "Anthropic API error: " + event.path("error").path("message").asText("unknown"));
                    default -> {
                        // message_start / content_block_start / ping / message_stop — nothing to do
                    }
                }
            }
        }
        return full.toString();
    }

    /** Pulls {@code error.message} out of a non-2xx JSON body, falling back to the raw text. */
    private String extractErrorMessage(String body) {
        try {
            JsonNode node = objectMapper.readTree(body);
            String message = node.path("error").path("message").asText();
            return message.isEmpty() ? body : message;
        } catch (java.io.IOException ex) {
            return body;
        }
    }
}
