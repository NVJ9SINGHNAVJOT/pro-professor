package com.proprofessor.server.common.db;

/**
 * One set of voice settings: how speech is captured and how a reply is spoken. Stored twice — as
 * the app-wide defaults in {@code app_settings} and as each conversation's current values in
 * {@code conversations}, which start from those defaults and can be changed per chat.
 *
 * <p>Deliberately separate from {@link ConversationSettings}: these are capture/playback
 * preferences the client applies when calling the audio endpoints, not sampling params forwarded
 * to the provider, so a change to them is not a {@code settings} marker on the thread.
 *
 * @param sttModel         HuggingFace repo id from {@code GET /api/v1/audio/models}
 * @param preferModelAudio when {@code true}, a chat model that accepts audio hears the clip itself
 *                         and the STT pass is skipped; when {@code false}, speech is always
 *                         transcribed with {@code sttModel} first
 * @param ttsVoice         Kokoro voice id (e.g. {@code af_heart})
 * @param ttsLangCode      Kokoro language code (e.g. {@code a} = American English)
 * @param ttsSpeed         playback speed multiplier
 */
public record VoiceSettings(
        String sttModel,
        boolean preferModelAudio,
        String ttsVoice,
        String ttsLangCode,
        double ttsSpeed
) {
}
