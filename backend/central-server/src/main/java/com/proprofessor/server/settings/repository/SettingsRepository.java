package com.proprofessor.server.settings.repository;

import com.proprofessor.server.common.db.AppSettingsRow;
import com.proprofessor.server.common.db.InferenceDefaults;
import com.proprofessor.server.common.db.VoiceSettings;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import static com.proprofessor.server.db.Tables.APP_SETTINGS;

/** jOOQ access to the singleton {@code app_settings} row (id = 1). */
@Repository
public class SettingsRepository {

    /** The app_settings table has a single row, pinned by a CHECK (id = 1) constraint. */
    private static final long SINGLETON_ID = 1L;

    private final DSLContext dsl;

    public SettingsRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public AppSettingsRow find() {
        return dsl.select()
                .from(APP_SETTINGS)
                .where(APP_SETTINGS.ID.eq(SINGLETON_ID))
                .fetchOne(this::toRow);
    }

    public void update(InferenceDefaults notes, VoiceSettings chat) {
        dsl.update(APP_SETTINGS)
                .set(APP_SETTINGS.NOTES_MAX_TOKENS, notes.maxTokens())
                .set(APP_SETTINGS.NOTES_TEMPERATURE, notes.temperature())
                .set(APP_SETTINGS.NOTES_TOP_P, notes.topP())
                .set(APP_SETTINGS.NOTES_REPETITION_PENALTY, notes.repetitionPenalty())
                .set(APP_SETTINGS.CHAT_STT_MODEL, chat.sttModel())
                .set(APP_SETTINGS.CHAT_PREFER_MODEL_AUDIO, chat.preferModelAudio())
                .set(APP_SETTINGS.CHAT_TTS_VOICE, chat.ttsVoice())
                .set(APP_SETTINGS.CHAT_TTS_LANG_CODE, chat.ttsLangCode())
                .set(APP_SETTINGS.CHAT_TTS_SPEED, chat.ttsSpeed())
                .where(APP_SETTINGS.ID.eq(SINGLETON_ID))
                .execute();
    }

    private AppSettingsRow toRow(Record r) {
        InferenceDefaults notes = new InferenceDefaults(
                r.get(APP_SETTINGS.NOTES_MAX_TOKENS),
                r.get(APP_SETTINGS.NOTES_TEMPERATURE),
                r.get(APP_SETTINGS.NOTES_TOP_P),
                r.get(APP_SETTINGS.NOTES_REPETITION_PENALTY)
        );
        VoiceSettings chat = new VoiceSettings(
                r.get(APP_SETTINGS.CHAT_STT_MODEL),
                r.get(APP_SETTINGS.CHAT_PREFER_MODEL_AUDIO),
                r.get(APP_SETTINGS.CHAT_TTS_VOICE),
                r.get(APP_SETTINGS.CHAT_TTS_LANG_CODE),
                r.get(APP_SETTINGS.CHAT_TTS_SPEED)
        );
        return new AppSettingsRow(
                notes,
                chat,
                r.get(APP_SETTINGS.CREATED_AT).toInstant(),
                r.get(APP_SETTINGS.UPDATED_AT).toInstant()
        );
    }
}
