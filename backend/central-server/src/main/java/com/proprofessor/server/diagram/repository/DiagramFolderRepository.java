package com.proprofessor.server.diagram.repository;

import com.proprofessor.server.common.db.DiagramFolderRow;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.DIAGRAM_FOLDERS;

@Repository
public class DiagramFolderRepository {

    private final DSLContext dsl;

    public DiagramFolderRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /**
     * Every folder, flat. The client builds the tree from {@code parentId}, and the service walks
     * this same list to resolve descendants — at one folder set per user there is no reason to
     * reach for a recursive CTE.
     */
    public List<DiagramFolderRow> findAll() {
        return dsl.select()
                .from(DIAGRAM_FOLDERS)
                .orderBy(DIAGRAM_FOLDERS.NAME.asc())
                .fetch(this::toRow);
    }

    public Optional<DiagramFolderRow> findById(long id) {
        return dsl.select()
                .from(DIAGRAM_FOLDERS)
                .where(DIAGRAM_FOLDERS.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    public DiagramFolderRow insert(String name, Long parentId) {
        Long id = dsl.insertInto(DIAGRAM_FOLDERS)
                .set(DIAGRAM_FOLDERS.NAME, name)
                .set(DIAGRAM_FOLDERS.PARENT_ID, parentId)
                .returning(DIAGRAM_FOLDERS.ID)
                .fetchOne(DIAGRAM_FOLDERS.ID);
        return findById(id).orElseThrow();
    }

    public void rename(long id, String name) {
        dsl.update(DIAGRAM_FOLDERS)
                .set(DIAGRAM_FOLDERS.NAME, name)
                .where(DIAGRAM_FOLDERS.ID.eq(id))
                .execute();
    }

    public void updateParent(long id, Long parentId) {
        dsl.update(DIAGRAM_FOLDERS)
                .set(DIAGRAM_FOLDERS.PARENT_ID, parentId)
                .where(DIAGRAM_FOLDERS.ID.eq(id))
                .execute();
    }

    /** Subfolders and the diagrams inside them go with it — {@code ON DELETE CASCADE}. */
    public void deleteById(long id) {
        dsl.deleteFrom(DIAGRAM_FOLDERS).where(DIAGRAM_FOLDERS.ID.eq(id)).execute();
    }

    private DiagramFolderRow toRow(Record r) {
        return new DiagramFolderRow(
                r.get(DIAGRAM_FOLDERS.ID),
                r.get(DIAGRAM_FOLDERS.NAME),
                r.get(DIAGRAM_FOLDERS.PARENT_ID),
                r.get(DIAGRAM_FOLDERS.CREATED_AT).toInstant()
        );
    }
}
