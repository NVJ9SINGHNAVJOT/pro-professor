package com.proprofessor.server.audio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/v1/audio/speech}.
 *
 * <p>Forwarded as-is to the AI service's OpenAI-compatible {@code /v1/audio/speech}.
 * {@code null} fields are omitted so the AI service applies its own defaults
 * (default voice, speed 1.0).
 *
 * @param input the text to synthesize (required)
 * @param voice optional voice id (e.g. {@code af_heart}); AI-service default when null
 * @param speed optional playback speed multiplier; AI-service default when null
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SpeechRequest(
        @NotBlank String input,
        String voice,
        Double speed
) {
}
