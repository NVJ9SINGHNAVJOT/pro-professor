package com.proprofessor.server.diagram.repository;

import com.proprofessor.server.common.db.DiagramRow;
import org.jooq.DSLContext;
import org.jooq.JSONB;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.DIAGRAMS;
import static com.proprofessor.server.db.Tables.NOTES;
import static com.proprofessor.server.db.Tables.NOTE_LINKS;

@Repository
public class DiagramRepository {

    /**
     * How a note spells a reference to a diagram: {@code [[Title.diagram]]}. The frontend's
     * {@code DIAGRAM_SUFFIX} is the same literal on the other tier — deliberate duplication, since
     * the two tiers can't share a constant.
     */
    private static final String DIAGRAM_LINK_SUFFIX = ".diagram";

    private final DSLContext dsl;

    public DiagramRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /**
     * Every diagram, A→Z by title — the explorer's order, so the list arrives already sorted the way
     * the sidebar and the grid draw it. Ordering by {@code updated_at} instead moved a diagram to
     * the top of its folder on every autosave, which is every few seconds while drawing.
     */
    public List<DiagramRow> findAll() {
        return dsl.select()
                .from(DIAGRAMS)
                .orderBy(DIAGRAMS.TITLE.asc())
                .fetch(this::toRow);
    }

    public Optional<DiagramRow> findById(long id) {
        return dsl.select()
                .from(DIAGRAMS)
                .where(DIAGRAMS.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    /** Case-insensitive title lookup — how `![[name.diagram]]` embeds resolve. */
    public Optional<DiagramRow> findByTitle(String title) {
        return dsl.select()
                .from(DIAGRAMS)
                .where(DIAGRAMS.TITLE.equalIgnoreCase(title))
                .fetchOptional(this::toRow);
    }

    /** {@code folderId} is null at the root level. */
    public DiagramRow insert(String title, String contentJson, Long folderId) {
        Long id = dsl.insertInto(DIAGRAMS)
                .set(DIAGRAMS.TITLE, title)
                .set(DIAGRAMS.CONTENT, JSONB.valueOf(contentJson))
                .set(DIAGRAMS.FOLDER_ID, folderId)
                .returning(DIAGRAMS.ID)
                .fetchOne(DIAGRAMS.ID);
        return findById(id).orElseThrow();
    }

    public void update(long id, String title, String contentJson) {
        dsl.update(DIAGRAMS)
                .set(DIAGRAMS.TITLE, title)
                .set(DIAGRAMS.CONTENT, JSONB.valueOf(contentJson))
                .where(DIAGRAMS.ID.eq(id))
                .execute();
    }

    /** Rename only — the scene stays as it is. */
    public void updateTitle(long id, String title) {
        dsl.update(DIAGRAMS)
                .set(DIAGRAMS.TITLE, title)
                .where(DIAGRAMS.ID.eq(id))
                .execute();
    }

    /** Null {@code folderId} moves the diagram to the root level. */
    public void updateFolder(long id, Long folderId) {
        dsl.update(DIAGRAMS)
                .set(DIAGRAMS.FOLDER_ID, folderId)
                .where(DIAGRAMS.ID.eq(id))
                .execute();
    }

    public List<DiagramRow> findByFolderIds(Collection<Long> folderIds) {
        return dsl.select()
                .from(DIAGRAMS)
                .where(DIAGRAMS.FOLDER_ID.in(folderIds))
                .fetch(this::toRow);
    }

    public void deleteById(long id) {
        dsl.deleteFrom(DIAGRAMS).where(DIAGRAMS.ID.eq(id)).execute();
    }

    /** One note→diagram reference: which diagram, and which note holds the link. */
    public record NoteReference(String diagramTitle, String noteTitle) {
    }

    /**
     * The notes that would break if these diagrams were deleted.
     *
     * <p>A note references a diagram as {@code [[Title.diagram]]}, and {@code LinkParser} stores the
     * wiki target verbatim — suffix included — so the join reconstructs it from the title rather
     * than stripping it. Embeds count too: any {@code note_links} row is a reference.
     *
     * <p>The {@code LOWER(target_ref)} index can't serve this join (the other side is computed per
     * row), which is fine at this data size. Reading the notes tables here keeps the guard a
     * read-only join instead of a cross-vertical service dependency.
     */
    public List<NoteReference> findNoteReferences(Collection<Long> diagramIds) {
        if (diagramIds.isEmpty()) return List.of();
        return dsl.select(DIAGRAMS.TITLE, NOTES.TITLE)
                .from(DIAGRAMS)
                .join(NOTE_LINKS)
                .on(DSL.lower(NOTE_LINKS.TARGET_REF).eq(DSL.lower(DIAGRAMS.TITLE.concat(DIAGRAM_LINK_SUFFIX))))
                .join(NOTES).on(NOTES.ID.eq(NOTE_LINKS.SOURCE_NOTE_ID))
                .where(DIAGRAMS.ID.in(diagramIds))
                .orderBy(DIAGRAMS.TITLE.asc(), NOTES.TITLE.asc())
                .fetch(r -> new NoteReference(r.get(DIAGRAMS.TITLE), r.get(NOTES.TITLE)));
    }

    private DiagramRow toRow(Record r) {
        return new DiagramRow(
                r.get(DIAGRAMS.ID),
                r.get(DIAGRAMS.TITLE),
                r.get(DIAGRAMS.CONTENT).data(),
                r.get(DIAGRAMS.FOLDER_ID),
                r.get(DIAGRAMS.CREATED_AT).toInstant(),
                r.get(DIAGRAMS.UPDATED_AT).toInstant()
        );
    }
}
