package com.proprofessor.server.notes.repository;

import com.proprofessor.server.common.db.NoteFolderRow;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.NOTE_FOLDERS;

@Repository
public class NoteFolderRepository {

    private final DSLContext dsl;

    public NoteFolderRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /**
     * Every folder, flat. The client builds the tree from {@code parentId}, and the service walks
     * this same list to resolve descendants — at one folder set per user there is no reason to
     * reach for a recursive CTE.
     */
    public List<NoteFolderRow> findAll() {
        return dsl.select()
                .from(NOTE_FOLDERS)
                .orderBy(NOTE_FOLDERS.NAME.asc())
                .fetch(this::toRow);
    }

    public Optional<NoteFolderRow> findById(long id) {
        return dsl.select()
                .from(NOTE_FOLDERS)
                .where(NOTE_FOLDERS.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    public NoteFolderRow insert(String name, Long parentId) {
        Long id = dsl.insertInto(NOTE_FOLDERS)
                .set(NOTE_FOLDERS.NAME, name)
                .set(NOTE_FOLDERS.PARENT_ID, parentId)
                .returning(NOTE_FOLDERS.ID)
                .fetchOne(NOTE_FOLDERS.ID);
        return findById(id).orElseThrow();
    }

    public void rename(long id, String name) {
        dsl.update(NOTE_FOLDERS)
                .set(NOTE_FOLDERS.NAME, name)
                .where(NOTE_FOLDERS.ID.eq(id))
                .execute();
    }

    public void updateParent(long id, Long parentId) {
        dsl.update(NOTE_FOLDERS)
                .set(NOTE_FOLDERS.PARENT_ID, parentId)
                .where(NOTE_FOLDERS.ID.eq(id))
                .execute();
    }

    /** Subfolders and the notes inside them go with it — {@code ON DELETE CASCADE}. */
    public void deleteById(long id) {
        dsl.deleteFrom(NOTE_FOLDERS).where(NOTE_FOLDERS.ID.eq(id)).execute();
    }

    private NoteFolderRow toRow(Record r) {
        return new NoteFolderRow(
                r.get(NOTE_FOLDERS.ID),
                r.get(NOTE_FOLDERS.NAME),
                r.get(NOTE_FOLDERS.PARENT_ID),
                r.get(NOTE_FOLDERS.CREATED_AT).toInstant()
        );
    }
}
