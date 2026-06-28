package com.proprofessor.server.chat.provider;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.JsonValue;
import com.openai.core.http.StreamResponse;
import com.openai.models.chat.completions.ChatCompletionChunk;
import com.openai.models.chat.completions.ChatCompletionContentPart;
import com.openai.models.chat.completions.ChatCompletionContentPartImage;
import com.openai.models.chat.completions.ChatCompletionContentPartInputAudio;
import com.openai.models.chat.completions.ChatCompletionContentPartText;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import com.openai.models.chat.completions.ChatCompletionStreamOptions;
import com.openai.models.completions.CompletionUsage;
import com.proprofessor.server.chat.InferenceOptions;
import com.proprofessor.server.chat.provider.dto.ChatMessage;
import com.proprofessor.server.common.http.CorrelationIdInterceptor;
import com.proprofessor.server.common.web.RequestIdFilter;
import com.proprofessor.server.config.properties.AppProperties;
import com.proprofessor.server.model.dto.ModelProvider;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
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
     * <p>Answer tokens go to {@code onAnswer} and are assembled into the returned string for
     * persistence. Reasoning tokens (Ollama's non-standard {@code delta.reasoning}; the AI
     * service exposes the same field once it normalizes reasoning) go to {@code onThinking} and
     * are <em>not</em> persisted. When {@link InferenceOptions#verbose()} is set, the final
     * token/timing metrics are delivered once to {@code onMetrics}.
     *
     * @param provider   which backend owns the model
     * @param model      provider model id
     * @param messages   full conversation history (oldest first)
     * @param options    per-request inference settings
     * @param onAnswer   called once per streamed answer token
     * @param onThinking called once per streamed reasoning token
     * @param onMetrics  called once with the final metrics (counts always; timing only when verbose)
     * @return the complete assembled assistant answer (reasoning excluded)
     */
    public String streamChat(
            ModelProvider provider,
            String model,
            List<ChatMessage> messages,
            InferenceOptions options,
            Consumer<String> onAnswer,
            Consumer<String> onThinking,
            Consumer<StreamMetrics> onMetrics
    ) {
        ChatCompletionCreateParams.Builder params = ChatCompletionCreateParams.builder().model(model);
        for (ChatMessage message : messages) {
            appendMessage(params, message);
        }
        applyOptions(params, options);

        // The OpenAI SDK client is built outside HttpClientFactory, so it bypasses the
        // RestClient CorrelationIdInterceptor; forward the correlation id here instead.
        String correlationId = MDC.get(RequestIdFilter.MDC_KEY);
        if (correlationId != null && !correlationId.isBlank()) {
            params.putAdditionalHeader(CorrelationIdInterceptor.HEADER, correlationId);
        }

        StringBuilder full = new StringBuilder();
        AtomicReference<StreamMetrics> lastMetrics = new AtomicReference<>();
        // Wall-clock markers for providers that report counts only (Ollama): time-to-first-token
        // approximates prompt eval, and first→last token approximates generation. Accurate on the
        // local network this runs over; on a cold turn time-to-first-token also includes the model
        // load (Ollama's OpenAI endpoint reports no separate load_duration).
        AtomicLong firstTokenNanos = new AtomicLong(0);
        AtomicLong lastTokenNanos = new AtomicLong(0);
        long startNanos = System.nanoTime();
        try (StreamResponse<ChatCompletionChunk> stream =
                     clients.get(provider).chat().completions().createStreaming(params.build())) {
            stream.stream().forEach(chunk -> {
                for (ChatCompletionChunk.Choice choice : chunk.choices()) {
                    ChatCompletionChunk.Choice.Delta delta = choice.delta();
                    delta.content().ifPresent(token -> {
                        if (!token.isEmpty()) {
                            long now = System.nanoTime();
                            firstTokenNanos.compareAndSet(0, now);
                            lastTokenNanos.set(now);
                            full.append(token);
                            onAnswer.accept(token);
                        }
                    });
                    extractReasoning(delta).ifPresent(token -> {
                        if (!token.isEmpty()) {
                            onThinking.accept(token);
                        }
                    });
                }
                // Always collect token counts (every turn carries a usage chunk) so context
                // accounting works without verbose. Counts (usage) and timing (x_metrics) can
                // arrive on separate chunks, so merge, keeping each field's first non-null value.
                StreamMetrics partial = extractMetrics(chunk);
                if (partial != null) {
                    lastMetrics.updateAndGet(prev -> mergeMetrics(prev, partial));
                }
            });
        }
        StreamMetrics metrics = lastMetrics.get();
        if (metrics != null) {
            // Only fill timing when verbose: a counts-only result means the provider didn't report
            // it (Ollama's OpenAI-compatible endpoint), so synthesize from our measurements.
            // Non-verbose turns keep counts only.
            if (options.verbose() && metrics.totalDurationS() == null) {
                metrics = withMeasuredTimings(
                        metrics, startNanos, firstTokenNanos.get(), lastTokenNanos.get());
            }
            onMetrics.accept(metrics);
        }
        return full.toString();
    }

    /**
     * Fills a counts-only {@link StreamMetrics} with timing derived from wall-clock markers, computing
     * the rates. A field is left {@code null} when its inputs are missing (e.g. an empty reply yields
     * no token timestamps). {@code load_duration} is always {@code null} here — Ollama's
     * OpenAI-compatible endpoint doesn't report it and we no longer preload to obtain it.
     */
    private static StreamMetrics withMeasuredTimings(
            StreamMetrics base, long startNanos, long firstTokenNanos, long lastTokenNanos) {
        double totalDurationS = (System.nanoTime() - startNanos) / 1_000_000_000.0;
        Double promptEvalDurationS = firstTokenNanos > 0
                ? (firstTokenNanos - startNanos) / 1_000_000_000.0 : null;
        Double evalDurationS = (firstTokenNanos > 0 && lastTokenNanos > firstTokenNanos)
                ? (lastTokenNanos - firstTokenNanos) / 1_000_000_000.0 : null;
        return new StreamMetrics(
                base.promptTokens(), base.completionTokens(), base.totalTokens(),
                rate(base.completionTokens(), evalDurationS), totalDurationS, null,
                promptEvalDurationS, rate(base.promptTokens(), promptEvalDurationS), evalDurationS);
    }

    /** Tokens-per-second, or {@code null} when the count or duration is missing/zero. */
    private static Double rate(Long count, Double durationS) {
        if (count == null || durationS == null || durationS <= 0) {
            return null;
        }
        return count / durationS;
    }

    /**
     * Merges two partial metrics, keeping each field's first non-null value ({@code prev} wins).
     * Lets a counts-only usage chunk and a timing-bearing x_metrics chunk combine across the stream
     * without either clobbering the other.
     */
    private static StreamMetrics mergeMetrics(StreamMetrics prev, StreamMetrics next) {
        if (prev == null) {
            return next;
        }
        return new StreamMetrics(
                firstNonNull(prev.promptTokens(), next.promptTokens()),
                firstNonNull(prev.completionTokens(), next.completionTokens()),
                firstNonNull(prev.totalTokens(), next.totalTokens()),
                firstNonNull(prev.evalRate(), next.evalRate()),
                firstNonNull(prev.totalDurationS(), next.totalDurationS()),
                firstNonNull(prev.loadDurationS(), next.loadDurationS()),
                firstNonNull(prev.promptEvalDurationS(), next.promptEvalDurationS()),
                firstNonNull(prev.promptEvalRate(), next.promptEvalRate()),
                firstNonNull(prev.evalDurationS(), next.evalDurationS()));
    }

    private static <T> T firstNonNull(T a, T b) {
        return a != null ? a : b;
    }

    /** Sets the per-request inference params on the builder, skipping nulls. */
    private static void applyOptions(ChatCompletionCreateParams.Builder params, InferenceOptions options) {
        if (options.maxTokens() != null) {
            params.maxCompletionTokens(options.maxTokens().longValue());
        }
        if (options.temperature() != null) {
            params.temperature(options.temperature());
        }
        if (options.topP() != null) {
            params.topP(options.topP());
        }
        // repetition_penalty is not a standard OpenAI field — send it as an extra body property.
        if (options.repetitionPenalty() != null) {
            params.putAdditionalBodyProperty("repetition_penalty", JsonValue.from(options.repetitionPenalty()));
        }
        // Always request token counts (usage) so context accounting works on every turn; both
        // providers emit a standard usage chunk when asked. verbose=true additionally requests the
        // provider's richer x_metrics timing block.
        params.streamOptions(ChatCompletionStreamOptions.builder().includeUsage(true).build());
        if (options.verbose()) {
            params.putAdditionalBodyProperty("verbose", JsonValue.from(true));
        }
    }

    /** Reads the non-standard {@code reasoning} delta field, if present. */
    private static Optional<String> extractReasoning(ChatCompletionChunk.Choice.Delta delta) {
        JsonValue value = delta._additionalProperties().get("reasoning");
        if (value == null) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(value.convert(String.class));
        } catch (RuntimeException ex) {
            return Optional.empty();
        }
    }

    /**
     * Combines standard {@code usage} (token counts) with the AI service's non-standard
     * {@code x_metrics} (counts + timing) from a chunk. Returns {@code null} when neither is present.
     */
    private static StreamMetrics extractMetrics(ChatCompletionChunk chunk) {
        Long promptTokens = null;
        Long completionTokens = null;
        Long totalTokens = null;
        Double evalRate = null;
        Double totalDurationS = null;
        Double loadDurationS = null;
        Double promptEvalDurationS = null;
        Double promptEvalRate = null;
        Double evalDurationS = null;

        if (chunk.usage().isPresent()) {
            CompletionUsage usage = chunk.usage().get();
            promptTokens = usage.promptTokens();
            completionTokens = usage.completionTokens();
            totalTokens = usage.totalTokens();
        }

        JsonValue xMetrics = chunk._additionalProperties().get("x_metrics");
        if (xMetrics != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> metrics = xMetrics.convert(Map.class);
                if (metrics != null) {
                    Long promptEval = asLong(metrics.get("prompt_eval_count"));
                    Long evalCount = asLong(metrics.get("eval_count"));
                    if (promptEval != null) {
                        promptTokens = promptEval;
                    }
                    if (evalCount != null) {
                        completionTokens = evalCount;
                    }
                    if (promptEval != null && evalCount != null) {
                        totalTokens = promptEval + evalCount;
                    }
                    evalRate = asDouble(metrics.get("eval_rate"));
                    totalDurationS = asDouble(metrics.get("total_duration_s"));
                    loadDurationS = asDouble(metrics.get("load_duration_s"));
                    promptEvalDurationS = asDouble(metrics.get("prompt_eval_duration_s"));
                    promptEvalRate = asDouble(metrics.get("prompt_eval_rate"));
                    evalDurationS = asDouble(metrics.get("eval_duration_s"));
                }
            } catch (RuntimeException ignored) {
                // best-effort: leave whatever standard usage gave us
            }
        }

        if (promptTokens == null && completionTokens == null && totalTokens == null
                && evalRate == null && totalDurationS == null && loadDurationS == null
                && promptEvalDurationS == null && promptEvalRate == null && evalDurationS == null) {
            return null;
        }
        return new StreamMetrics(promptTokens, completionTokens, totalTokens, evalRate,
                totalDurationS, loadDurationS, promptEvalDurationS, promptEvalRate, evalDurationS);
    }

    private static Long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private static Double asDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    /** Final token/timing metrics for a streamed reply. Timing fields may be {@code null}. */
    public record StreamMetrics(
            Long promptTokens,
            Long completionTokens,
            Long totalTokens,
            Double evalRate,
            Double totalDurationS,
            Double loadDurationS,
            Double promptEvalDurationS,
            Double promptEvalRate,
            Double evalDurationS
    ) {
    }

    private static void appendMessage(ChatCompletionCreateParams.Builder params, ChatMessage message) {
        String content = message.content();
        switch (message.role()) {
            case "system" -> params.addSystemMessage(content);
            case "assistant" -> params.addAssistantMessage(content);
            default -> appendUserMessage(params, message);
        }
    }

    /**
     * Adds a user turn. Text-only turns go through the plain string overload; a turn
     * carrying images and/or audio becomes a multimodal message with one {@code image_url}
     * part per image and one {@code input_audio} part per clip (plus a text part when
     * there's also typed text).
     */
    private static void appendUserMessage(ChatCompletionCreateParams.Builder params, ChatMessage message) {
        List<ChatMessage.AudioPart> audio = message.audio();
        List<ChatMessage.ImagePart> images = message.images();
        boolean hasAudio = audio != null && !audio.isEmpty();
        boolean hasImages = images != null && !images.isEmpty();
        if (!hasAudio && !hasImages) {
            params.addUserMessage(message.content());
            return;
        }

        List<ChatCompletionContentPart> parts = new ArrayList<>();
        String text = message.content();
        if (text != null && !text.isBlank()) {
            parts.add(ChatCompletionContentPart.ofText(
                    ChatCompletionContentPartText.builder().text(text).build()));
        }
        for (ChatMessage.ImagePart image : images) {
            parts.add(ChatCompletionContentPart.ofImageUrl(
                    ChatCompletionContentPartImage.builder()
                            .imageUrl(ChatCompletionContentPartImage.ImageUrl.builder()
                                    .url(image.dataUrl())
                                    .build())
                            .build()));
        }
        for (ChatMessage.AudioPart clip : audio) {
            parts.add(ChatCompletionContentPart.ofInputAudio(
                    ChatCompletionContentPartInputAudio.builder()
                            .inputAudio(ChatCompletionContentPartInputAudio.InputAudio.builder()
                                    .data(clip.base64Data())
                                    .format(ChatCompletionContentPartInputAudio.InputAudio.Format.of(clip.format()))
                                    .build())
                            .build()));
        }
        params.addUserMessageOfArrayOfContentParts(parts);
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
