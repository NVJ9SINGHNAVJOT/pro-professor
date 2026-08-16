package com.proprofessor.server.audio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/v1/audio/speech}.
 *
 * <p>{@code null} fields are omitted when {@link com.proprofessor.server.audio.AudioClient}
 * forwards the request, so the AI core applies its own defaults (default voice and language,
 * speed 1.0).
 *
 * @param input    the text to synthesize (required)
 * @param voice    optional voice id (e.g. {@code af_heart}); AI-core default when null
 * @param langCode optional Kokoro language code (e.g. {@code a}); AI-core default when null
 * @param speed    optional playback speed multiplier; AI-core default when null
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SpeechRequest(
        @NotBlank String input,
        String voice,
        String langCode,
        Double speed
) {
}
