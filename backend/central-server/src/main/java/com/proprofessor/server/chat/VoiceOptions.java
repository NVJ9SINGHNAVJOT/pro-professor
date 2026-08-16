package com.proprofessor.server.chat;

import com.proprofessor.server.common.db.VoiceSettings;

/**
 * Per-request voice settings, as they arrive from the client. Every field is nullable; a
 * {@code null} means "use the stored defaults" — which is how the note chat panel sends every turn.
 * {@code ChatService.withVoiceDefaults} fills the gaps, after which {@link #toSettings()} yields
 * the concrete {@link VoiceSettings} persisted on the conversation.
 *
 * <p>Unlike {@link InferenceOptions} these never reach the provider: the client applies them when
 * calling the audio endpoints, and the server reads only {@code sttModel}, for the STT fallback on
 * an audio turn.
 *
 * @param sttModel         STT repo id to transcribe this chat's speech with
 * @param preferModelAudio whether an audio-capable model hears the clip itself instead
 * @param ttsVoice         Kokoro voice replies are spoken in
 * @param ttsLangCode      Kokoro language code
 * @param ttsSpeed         playback speed multiplier
 */
public record VoiceOptions(
        String sttModel,
        Boolean preferModelAudio,
        String ttsVoice,
        String ttsLangCode,
        Double ttsSpeed
) {
    public static final VoiceOptions DEFAULTS = new VoiceOptions(null, null, null, null, null);

    /** The resolved settings. Only valid after {@code withVoiceDefaults} has filled every field. */
    public VoiceSettings toSettings() {
        return new VoiceSettings(sttModel, preferModelAudio, ttsVoice, ttsLangCode, ttsSpeed);
    }
}
