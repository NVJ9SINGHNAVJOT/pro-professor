package com.proprofessor.server.media;

import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.db.tables.records.MediaRecord;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.MEDIA;
import static com.proprofessor.server.db.Tables.MESSAGE_ATTACHMENTS;

@Repository
public class MediaRepository {

    private final DSLContext dsl;

    public MediaRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public MediaRow insert(String storageId, String originalFilename, String mimeType, long size, String category) {
        return dsl.insertInto(MEDIA)
                .set(MEDIA.STORAGE_ID, storageId)
                .set(MEDIA.ORIGINAL_FILENAME, originalFilename)
                .set(MEDIA.MIME_TYPE, mimeType)
                .set(MEDIA.SIZE, size)
                .set(MEDIA.CATEGORY, category)
                .returning()
                .fetchOne(this::toRow);
    }

    public Optional<MediaRow> findById(long id) {
        return dsl.selectFrom(MEDIA)
                .where(MEDIA.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    public List<MediaRow> findByIds(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return dsl.selectFrom(MEDIA)
                .where(MEDIA.ID.in(ids))
                .fetch(this::toRow);
    }

    /** Links an already-stored media to a message. */
    public void linkToMessage(long messageId, long mediaId) {
        dsl.insertInto(MESSAGE_ATTACHMENTS)
                .set(MESSAGE_ATTACHMENTS.MESSAGE_ID, messageId)
                .set(MESSAGE_ATTACHMENTS.MEDIA_ID, mediaId)
                .onConflictDoNothing()
                .execute();
    }

    /** Fetches attachments for many messages at once, grouped by message id. */
    public Map<Long, List<MediaRow>> findByMessageIds(Collection<Long> messageIds) {
        if (messageIds.isEmpty()) {
            return Map.of();
        }
        return dsl.select(MESSAGE_ATTACHMENTS.MESSAGE_ID)
                .select(MEDIA.fields())
                .from(MESSAGE_ATTACHMENTS)
                .join(MEDIA).on(MEDIA.ID.eq(MESSAGE_ATTACHMENTS.MEDIA_ID))
                .where(MESSAGE_ATTACHMENTS.MESSAGE_ID.in(messageIds))
                .orderBy(MEDIA.CREATED_AT.asc())
                .fetchGroups(
                        r -> r.get(MESSAGE_ATTACHMENTS.MESSAGE_ID),
                        this::toRow
                );
    }

    private MediaRow toRow(Record r) {
        return new MediaRow(
                r.get(MEDIA.ID),
                r.get(MEDIA.STORAGE_ID),
                r.get(MEDIA.ORIGINAL_FILENAME),
                r.get(MEDIA.MIME_TYPE),
                r.get(MEDIA.SIZE),
                r.get(MEDIA.CATEGORY),
                r.get(MEDIA.CREATED_AT).toInstant(),
                r.get(MEDIA.UPDATED_AT).toInstant()
        );
    }

    private MediaRow toRow(MediaRecord r) {
        return new MediaRow(
                r.getId(),
                r.getStorageId(),
                r.getOriginalFilename(),
                r.getMimeType(),
                r.getSize(),
                r.getCategory(),
                r.getCreatedAt().toInstant(),
                r.getUpdatedAt().toInstant()
        );
    }
}
