package com.proprofessor.server.model.repository;

import com.proprofessor.server.common.db.ModelRow;
import com.proprofessor.server.db.tables.records.ModelsRecord;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.util.Optional;

import static com.proprofessor.server.db.Tables.MODELS;

@Repository
public class ModelRepository {

    private final DSLContext dsl;

    public ModelRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public Optional<ModelRow> findByProviderAndName(String provider, String name) {
        return dsl.selectFrom(MODELS)
                .where(MODELS.PROVIDER.eq(provider).and(MODELS.NAME.eq(name)))
                .fetchOptional(this::toRow);
    }

    public ModelRow insert(String name, String provider, String role, String version, boolean isActive) {
        return dsl.insertInto(MODELS)
                .set(MODELS.NAME, name)
                .set(MODELS.PROVIDER, provider)
                .set(MODELS.ROLE, role)
                .set(MODELS.VERSION, version)
                .set(MODELS.IS_ACTIVE, isActive)
                .returning()
                .fetchOne(this::toRow);
    }

    private ModelRow toRow(ModelsRecord r) {
        return new ModelRow(
                r.getId(),
                r.getName(),
                r.getProvider(),
                r.getRole(),
                r.getVersion(),
                r.getIsActive(),
                r.getCreatedAt().toInstant(),
                r.getUpdatedAt().toInstant()
        );
    }
}
