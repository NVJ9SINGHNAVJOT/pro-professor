# Database & Data Rules (central-server)

This is a **personal project** with no production data and no real users. The database
is disposable. Persistence uses **Flyway** migrations (`src/main/resources/db/migration`) +
**jOOQ** codegen.

- **Prefer editing the base schema over incremental migrations.** When a feature needs a
  different schema, change the consolidated `V1__init_schema.sql` directly, then drop the
  database and re-migrate from scratch. Don't accumulate `ALTER TABLE` migration scripts,
  backward-compat shims, or data-preservation/backfill logic.
- **Deleting the database is allowed.** Wiping rows, truncating, or dropping and recreating
  the whole DB to move a schema change forward is fine — prefer the simplest path. Existing
  rows carry no value to preserve.
- **Create new migrations when needed.** A throwaway incremental migration is fine while
  iterating, but fold it back into `V1` once it settles so the schema stays a single clean file.
  (Currently pending for `V3`–`V6`: the notes and diagram tables.)
- **Workflow after any schema change:** clean/drop the DB → `task migrate` → `task codegen`
  (regenerate jOOQ) → recompile. Verify it applies on an empty schema, not just an existing one.
  New tables must also be added to the jOOQ `<includes>` regex in `pom.xml`.
- **No fallbacks for absent/legacy data.** Because the DB is always recreated fresh, don't add
  defaulting/`??`-style fallbacks for columns that "might be null on old rows" — there are no
  old rows. Make columns `NOT NULL` when the app always provides a value.
- **New Postgres columns default to `NOT NULL`.** When adding a field to the schema that the app
  will always populate in this project's scenario, declare it `NOT NULL` (add a `DEFAULT` only when
  needed so the migration applies cleanly). Mirror that non-null intent up the stack — the jOOQ row,
  DTOs, and the frontend type should all be non-null, not `T | null`. Since the DB is disposable,
  delete it and re-run the migration workflow above rather than writing nullable-then-backfill steps.
  Reserve nullable only for values that are genuinely sometimes absent (e.g. provider-reported
  metadata that some models omit) — that is a runtime concern, not a schema column.
- Still **tell the user** before you wipe/recreate, and **don't** touch data outside this
  project (other databases, other services). The freedom is scoped to this project's own
  dev database.

**Why:** avoids migration/compat overhead that has no payoff on a throwaway dataset, keeping
changes minimal (Simplicity First).
