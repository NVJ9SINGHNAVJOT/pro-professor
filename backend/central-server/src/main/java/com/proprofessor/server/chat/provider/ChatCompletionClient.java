package com.proprofessor.server.chat.provider;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.chat.provider.dto.ChatCompletionChunk;
import com.proprofessor.server.chat.provider.dto.ChatCompletionRequest;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Consumer;

/**
 * Streams a chat completion from whichever provider owns the model.
 *
 * <p>Both Ollama and the AI service speak the OpenAI-compatible
 * {@code POST /v1/chat/completions} with SSE streaming, so this one client handles
 * both — it just switches the base URL by {@link ModelProvider}. It reads the SSE
 * stream line-by-line, hands each token to {@code onToken}, and returns the full
 * assembled reply for persistence.
 */
@Component
public class ChatCompletionClient {

    private static final String CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
    private static final String SSE_DATA_PREFIX = "data:";
    private static final String SSE_DONE = "[DONE]";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String ollamaBaseUrl;
    private final String aiServiceBaseUrl;

    public ChatCompletionClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this.restClient = RestClient.create();
        this.objectMapper = objectMapper;
        this.ollamaBaseUrl = stripTrailingSlash(appProperties.ollama().baseUrl());
        this.aiServiceBaseUrl = stripTrailingSlash(appProperties.aiService().baseUrl());
    }

    /**
     * Streams the model's reply.
     *
     * @param provider which backend owns the model
     * @param model    provider model id
     * @param messages full conversation history (oldest first)
     * @param onToken  called once per streamed token
     * @return the complete assembled assistant reply
     */
    public String streamChat(
            ModelProvider provider,
            String model,
            List<ChatCompletionRequest.Message> messages,
            Consumer<String> onToken
    ) {
        String url = baseUrlFor(provider) + CHAT_COMPLETIONS_PATH;
        ChatCompletionRequest body = new ChatCompletionRequest(model, messages, true);

        return restClient.post()
                .uri(url)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> {
                    if (response.getStatusCode().isError()) {
                        throw new AppException(HttpStatus.BAD_GATEWAY,
                                "Model provider returned " + response.getStatusCode());
                    }
                    return readStream(response.getBody(), onToken);
                });
    }

    private String readStream(java.io.InputStream bodyStream, Consumer<String> onToken) throws java.io.IOException {
        StringBuilder full = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(bodyStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || !line.startsWith(SSE_DATA_PREFIX)) {
                    continue;
                }
                String data = line.substring(SSE_DATA_PREFIX.length()).trim();
                if (data.equals(SSE_DONE)) {
                    break;
                }
                ChatCompletionChunk chunk = objectMapper.readValue(data, ChatCompletionChunk.class);
                String token = chunk.firstContent();
                if (token != null && !token.isEmpty()) {
                    full.append(token);
                    onToken.accept(token);
                }
            }
        }
        return full.toString();
    }

    private String baseUrlFor(ModelProvider provider) {
        return switch (provider) {
            case OLLAMA -> ollamaBaseUrl;
            case AI_SERVICE -> aiServiceBaseUrl;
        };
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
