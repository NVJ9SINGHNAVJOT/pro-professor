package com.proprofessor.server.chat.repository;

import com.proprofessor.server.common.db.MessageRow;
import com.proprofessor.server.db.tables.records.MessagesRecord;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.util.List;

import static com.proprofessor.server.db.Tables.MESSAGES;

@Repository
public class MessageRepository {

    private final DSLContext dsl;

    public MessageRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public List<MessageRow> findAllByConversationId(long conversationId) {
        return dsl.selectFrom(MESSAGES)
                .where(MESSAGES.CONVERSATION_ID.eq(conversationId))
                .orderBy(MESSAGES.CREATED_AT.asc())
                .fetch(this::toRow);
    }

    public MessageRow insert(long conversationId, String role, String content) {
        return dsl.insertInto(MESSAGES)
                .set(MESSAGES.CONVERSATION_ID, conversationId)
                .set(MESSAGES.ROLE, role)
                .set(MESSAGES.CONTENT, content)
                .returning()
                .fetchOne(this::toRow);
    }

    private MessageRow toRow(MessagesRecord r) {
        return new MessageRow(
                r.getId(),
                r.getConversationId(),
                r.getRole(),
                r.getContent(),
                r.getCreatedAt().toInstant(),
                r.getUpdatedAt().toInstant()
        );
    }
}
