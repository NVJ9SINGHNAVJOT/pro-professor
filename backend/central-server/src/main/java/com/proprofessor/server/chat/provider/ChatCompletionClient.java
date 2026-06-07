package com.proprofessor.server.chat.provider;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.http.StreamResponse;
import com.openai.models.chat.completions.ChatCompletionChunk;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.proprofessor.server.chat.provider.dto.ChatMessage;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Streams a chat completion from whichever provider owns the model.
 *
 * <p>Both Ollama and the AI service expose the OpenAI-compatible
 * {@code POST /v1/chat/completions} with SSE streaming, so we drive both through the
 * official OpenAI Java SDK and only switch the base URL by {@link ModelProvider}. The
 * SDK owns the request/response content types and SSE parsing, which avoids the
 * hand-rolled stream handling. It hands each token to {@code onToken} and returns the
 * full assembled reply for persistence.
 */
@Component
public class ChatCompletionClient {

    private final Map<ModelProvider, OpenAIClient> clients;

    public ChatCompletionClient(AppProperties appProperties) {
        this.clients = Map.of(
                ModelProvider.OLLAMA,
                buildClient(appProperties.ollama().baseUrl(), appProperties.ollama().apiKey()),
                ModelProvider.AI_SERVICE,
                buildClient(appProperties.aiService().baseUrl(), appProperties.aiService().apiKey())
        );
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
            List<ChatMessage> messages,
            Consumer<String> onToken
    ) {
        ChatCompletionCreateParams.Builder params = ChatCompletionCreateParams.builder().model(model);
        for (ChatMessage message : messages) {
            appendMessage(params, message);
        }

        StringBuilder full = new StringBuilder();
        try (StreamResponse<ChatCompletionChunk> stream =
                     clients.get(provider).chat().completions().createStreaming(params.build())) {
            stream.stream().forEach(chunk -> {
                for (ChatCompletionChunk.Choice choice : chunk.choices()) {
                    choice.delta().content().ifPresent(token -> {
                        if (!token.isEmpty()) {
                            full.append(token);
                            onToken.accept(token);
                        }
                    });
                }
            });
        }
        return full.toString();
    }

    private static void appendMessage(ChatCompletionCreateParams.Builder params, ChatMessage message) {
        String content = message.content();
        switch (message.role()) {
            case "system" -> params.addSystemMessage(content);
            case "assistant" -> params.addAssistantMessage(content);
            default -> params.addUserMessage(content);
        }
    }

    private static OpenAIClient buildClient(String baseUrl, String apiKey) {
        return OpenAIOkHttpClient.builder()
                .baseUrl(stripTrailingSlash(baseUrl) + "/v1")
                .apiKey(apiKey)
                .build();
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
