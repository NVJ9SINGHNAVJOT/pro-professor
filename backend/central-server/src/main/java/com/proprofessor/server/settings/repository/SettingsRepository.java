package com.proprofessor.server.settings.repository;

import com.proprofessor.server.common.db.AppSettingsRow;
import com.proprofessor.server.common.db.InferenceDefaults;
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

    public void update(InferenceDefaults notes, InferenceDefaults diagram) {
        dsl.update(APP_SETTINGS)
                .set(APP_SETTINGS.NOTES_MAX_TOKENS, notes.maxTokens())
                .set(APP_SETTINGS.NOTES_TEMPERATURE, notes.temperature())
                .set(APP_SETTINGS.NOTES_TOP_P, notes.topP())
                .set(APP_SETTINGS.NOTES_REPETITION_PENALTY, notes.repetitionPenalty())
                .set(APP_SETTINGS.DIAGRAM_MAX_TOKENS, diagram.maxTokens())
                .set(APP_SETTINGS.DIAGRAM_TEMPERATURE, diagram.temperature())
                .set(APP_SETTINGS.DIAGRAM_TOP_P, diagram.topP())
                .set(APP_SETTINGS.DIAGRAM_REPETITION_PENALTY, diagram.repetitionPenalty())
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
        InferenceDefaults diagram = new InferenceDefaults(
                r.get(APP_SETTINGS.DIAGRAM_MAX_TOKENS),
                r.get(APP_SETTINGS.DIAGRAM_TEMPERATURE),
                r.get(APP_SETTINGS.DIAGRAM_TOP_P),
                r.get(APP_SETTINGS.DIAGRAM_REPETITION_PENALTY)
        );
        return new AppSettingsRow(
                notes,
                diagram,
                r.get(APP_SETTINGS.CREATED_AT).toInstant(),
                r.get(APP_SETTINGS.UPDATED_AT).toInstant()
        );
    }
}
