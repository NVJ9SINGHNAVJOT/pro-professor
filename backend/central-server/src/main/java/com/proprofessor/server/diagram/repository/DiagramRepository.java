package com.proprofessor.server.diagram.repository;

import com.proprofessor.server.common.db.DiagramRow;
import org.jooq.DSLContext;
import org.jooq.JSONB;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.DIAGRAMS;
import static com.proprofessor.server.db.Tables.DIAGRAM_REVISIONS;

@Repository
public class DiagramRepository {

    private final DSLContext dsl;

    public DiagramRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public List<DiagramRow> findAll() {
        return dsl.select()
                .from(DIAGRAMS)
                .orderBy(DIAGRAMS.UPDATED_AT.desc())
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

    public DiagramRow insert(String title, String contentJson) {
        Long id = dsl.insertInto(DIAGRAMS)
                .set(DIAGRAMS.TITLE, title)
                .set(DIAGRAMS.CONTENT, JSONB.valueOf(contentJson))
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

    public void deleteById(long id) {
        dsl.deleteFrom(DIAGRAMS).where(DIAGRAMS.ID.eq(id)).execute();
    }

    /** Snapshots the current content before an overwrite (AI edit / restore). */
    public void insertRevision(long diagramId, String contentJson) {
        dsl.insertInto(DIAGRAM_REVISIONS)
                .set(DIAGRAM_REVISIONS.DIAGRAM_ID, diagramId)
                .set(DIAGRAM_REVISIONS.CONTENT, JSONB.valueOf(contentJson))
                .execute();
    }

    private DiagramRow toRow(Record r) {
        return new DiagramRow(
                r.get(DIAGRAMS.ID),
                r.get(DIAGRAMS.TITLE),
                r.get(DIAGRAMS.CONTENT).data(),
                r.get(DIAGRAMS.CREATED_AT).toInstant(),
                r.get(DIAGRAMS.UPDATED_AT).toInstant()
        );
    }
}
