package com.proprofessor.server.chat.provider.dto;

import java.util.List;

/**
 * A single chat message in the OpenAI shape, used to carry conversation history
 * (oldest first) from the chat service to the provider client.
 *
 * @param role    one of {@code system}, {@code user}, {@code assistant}
 * @param content the message text
 * @param audio   optional spoken-input clips forwarded as OpenAI {@code input_audio}
 *                content parts; empty for text-only turns (all history replay)
 * @param images  optional images forwarded as OpenAI {@code image_url} content parts;
 *                empty for text-only turns (all history replay)
 */
public record ChatMessage(
        String role,
        String content,
        List<AudioPart> audio,
        List<ImagePart> images
) {
    /** Text-only message — the common case for history replay and assistant/system turns. */
    public ChatMessage(String role, String content) {
        this(role, content, List.of(), List.of());
    }

    /** Audio-carrying user turn (no images). */
    public ChatMessage(String role, String content, List<AudioPart> audio) {
        this(role, content, audio, List.of());
    }

    /**
     * One audio clip in OpenAI {@code input_audio} shape.
     *
     * @param base64Data base64-encoded audio bytes
     * @param format     container format hint the model decodes by (e.g. {@code wav})
     */
    public record AudioPart(String base64Data, String format) {
    }

    /**
     * One image in OpenAI {@code image_url} shape, carried as a base64 data URL
     * ({@code data:<mime>;base64,<bytes>}) so it is provider-agnostic (Ollama + ai-service).
     *
     * @param dataUrl the {@code data:} URL the provider decodes the image from
     */
    public record ImagePart(String dataUrl) {
    }
}
