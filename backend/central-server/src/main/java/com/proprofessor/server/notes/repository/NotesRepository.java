package com.proprofessor.server.notes.repository;

import com.proprofessor.server.common.db.NoteRevisionRow;
import com.proprofessor.server.common.db.NoteRow;
import com.proprofessor.server.notes.LinkParser;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.JSONB;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static com.proprofessor.server.db.Tables.NOTES;
import static com.proprofessor.server.db.Tables.NOTE_LINKS;
import static com.proprofessor.server.db.Tables.NOTE_REVISIONS;
import static com.proprofessor.server.db.Tables.NOTE_TAGS;
import static com.proprofessor.server.db.Tables.TAGS;

@Repository
public class NotesRepository {

    private final DSLContext dsl;

    public NotesRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public List<NoteRow> findAll() {
        return dsl.select()
                .from(NOTES)
                .orderBy(NOTES.UPDATED_AT.desc())
                .fetch(this::toRow);
    }

    /** Notes carrying the given tag, newest-edited first. */
    public List<NoteRow> findAllByTag(String tag) {
        return dsl.select(NOTES.fields())
                .from(NOTES)
                .join(NOTE_TAGS).on(NOTE_TAGS.NOTE_ID.eq(NOTES.ID))
                .join(TAGS).on(TAGS.ID.eq(NOTE_TAGS.TAG_ID))
                .where(TAGS.NAME.equalIgnoreCase(tag))
                .orderBy(NOTES.UPDATED_AT.desc())
                .fetch(this::toRow);
    }

    /**
     * Postgres full-text search over title + content (the generated {@code content_tsv}
     * column from V4), ranked by {@code ts_rank}.
     */
    public List<NoteRow> search(String query) {
        Condition matches = DSL.condition(
                "content_tsv @@ websearch_to_tsquery('english', {0})", DSL.val(query));
        Field<Double> rank = DSL.field(
                "ts_rank(content_tsv, websearch_to_tsquery('english', {0}))", Double.class, DSL.val(query));
        return dsl.select(NOTES.fields())
                .from(NOTES)
                .where(matches)
                .orderBy(rank.desc(), NOTES.UPDATED_AT.desc())
                .fetch(this::toRow);
    }

    /** Notes whose content links to the given title (case-insensitive), newest-edited first. */
    public List<NoteRow> findBacklinks(String title) {
        return dsl.selectDistinct(NOTES.fields())
                .from(NOTES)
                .join(NOTE_LINKS).on(NOTE_LINKS.SOURCE_NOTE_ID.eq(NOTES.ID))
                .where(DSL.lower(NOTE_LINKS.TARGET_REF).eq(title.toLowerCase()))
                .orderBy(NOTES.UPDATED_AT.desc())
                .fetch(this::toRow);
    }

    /** All outgoing links of all notes — the graph view's edge list. */
    public Map<Long, List<LinkParser.Link>> findAllLinks() {
        return dsl.selectFrom(NOTE_LINKS)
                .fetch()
                .stream()
                .collect(Collectors.groupingBy(
                        r -> r.get(NOTE_LINKS.SOURCE_NOTE_ID),
                        Collectors.mapping(
                                r -> new LinkParser.Link(r.get(NOTE_LINKS.TARGET_REF), r.get(NOTE_LINKS.LINK_TYPE)),
                                Collectors.toList())));
    }

    /** Replaces a note's outgoing links with the set parsed from its latest content. */
    public void replaceLinks(long noteId, List<LinkParser.Link> links) {
        dsl.deleteFrom(NOTE_LINKS).where(NOTE_LINKS.SOURCE_NOTE_ID.eq(noteId)).execute();
        for (LinkParser.Link link : links) {
            dsl.insertInto(NOTE_LINKS)
                    .set(NOTE_LINKS.SOURCE_NOTE_ID, noteId)
                    .set(NOTE_LINKS.TARGET_REF, link.targetRef())
                    .set(NOTE_LINKS.LINK_TYPE, link.type())
                    .onConflictDoNothing()
                    .execute();
        }
    }

    public Optional<NoteRow> findById(long id) {
        return dsl.select()
                .from(NOTES)
                .where(NOTES.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    /** Case-insensitive title lookup — titles are the note's identity (wiki-links resolve by them). */
    public Optional<NoteRow> findByTitle(String title) {
        return dsl.select()
                .from(NOTES)
                .where(NOTES.TITLE.equalIgnoreCase(title))
                .fetchOptional(this::toRow);
    }

    public NoteRow insert(String title, String content, String frontmatterJson) {
        Long id = dsl.insertInto(NOTES)
                .set(NOTES.TITLE, title)
                .set(NOTES.CONTENT, content)
                .set(NOTES.FRONTMATTER, JSONB.valueOf(frontmatterJson))
                .returning(NOTES.ID)
                .fetchOne(NOTES.ID);
        return findById(id).orElseThrow();
    }

    public void update(long id, String title, String content, String frontmatterJson) {
        dsl.update(NOTES)
                .set(NOTES.TITLE, title)
                .set(NOTES.CONTENT, content)
                .set(NOTES.FRONTMATTER, JSONB.valueOf(frontmatterJson))
                .where(NOTES.ID.eq(id))
                .execute();
    }

    public boolean existsById(long id) {
        return dsl.fetchExists(NOTES, NOTES.ID.eq(id));
    }

    public void deleteById(long id) {
        dsl.deleteFrom(NOTES).where(NOTES.ID.eq(id)).execute();
    }

    /** Replaces a note's tag set: upserts the tag names, then rebuilds the note_tags links. */
    public void replaceTags(long noteId, List<String> tagNames) {
        dsl.deleteFrom(NOTE_TAGS).where(NOTE_TAGS.NOTE_ID.eq(noteId)).execute();
        for (String name : tagNames) {
            Long tagId = dsl.insertInto(TAGS)
                    .set(TAGS.NAME, name)
                    .onConflict(TAGS.NAME).doUpdate().set(TAGS.NAME, name)
                    .returning(TAGS.ID)
                    .fetchOne(TAGS.ID);
            dsl.insertInto(NOTE_TAGS)
                    .set(NOTE_TAGS.NOTE_ID, noteId)
                    .set(NOTE_TAGS.TAG_ID, tagId)
                    .onConflictDoNothing()
                    .execute();
        }
    }

    public List<String> findTagsByNoteId(long noteId) {
        return dsl.select(TAGS.NAME)
                .from(TAGS)
                .join(NOTE_TAGS).on(NOTE_TAGS.TAG_ID.eq(TAGS.ID))
                .where(NOTE_TAGS.NOTE_ID.eq(noteId))
                .orderBy(TAGS.NAME.asc())
                .fetch(TAGS.NAME);
    }

    /** Tags for many notes at once (the list endpoint) — one query, grouped by note id. */
    public Map<Long, List<String>> findTagsByNoteIds(List<Long> noteIds) {
        if (noteIds.isEmpty()) return Map.of();
        return dsl.select(NOTE_TAGS.NOTE_ID, TAGS.NAME)
                .from(TAGS)
                .join(NOTE_TAGS).on(NOTE_TAGS.TAG_ID.eq(TAGS.ID))
                .where(NOTE_TAGS.NOTE_ID.in(noteIds))
                .orderBy(TAGS.NAME.asc())
                .fetch()
                .stream()
                .collect(Collectors.groupingBy(
                        r -> r.get(NOTE_TAGS.NOTE_ID),
                        Collectors.mapping(r -> r.get(TAGS.NAME), Collectors.toList())));
    }

    /** Snapshots a note's content before it is overwritten; returns the revision id. */
    public long insertRevision(long noteId, String content) {
        return dsl.insertInto(NOTE_REVISIONS)
                .set(NOTE_REVISIONS.NOTE_ID, noteId)
                .set(NOTE_REVISIONS.CONTENT, content)
                .returning(NOTE_REVISIONS.ID)
                .fetchOne(NOTE_REVISIONS.ID);
    }

    public List<NoteRevisionRow> findRevisionsByNoteId(long noteId) {
        return dsl.selectFrom(NOTE_REVISIONS)
                .where(NOTE_REVISIONS.NOTE_ID.eq(noteId))
                .orderBy(NOTE_REVISIONS.CREATED_AT.desc(), NOTE_REVISIONS.ID.desc())
                .fetch(r -> new NoteRevisionRow(
                        r.get(NOTE_REVISIONS.ID),
                        r.get(NOTE_REVISIONS.NOTE_ID),
                        r.get(NOTE_REVISIONS.CONTENT),
                        r.get(NOTE_REVISIONS.CREATED_AT).toInstant()));
    }

    public Optional<NoteRevisionRow> findRevisionById(long noteId, long revisionId) {
        return dsl.selectFrom(NOTE_REVISIONS)
                .where(NOTE_REVISIONS.ID.eq(revisionId).and(NOTE_REVISIONS.NOTE_ID.eq(noteId)))
                .fetchOptional(r -> new NoteRevisionRow(
                        r.get(NOTE_REVISIONS.ID),
                        r.get(NOTE_REVISIONS.NOTE_ID),
                        r.get(NOTE_REVISIONS.CONTENT),
                        r.get(NOTE_REVISIONS.CREATED_AT).toInstant()));
    }

    private NoteRow toRow(Record r) {
        JSONB frontmatter = r.get(NOTES.FRONTMATTER);
        return new NoteRow(
                r.get(NOTES.ID),
                r.get(NOTES.TITLE),
                r.get(NOTES.CONTENT),
                frontmatter == null ? "{}" : frontmatter.data(),
                r.get(NOTES.CREATED_AT).toInstant(),
                r.get(NOTES.UPDATED_AT).toInstant()
        );
    }
}
