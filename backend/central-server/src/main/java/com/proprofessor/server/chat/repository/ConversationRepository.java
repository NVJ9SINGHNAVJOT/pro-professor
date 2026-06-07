package com.proprofessor.server.chat.repository;

import com.proprofessor.server.common.db.ConversationRow;
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

    public ConversationRow insert(long modelId, String title, String mode) {
        Long id = dsl.insertInto(CONVERSATIONS)
                .set(CONVERSATIONS.MODEL_ID, modelId)
                .set(CONVERSATIONS.TITLE, title)
                .set(CONVERSATIONS.MODE, mode)
                .returning(CONVERSATIONS.ID)
                .fetchOne(CONVERSATIONS.ID);
        return findById(id).orElseThrow();
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
        return new ConversationRow(
                r.get(CONVERSATIONS.ID),
                model,
                r.get(CONVERSATIONS.TITLE),
                r.get(CONVERSATIONS.MODE),
                r.get(CONVERSATIONS.CREATED_AT).toInstant(),
                r.get(CONVERSATIONS.UPDATED_AT).toInstant()
        );
    }
}
