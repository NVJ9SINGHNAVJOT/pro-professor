package com.proprofessor.server.media;

import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.db.tables.records.MediaRecord;
import com.proprofessor.server.notes.LinkParser;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static com.proprofessor.server.db.Tables.MEDIA;
import static com.proprofessor.server.db.Tables.MESSAGE_ATTACHMENTS;
import static com.proprofessor.server.db.Tables.NOTES;
import static com.proprofessor.server.db.Tables.NOTE_LINKS;

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

    /** The reference row for a storage-server UUID, if this file was uploaded through us. */
    public Optional<MediaRow> findByStorageId(String storageId) {
        return dsl.selectFrom(MEDIA)
                .where(MEDIA.STORAGE_ID.eq(storageId))
                .fetchOptional(this::toRow);
    }

    /** How many chat messages this media is attached to — a delete guard, since the link has no cascade. */
    public int countAttachments(long mediaId) {
        return dsl.fetchCount(MESSAGE_ATTACHMENTS, MESSAGE_ATTACHMENTS.MEDIA_ID.eq(mediaId));
    }

    /**
     * Titles of the notes embedding this filename via {@code ![[file.png]]}, for the delete guard.
     * Reads {@code note_links}, which {@code NotesService.indexRefs} rebuilds on every note save
     * (AI edits and revision restores included), so it never goes stale.
     */
    public List<String> noteTitlesEmbedding(String filename) {
        return dsl.selectDistinct(NOTES.TITLE)
                .from(NOTE_LINKS)
                .join(NOTES).on(NOTES.ID.eq(NOTE_LINKS.SOURCE_NOTE_ID))
                .where(NOTE_LINKS.LINK_TYPE.eq(LinkParser.TYPE_EMBED))
                .and(DSL.lower(NOTE_LINKS.TARGET_REF).eq(filename.toLowerCase(Locale.ROOT)))
                .orderBy(NOTES.TITLE)
                .fetch(NOTES.TITLE);
    }

    /**
     * Where each of these stored files is used, keyed by storage id — the counts behind the
     * Settings → Storage badges. Files with no reference row (uploaded straight to the
     * storage-server) are simply absent from the result.
     *
     * <p>Note usage is credited only to the upload an embed actually resolves to (the newest with
     * that filename, matching {@link #findLatestByFilename}), so re-uploading {@code image.png}
     * leaves the superseded copy free to delete.
     */
    public Map<String, Usage> usageByStorageIds(Collection<String> storageIds) {
        if (storageIds.isEmpty()) {
            return Map.of();
        }
        List<MediaRow> rows = dsl.selectFrom(MEDIA)
                .where(MEDIA.STORAGE_ID.in(storageIds))
                .fetch(this::toRow);
        if (rows.isEmpty()) {
            return Map.of();
        }

        Map<Long, Integer> attachmentCounts = dsl
                .select(MESSAGE_ATTACHMENTS.MEDIA_ID, DSL.count())
                .from(MESSAGE_ATTACHMENTS)
                .where(MESSAGE_ATTACHMENTS.MEDIA_ID.in(rows.stream().map(MediaRow::id).toList()))
                .groupBy(MESSAGE_ATTACHMENTS.MEDIA_ID)
                .fetchMap(MESSAGE_ATTACHMENTS.MEDIA_ID, DSL.count());

        Set<String> filenames = rows.stream()
                .map(row -> row.originalFilename().toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());

        // the media id each ![[filename]] embed resolves to — newest upload wins
        Map<String, Long> embedTargets = dsl
                .select(DSL.lower(MEDIA.ORIGINAL_FILENAME), MEDIA.ID)
                .distinctOn(DSL.lower(MEDIA.ORIGINAL_FILENAME))
                .from(MEDIA)
                .where(DSL.lower(MEDIA.ORIGINAL_FILENAME).in(filenames))
                .orderBy(DSL.lower(MEDIA.ORIGINAL_FILENAME), MEDIA.CREATED_AT.desc())
                .fetchMap(DSL.lower(MEDIA.ORIGINAL_FILENAME), MEDIA.ID);

        Map<String, Integer> noteCounts = dsl
                .select(DSL.lower(NOTE_LINKS.TARGET_REF), DSL.countDistinct(NOTE_LINKS.SOURCE_NOTE_ID))
                .from(NOTE_LINKS)
                .where(NOTE_LINKS.LINK_TYPE.eq(LinkParser.TYPE_EMBED))
                .and(DSL.lower(NOTE_LINKS.TARGET_REF).in(filenames))
                .groupBy(DSL.lower(NOTE_LINKS.TARGET_REF))
                .fetchMap(DSL.lower(NOTE_LINKS.TARGET_REF), DSL.countDistinct(NOTE_LINKS.SOURCE_NOTE_ID));

        Map<String, Usage> usage = new HashMap<>();
        for (MediaRow row : rows) {
            String filename = row.originalFilename().toLowerCase(Locale.ROOT);
            boolean backsTheEmbed = Objects.equals(embedTargets.get(filename), row.id());
            usage.put(row.storageId(), new Usage(
                    attachmentCounts.getOrDefault(row.id(), 0),
                    backsTheEmbed ? noteCounts.getOrDefault(filename, 0) : 0));
        }
        return usage;
    }

    /** How many chat messages and notes reference one stored file. */
    public record Usage(int chatMessages, int notes) {
    }

    public void deleteById(long id) {
        dsl.deleteFrom(MEDIA)
                .where(MEDIA.ID.eq(id))
                .execute();
    }

    /** Newest media with the given original filename — resolves note {@code ![[image.png]]} embeds. */
    public Optional<MediaRow> findLatestByFilename(String filename) {
        return dsl.selectFrom(MEDIA)
                .where(MEDIA.ORIGINAL_FILENAME.equalIgnoreCase(filename))
                .orderBy(MEDIA.CREATED_AT.desc())
                .limit(1)
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
