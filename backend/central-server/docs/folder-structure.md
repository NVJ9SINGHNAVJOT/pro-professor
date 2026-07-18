# Central-Server Folder Structure & Conventions

Architectural patterns for the `backend/central-server/` Spring Boot service. When adding new
features or modifying existing code, adhere to these conventions to maintain consistency. (The
frontend's equivalent lives in [frontend/docs/folder-structure.md](../../../frontend/docs/folder-structure.md);
system-level flows live in [docs/project-flow.md](../../../docs/project-flow.md).)

The backend uses a **"Package by Feature"** architecture (also known as vertical slicing).
Instead of grouping classes by technical type (e.g., all controllers together, all services
together), we group classes by the domain feature they belong to (e.g., `chat`, `model`,
`notes`, `diagram`, `common`).

## Example Feature Package Structure

When creating a new feature (e.g., `featureX`), create a new package
`com.proprofessor.server.featureX` and structure it as follows:

```
com.proprofessor.server.featureX/
├── FeatureXController.java      # REST API endpoints. Thin layer that handles HTTP requests and delegates to the Service.
├── FeatureXService.java         # Core business logic for the feature.
├── dto/                         # Data Transfer Objects
│   ├── FeatureXRequest.java     # Request payloads received by the Controller
│   └── FeatureXResponse.java    # Response payloads returned by the Controller
├── repository/                  # Database Access Layer (jOOQ)
│   └── FeatureXRepository.java  # Plain @Repository class holding a DSLContext; builds type-safe SQL and maps Records to row records
└── mapper/                      # Object Mappers (Optional)
    └── FeatureXMapper.java      # Logic to convert between row records and DTOs
```

> **Persistence is jOOQ, not JPA/Hibernate.** There are no JPA `@Entity` classes. Instead:
>
> - **Generated table/record sources** (e.g. `CONVERSATIONS`, `ConversationsRecord`) live under
>   `target/generated-sources/jooq/.../db/` — regenerated from the schema, never hand-edited.
> - **Row records** — plain Java records like `ConversationRow`, `MessageRow`, `ModelRow`,
>   `MediaRow`, `NoteRow`, `DiagramRow` — are the in-memory shape a repository returns. They
>   live in the **shared** `com.proprofessor.server.common.db` package (not per-feature),
>   because rows are often joined across features.
> - **Repositories** are `@Repository` classes that inject a `DSLContext`, write jOOQ queries
>   (`dsl.select()…`, `dsl.insertInto()…`), and hand-map each `Record` to a row record. They do
>   **not** extend `JpaRepository`.

## Key Backend Rules

1. **Isolation**: A feature package should be as self-contained as possible.
2. **DTO Boundaries**: Controllers should consume and return DTOs, not raw row records.
   Services generally handle the conversion or delegate to a mapper.
3. **Common Code**: Shared utilities, global exception handlers, and base classes belong in the
   `com.proprofessor.server.common` package.

## Related rules

- [logging-rules.md](logging-rules.md) — the request/response logging contract (MDC request
  ids, boundary logging, SSE/bytes handling).
- [database-rules.md](database-rules.md) — Flyway + jOOQ workflow on this project's disposable
  dev database.
