-- ── Full-text search over chat messages ───────────────────────────────────────
-- Mirrors notes.content_tsv in V1 so the shared ⌘K palette can rank chats the same
-- way it ranks notes: a generated tsvector plus a GIN index, queried with
-- websearch_to_tsquery and ordered by ts_rank.
--
-- Kept as an incremental migration rather than folded into V1 (which database-rules.md
-- prefers) purely so the existing chat history survives — V1 has already been applied,
-- and editing it would fail Flyway's checksum and force a drop. Fold this into
-- V1__init_schema.sql at the next clean rebuild and delete this file.

ALTER TABLE messages
    ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX messages_content_tsv_idx ON messages USING GIN (content_tsv);
