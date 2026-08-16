package com.proprofessor.server.audio.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;

/**
 * What the AI core's audio endpoints offer: the selectable STT models and the TTS voices,
 * languages and speed range. Mirrors {@code GET /v1/audio/models}, whose fields are snake_case —
 * {@link JsonAlias} maps those in while the component names are what goes back out, so this app's
 * own responses stay camelCase like every other endpoint.
 *
 * <p>Read-only capability data: the AI core loads nothing to answer it, so the client can fetch it
 * on page load.
 */
public record AudioCapabilities(
        Stt stt,
        Tts tts
) {

    /**
     * @param defaultModel the model used when a transcription request names none
     * @param models       every model a request may select
     */
    public record Stt(
            @JsonAlias("default") String defaultModel,
            List<SttModel> models
    ) {
    }

    /**
     * @param id                  HuggingFace repo id — what a transcription request sends
     * @param backend             loader package ({@code mlx-whisper} or {@code mlx-audio})
     * @param ready               whether the weights are in the AI core's local cache
     * @param loaded              whether this is the currently resident STT model
     * @param acceptsLanguageHint whether a language hint has any effect for this model
     * @param languages           supported languages, or {@code null} when auto-detected
     */
    public record SttModel(
            String id,
            String backend,
            boolean ready,
            boolean loaded,
            @JsonAlias("accepts_language_hint") boolean acceptsLanguageHint,
            List<String> languages
    ) {
    }

    /**
     * @param model           the TTS model (Kokoro)
     * @param ready           whether the weights <em>and</em> voice packs are cached
     * @param loaded          whether the model is currently resident
     * @param defaultVoice    voice used when a speech request names none
     * @param defaultLangCode language code used when a speech request names none
     * @param voices          voice ids available in the local cache
     * @param langCodes       supported language codes with their labels
     * @param speed           accepted playback-speed range
     * @param responseFormats supported output containers (only {@code wav} today)
     */
    public record Tts(
            String model,
            boolean ready,
            boolean loaded,
            @JsonAlias("default_voice") String defaultVoice,
            @JsonAlias("default_lang_code") String defaultLangCode,
            List<String> voices,
            @JsonAlias("lang_codes") List<LangCode> langCodes,
            Speed speed,
            @JsonAlias("response_formats") List<String> responseFormats
    ) {
    }

    public record LangCode(String code, String label) {
    }

    /** @param defaultSpeed the multiplier applied when a speech request names none */
    public record Speed(double min, double max, @JsonAlias("default") double defaultSpeed) {
    }
}
