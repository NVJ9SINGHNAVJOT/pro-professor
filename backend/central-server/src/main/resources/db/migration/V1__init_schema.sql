-- Reusable trigger function: sets updated_at = NOW() on every UPDATE
CREATE OR REPLACE FUNCTION fn_set_updated_at()
    RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── models ────────────────────────────────────────────────────────────────────
-- Reference table: one row per (provider, model-name) pair.
-- Conversations point at this so we always know which model was used.
CREATE TABLE models
(
    id        BIGSERIAL PRIMARY KEY,
    name      VARCHAR(255) NOT NULL,
    provider  VARCHAR(50)  NOT NULL,
    role      VARCHAR(50)  NOT NULL,
    version   VARCHAR(50),
    is_active BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT models_provider_name_unique_idx UNIQUE (provider, name)
);

CREATE TRIGGER trg_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── conversations ─────────────────────────────────────────────────────────────
-- The inference settings are the conversation's current ones, restored when the
-- chat is reopened. The client always sends concrete params, so all are NOT NULL;
-- verbose_enabled/thinking_enabled are UI display preferences (show metrics / show
-- reasoning). 'verbose' is a reserved word in Postgres, hence verbose_enabled.
-- last_context_tokens: running context-window usage after the most recent turn
-- (prompt + completion), used to show how much of the model's window is consumed.
CREATE TABLE conversations
(
    id                  BIGSERIAL PRIMARY KEY,
    model_id            BIGINT           NOT NULL REFERENCES models (id),
    title               VARCHAR(255),
    mode                VARCHAR(50)      NOT NULL DEFAULT 'simple',
    max_tokens          INTEGER          NOT NULL,
    temperature         DOUBLE PRECISION NOT NULL,
    top_p               DOUBLE PRECISION NOT NULL,
    repetition_penalty  DOUBLE PRECISION NOT NULL,
    verbose_enabled     BOOLEAN          NOT NULL DEFAULT FALSE,
    thinking_enabled    BOOLEAN          NOT NULL DEFAULT FALSE,
    last_context_tokens INTEGER          NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── messages ──────────────────────────────────────────────────────────────────
-- ON DELETE CASCADE: deleting a conversation wipes all its messages.
-- role: 'user'/'assistant'/'system'/'error'/'settings'. 'error' rows are failed
-- assistant turns and 'settings' rows mark a mid-conversation settings change; both
-- are persisted for the UI and never replayed to the model (see ChatService.MODEL_ROLES).
-- 'system' holds the conversation's persona.
-- content_tsv mirrors notes.content_tsv so the shared ⌘K palette ranks chats the same way
-- it ranks notes: a generated tsvector + GIN index, queried with websearch_to_tsquery and
-- ordered by ts_rank (ConversationRepository.search).
CREATE TABLE messages
(
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT      NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL,
    content         TEXT        NOT NULL,
    content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_role_check
        CHECK (role IN ('user', 'assistant', 'system', 'error', 'settings'))
);

CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX messages_content_tsv_idx ON messages USING GIN (content_tsv);

-- ── media ─────────────────────────────────────────────────────────────────────
-- One row per file stored in the storage-server. We keep only the reference
-- (storage_id = the storage-server UUID, the "S3 key") plus its metadata; the
-- bytes live in the storage-server, never in Postgres.
CREATE TABLE media
(
    id                BIGSERIAL PRIMARY KEY,
    storage_id        VARCHAR(64)  NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(127) NOT NULL,
    size              BIGINT       NOT NULL,
    category          VARCHAR(32)  NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT media_storage_id_unique UNIQUE (storage_id)
);

CREATE TRIGGER trg_media_updated_at
    BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── message_attachments ───────────────────────────────────────────────────────
-- Link table: which media are attached to which message.
-- ON DELETE CASCADE on message_id: deleting a message (or its conversation) wipes its links.
CREATE TABLE message_attachments
(
    message_id BIGINT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    media_id   BIGINT NOT NULL REFERENCES media (id),
    PRIMARY KEY (message_id, media_id)
);

-- ── note_folders ──────────────────────────────────────────────────────────────
-- Nested folders for the note explorer, the same shape as diagram_folders.
-- Addressed by id, never by name, so sibling names may repeat.
-- NULL parent_id = root level. No updated_at: nothing reads it, folders sort by name.
-- Declared above `notes` for the foreign key.
CREATE TABLE note_folders
(
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    parent_id  BIGINT       REFERENCES note_folders (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX note_folders_parent_id_idx ON note_folders (parent_id);

-- ── notes ─────────────────────────────────────────────────────────────────────
-- Markdown notes (Obsidian-like). The full source lives in `content`; the YAML
-- frontmatter block (if any) is also parsed server-side into `frontmatter` jsonb
-- so tags/aliases can be queried without re-parsing Markdown. content_tsv is a
-- generated tsvector over title + content, GIN-indexed for keyword search
-- (websearch_to_tsquery + ts_rank in NotesRepository.search).
-- NULL folder_id = root level; deleting a folder deletes the notes inside it.
-- Titles stay globally unique even so — `[[wiki links]]` resolve by title alone
-- (note_links.target_ref), so scoping them per folder would break every link.
CREATE TABLE notes
(
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    content     TEXT         NOT NULL,
    frontmatter JSONB        NOT NULL DEFAULT '{}'::jsonb,
    folder_id   BIGINT       REFERENCES note_folders (id) ON DELETE CASCADE,
    content_tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || content)
        ) STORED,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT notes_title_unique UNIQUE (title)
);

CREATE TRIGGER trg_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX notes_content_tsv_idx ON notes USING GIN (content_tsv);

CREATE INDEX notes_folder_id_idx ON notes (folder_id);

-- ── tags ──────────────────────────────────────────────────────────────────────
-- Normalized tag names (lowercase, no leading '#'), shared across notes.
CREATE TABLE tags
(
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT tags_name_unique UNIQUE (name)
);

-- ── note_tags ─────────────────────────────────────────────────────────────────
-- Link table: which tags apply to which note (from frontmatter and inline #tags).
-- Rebuilt on every note save; deleting a note wipes its links.
CREATE TABLE note_tags
(
    note_id BIGINT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- ── note_links ────────────────────────────────────────────────────────────────
-- One row per outgoing wiki-link/embed parsed from a note's content on save.
-- target_ref is the referenced note *title* as written (resolution to an id
-- happens at read time, case-insensitively, so links can point at notes that
-- don't exist yet — Obsidian's "unresolved link" behavior).
CREATE TABLE note_links
(
    source_note_id BIGINT       NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    target_ref     VARCHAR(255) NOT NULL,
    link_type      VARCHAR(20)  NOT NULL,
    PRIMARY KEY (source_note_id, target_ref, link_type),
    CONSTRAINT note_links_type_check CHECK (link_type IN ('link', 'embed'))
);

CREATE INDEX note_links_target_ref_idx ON note_links (LOWER(target_ref));

-- ── note_revisions ────────────────────────────────────────────────────────────
-- Content snapshots taken right before an AI update (or a restore) overwrites a
-- note, so AI edits are always reversible. Deleting a note wipes its revisions.
CREATE TABLE note_revisions
(
    id         BIGSERIAL PRIMARY KEY,
    note_id    BIGINT      NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX note_revisions_note_id_idx ON note_revisions (note_id, created_at DESC);

-- ── diagram_folders ───────────────────────────────────────────────────────────
-- Nested folders for the diagram sidebar. Addressed by id, never by name, so
-- sibling names may repeat (unlike diagram titles, which back `[[Title.diagram]]`).
-- NULL parent_id = root level. No updated_at: nothing reads it, folders sort by name.
CREATE TABLE diagram_folders
(
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    parent_id  BIGINT       REFERENCES diagram_folders (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX diagram_folders_parent_id_idx ON diagram_folders (parent_id);

-- ── diagrams ──────────────────────────────────────────────────────────────────
-- User-drawn diagrams. The full Excalidraw scene JSON lives in `content`
-- ({ type, elements, appState, files }) — an editable document stored inline
-- like notes, NOT a storage-server blob.
-- Titles are unique so `[[Title.diagram]]` links resolve by title.
-- NULL folder_id = root level. Deleting a folder deletes the diagrams inside it,
-- but only once the service has verified no note links to any of them.
CREATE TABLE diagrams
(
    id         BIGSERIAL PRIMARY KEY,
    title      VARCHAR(255) NOT NULL,
    content    JSONB        NOT NULL,
    folder_id  BIGINT       REFERENCES diagram_folders (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT diagrams_title_unique UNIQUE (title)
);

CREATE INDEX diagrams_folder_id_idx ON diagrams (folder_id);

CREATE TRIGGER trg_diagrams_updated_at
    BEFORE UPDATE ON diagrams
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── app_settings ──────────────────────────────────────────────────────────────
-- Single-row global preferences (single-user app). Holds default inference params
-- applied server-side to Notes AI actions. Concrete NOT NULL values (seeded below);
-- the UI always shows/edits real numbers, like chat.
CREATE TABLE app_settings
(
    id                         BIGINT           PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    notes_max_tokens           INTEGER          NOT NULL,
    notes_temperature          DOUBLE PRECISION NOT NULL,
    notes_top_p                DOUBLE PRECISION NOT NULL,
    notes_repetition_penalty   DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_app_settings_updated_at
    BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Seed the singleton: Notes = Balanced
INSERT INTO app_settings
    (id, notes_max_tokens, notes_temperature, notes_top_p, notes_repetition_penalty)
VALUES (1, 20000, 0.7, 0.9, 1.1);
