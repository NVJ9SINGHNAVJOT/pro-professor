package com.proprofessor.server.chat.repository;

import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.ConversationSettings;
import com.proprofessor.server.common.db.ModelRow;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.CONVERSATIONS;
import static com.proprofessor.server.db.Tables.MODELS;

@Repository
public class ConversationRepository {

    private final DSLContext dsl;

    public ConversationRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public List<ConversationRow> findAll() {
        return dsl.select()
                .from(CONVERSATIONS)
                .join(MODELS).on(CONVERSATIONS.MODEL_ID.eq(MODELS.ID))
                .orderBy(CONVERSATIONS.UPDATED_AT.desc())
                .fetch(this::toRow);
    }

    public Optional<ConversationRow> findById(long id) {
        return dsl.select()
                .from(CONVERSATIONS)
                .join(MODELS).on(CONVERSATIONS.MODEL_ID.eq(MODELS.ID))
                .where(CONVERSATIONS.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    public ConversationRow insert(long modelId, String title, String mode, ConversationSettings settings) {
        Long id = dsl.insertInto(CONVERSATIONS)
                .set(CONVERSATIONS.MODEL_ID, modelId)
                .set(CONVERSATIONS.TITLE, title)
                .set(CONVERSATIONS.MODE, mode)
                .set(CONVERSATIONS.MAX_TOKENS, settings.maxTokens())
                .set(CONVERSATIONS.TEMPERATURE, settings.temperature())
                .set(CONVERSATIONS.TOP_P, settings.topP())
                .set(CONVERSATIONS.REPETITION_PENALTY, settings.repetitionPenalty())
                .set(CONVERSATIONS.VERBOSE_ENABLED, settings.verbose())
                .set(CONVERSATIONS.THINKING_ENABLED, settings.thinkingEnabled())
                .returning(CONVERSATIONS.ID)
                .fetchOne(CONVERSATIONS.ID);
        return findById(id).orElseThrow();
    }

    /** Sets a conversation's title — used to backfill a voice-started chat from its first transcript. */
    public void updateTitle(long id, String title) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.TITLE, title)
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    /** Records the conversation's context usage (tokens) after a turn, for the context meter. */
    public void updateLastContextTokens(long id, int tokens) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.LAST_CONTEXT_TOKENS, tokens)
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    /** Overwrites a conversation's inference settings — used when the user changes them mid-chat. */
    public void updateSettings(long id, ConversationSettings settings) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.MAX_TOKENS, settings.maxTokens())
                .set(CONVERSATIONS.TEMPERATURE, settings.temperature())
                .set(CONVERSATIONS.TOP_P, settings.topP())
                .set(CONVERSATIONS.REPETITION_PENALTY, settings.repetitionPenalty())
                .set(CONVERSATIONS.VERBOSE_ENABLED, settings.verbose())
                .set(CONVERSATIONS.THINKING_ENABLED, settings.thinkingEnabled())
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    public boolean existsById(long id) {
        return dsl.fetchExists(CONVERSATIONS, CONVERSATIONS.ID.eq(id));
    }

    public void deleteById(long id) {
        dsl.deleteFrom(CONVERSATIONS).where(CONVERSATIONS.ID.eq(id)).execute();
    }

    private ConversationRow toRow(Record r) {
        ModelRow model = new ModelRow(
                r.get(MODELS.ID),
                r.get(MODELS.NAME),
                r.get(MODELS.PROVIDER),
                r.get(MODELS.ROLE),
                r.get(MODELS.VERSION),
                r.get(MODELS.IS_ACTIVE),
                r.get(MODELS.CREATED_AT).toInstant(),
                r.get(MODELS.UPDATED_AT).toInstant()
        );
        ConversationSettings settings = new ConversationSettings(
                r.get(CONVERSATIONS.MAX_TOKENS),
                r.get(CONVERSATIONS.TEMPERATURE),
                r.get(CONVERSATIONS.TOP_P),
                r.get(CONVERSATIONS.REPETITION_PENALTY),
                Boolean.TRUE.equals(r.get(CONVERSATIONS.VERBOSE_ENABLED)),
                Boolean.TRUE.equals(r.get(CONVERSATIONS.THINKING_ENABLED))
        );
        return new ConversationRow(
                r.get(CONVERSATIONS.ID),
                model,
                r.get(CONVERSATIONS.TITLE),
                r.get(CONVERSATIONS.MODE),
                settings,
                r.get(CONVERSATIONS.LAST_CONTEXT_TOKENS),
                r.get(CONVERSATIONS.CREATED_AT).toInstant(),
                r.get(CONVERSATIONS.UPDATED_AT).toInstant()
        );
    }
}
