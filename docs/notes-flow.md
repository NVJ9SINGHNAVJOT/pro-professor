# Notes Module - Architecture & Flow

The Obsidian-like Markdown notes module at `/notes`, implemented from the (since removed)
`docs/notes-feature-plan.md` (Phases 1–4; Phase 5 semantic RAG was
deliberately skipped). Notes live in Postgres like everything else — there is no vault/file
interop; only Obsidian's *syntax and interaction model* is borrowed.

## 1. Overview

- **Dependency budget held:** the only new runtime libraries are `mermaid` and `@xyflow/react`
  on the frontend, both lazy-loaded via dynamic `import()` so they stay out of the main bundle.
  central-server added **zero** jars (frontmatter parsing uses the SnakeYAML Spring Boot already
  ships).
- Notes are optimized for **AI-authored Markdown**: content usually arrives pasted from a chat or
  is rewritten in place by the AI actions (§6), and everything round-trips through one `content`
  text column.

## 2. Database (migrations V3–V5)

| Migration | Tables / changes |
| --- | --- |
| `V3__notes.sql` | `notes` (id BIGSERIAL, **title UNIQUE**, content, frontmatter jsonb), `tags` (unique name), `note_tags` link table |
| `V4__note_links.sql` | `note_links` (source_note_id, target_ref, link_type `link\|embed`); generated `content_tsv` tsvector column + GIN index on `notes` for full-text search |
| `V5__note_revisions.sql` | `note_revisions` (note_id, content snapshot, created_at) — written before every AI overwrite/restore |

Conventions that matter:

- **Titles are the note's identity.** Wiki-links resolve by title (case-insensitive), so titles are
  unique; a colliding save gets a numeric suffix ("Untitled" → "Untitled 2").
- `target_ref` stores the referenced **title as written** — links may point at notes that don't
  exist yet (Obsidian's "unresolved link"); resolution happens at read time.
- Each new table must be listed in the jOOQ `<includes>` regex in
  [pom.xml](../backend/central-server/pom.xml); schema changes follow the usual
  `task migrate` → `task codegen` → recompile loop.
- Per [database-rules.md](../backend/central-server/docs/database-rules.md), V3–V5 are meant to be **folded back into `V1`**
  eventually (drop DB + re-migrate) — pending.

## 3. Backend (`com.proprofessor.server.notes`)

Standard vertical: [NotesController](../backend/central-server/src/main/java/com/proprofessor/server/notes/NotesController.java)
→ [NotesService](../backend/central-server/src/main/java/com/proprofessor/server/notes/NotesService.java)
→ [NotesRepository](../backend/central-server/src/main/java/com/proprofessor/server/notes/repository/NotesRepository.java)
(+ `NoteRow`/`NoteRevisionRow` in `common/db`, DTOs, `NoteMapper`), all wrapped in `ApiResponse`.

**On every save** (`create`/`update`) the service re-derives everything from `content`:

1. [Frontmatter](../backend/central-server/src/main/java/com/proprofessor/server/notes/Frontmatter.java)
   parses the leading `--- … ---` YAML block (SafeConstructor — pasted text is untrusted) into the
   `frontmatter` jsonb column; `title:`/`tags:` keys are honored.
2. Title precedence: frontmatter `title` → request title → first `#` heading → "Untitled", then
   uniqueness suffixing.
3. [LinkParser](../backend/central-server/src/main/java/com/proprofessor/server/notes/LinkParser.java)
   scans the body (code fences and inline code excluded) for `[[Note]]`, `[[Note#H|alias]]`,
   `![[embeds]]`, `[text](Note)` and inline `#tags`, then rebuilds `note_links` + `note_tags`.

**Endpoints** (`/api/v1/notes`): CRUD, `GET ?tag=` filter, `GET /search?q=`
(`websearch_to_tsquery` + `ts_rank` over the V4 tsvector), `GET /{id}/backlinks` (join on
`lower(target_ref) = lower(title)`), `GET /links` (edge list feeding the graph view),
`GET /{id}/revisions`, `POST /{id}/revisions/{revId}/restore`.

One media addition: `GET /api/v1/media/by-filename/{name}/file` resolves `![[image.png]]` embeds
to the newest upload with that original filename.

## 4. Frontend (`modules/notes`)

Follows the chat module's patterns: `pages/notes/index.tsx` → route in `main.tsx`,
`redux/slices/notesSlice.ts` (list cache), `services/operations/notes/notes.route.ts` (REST via
`createRoute`/`useApi`) and `notes.stream.ts` (SSE via `rawFetch`, mirroring `chats.stream.ts`).

[NotesScreen](../frontend/src/modules/notes/screens/NotesScreen.tsx) is the three-pane workspace;
each pane scrolls independently:

- **Left** — [NoteList](../frontend/src/modules/notes/components/NoteList.tsx): collapsible **tag
  browser tree** (tag → its notes) above the flat newest-first list; the search box merges instant
  client title/tag matches with debounced server FTS results.
- **Center** — toolbar (view toggle source/split/preview, graph view, revision history, context
  panel), the [AiBar](../frontend/src/modules/notes/components/AiBar.tsx) (§6), then editor
  (plain `TextareaInput`) ⟷ preview split with a hand-rolled draggable divider
  ([SplitPane](../frontend/src/modules/notes/components/SplitPane.tsx)). Cmd/Ctrl+S saves;
  the graph view ([GraphView](../frontend/src/modules/notes/components/GraphView.tsx)) renders
  `GET /notes/links` as a *generated Mermaid definition* — solid arrows = links, dashed = embeds,
  dashed nodes = unresolved targets.
- **Right** — [ContextPanel](../frontend/src/modules/notes/components/ContextPanel.tsx):
  backlinks (server), outgoing links + outline (parsed client-side from the live editor content,
  matching LinkParser's code-exclusion rules), tags.
- **Command palette** — [CommandPalette](../frontend/src/modules/notes/components/CommandPalette.tsx),
  Cmd/Ctrl+P (or +K), hand-rolled (no `cmdk`): open/create notes, view modes, graph, insert
  Mermaid/React Flow templates, AI actions. AI commands reach the AiBar via a `pendingCommand`
  prop signal, not a ref (react-compiler lint forbids ref access in render paths).

## 5. Shared rendering ([components/common/Markdown.tsx](../frontend/src/components/common/Markdown.tsx))

The `Markdown` component was **extracted from ChatMessages** and is shared by chat and notes:
`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`, plus hand-rolled remark
transforms (no `unist-util-visit` dependency):

- **Callouts** — `> [!note] Title` blockquotes → styled boxes (CSS in `index.css`, per-type colors).
- **Wiki-links** — text nodes are rewritten to `#wiki:`/`#wiki-embed:` links; an `a` component
  override routes clicks to the notes module's [useWikiHandlers](../frontend/src/modules/notes/hooks/useWikiHandlers.tsx):
  existing title → navigate (a `#Heading` part rides along as router state and NotesScreen
  smooth-scrolls the preview to it); missing title → **create the note on click**. Missing links
  render dimmed/dashed. Chat passes no `wiki` prop, so this stays inert there.
- **Embeds** — `![[Note]]` / `![[Note#Heading]]` render [NoteEmbed](../frontend/src/modules/notes/components/NoteEmbed.tsx):
  fetches the target and transcludes the body (or just that heading's section via
  `extractSection`); image filenames render via the media by-filename endpoint. Depth is capped at
  1 — nested embeds fall back to plain links. A `![[Title.diagram]]` target routes to the diagram
  module's `DiagramEmbed` instead (see [diagram-flow.md](diagram-flow.md) §5).
- **Diagrams** — ```` ```mermaid ```` fences → [MermaidBlock](../frontend/src/components/common/MermaidBlock.tsx)
  (lazy `import("mermaid")`, dark theme, parse failure shows raw source);
  ```` ```reactflow-json ```` fences → [FlowBlock](../frontend/src/components/common/FlowBlock.tsx)
  (lazy `@xyflow/react`, draggable nodes, JSON `{nodes:[{id,label,position}], edges:[{source,target}]}`,
  invalid JSON shows raw source). Both work in chat replies too.

## 6. AI note actions (`notes.ai` package)

`POST /api/v1/notes/{id}/ai-update | summarize | continue` — SSE endpoints shaped exactly like
chat ([NotesAiController](../backend/central-server/src/main/java/com/proprofessor/server/notes/ai/NotesAiController.java)
runs on the shared `chatStreamExecutor`; frames are `note.start` / `note.chunk` / `note.done` /
`note.error`). Flow in [NotesAiService](../backend/central-server/src/main/java/com/proprofessor/server/notes/ai/NotesAiService.java):

1. Build a system prompt describing the app's Markdown dialect + a per-action task prompt; the
   model must return the **complete updated note**.
2. Stream through a local model — `ollama`/`ai-service` → the existing `ChatCompletionClient`
   (OpenAI-compatible), guarded by `ModelActivationService.acquireForChat`/`releaseAfterChat`
   like a chat turn.
3. On completion: strip an accidental wrapping code fence → **snapshot the old content into
   `note_revisions`** → save through `NotesService.updateNote` (re-parses frontmatter/links/tags)
   → emit `note.done` with the revision id. A restore snapshots the current content first, so
   restores are themselves undoable. Nothing is persisted on error/abort.

The AiBar's model picker lists the locally activated models and defaults to the active one; the
frontend streams tokens straight into the editor and refetches the note on `note.done`.

> **History:** a Claude/Anthropic provider (raw Messages API `AnthropicClient`, `app.anthropic.*`
> config, `GET /notes/ai/status`) was removed on 2026-07-18 — Claude isn't OpenAI-module
> compatible, so notes AI now runs only through local models.

## 7. Not implemented (by decision)

Phase 5 semantic RAG (`pgvector`, `mlx-embeddings` in ai-service, hybrid search, `/notes/ask`) —
optional per the plan and requires an ai-service handoff doc under `plans/` if ever wanted.

## 8. Related Docs

- [project-flow.md](project-flow.md) — overall system architecture.
- `docs/notes-feature-plan.md` — the original execution plan (removed after implementation).
- [frontend/docs/folder-structure.md](../frontend/docs/folder-structure.md) /
  [backend/central-server/docs/folder-structure.md](../backend/central-server/docs/folder-structure.md) /
  [project-rules.md](project-rules.md) — the conventions this module follows.
