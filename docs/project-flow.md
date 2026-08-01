# Pro Professor - Project Architecture & Flow

## 1. System Overview

The project is a multi-tier, all-local AI chat application:

1. **Frontend**: React (Vite) Single Page Application.
2. **Central Server**: Java Spring Boot backend acting as the API gateway and orchestration layer. The browser only ever talks to this tier.
3. **AI Service**: Python FastAPI backend (git submodule) for running local ML models via `mlx-lm` / `mlx-vlm`, plus local speech-to-text and text-to-speech.
4. **Storage Server**: a local Go service (in this repo, under `backend/storage-server/`) that stores uploaded file bytes; Central Server keeps only a reference (storage UUID + metadata) and hands the browser a direct URL to download from.
5. **Ollama**: external local inference engine for standard open-source models.

**Supporting infrastructure (used by Central Server):**
- **Postgres** — conversations, messages, model rows, and media references. Persistence uses **jOOQ** (generated sources under `target/generated-sources/jooq`), not JPA.
- **Kafka** — health-checked via `KafkaHealthIndicator` (event plumbing).

Every request from the browser hits Central Server, which fans out to the AI Service, Storage Server, or Ollama. The one exception is media **downloads**: Central Server hands the browser a direct Storage Server URL, so file bytes stream straight from storage (never through the JVM). Everything else the browser reaches only through Central Server.

> **Repository boundaries.** `frontend/`, `backend/central-server/`, and `backend/storage-server/`
> live in *this* repo and are edited directly. `backend/ai-service/` is the only exception — a
> **git submodule with its own repository and its own agent config** — so from a `pro-professor`
> session you **plan** changes to it (a task-requirements markdown spec under `plans/`) rather than
> editing its files. See [project-rules.md](project-rules.md) § Repository boundaries for the full
> workflow.

## 2. Component Interactions

### 2.0 Frontend page data (React Router loaders)

Every page's on-arrival data is fetched by a **route loader**, before the screen renders — not by a
`useEffect` after mount. Loaders live beside their page wrapper (`src/pages/<area>/loader.ts`) and
are attached to the routes in [main.tsx](../frontend/src/main.tsx).

1. A navigation to `/notes/:noteId` (or chat / diagrams / settings) runs that route's loader first.
   It calls the same `ApiRoute` descriptors as the rest of the app through
   [loadRoute.ts](../frontend/src/services/client/loadRoute.ts), which adapts `fetchApi`'s
   `{ error, response }` contract into throw-on-failure and forwards the loader's `request.signal`
   so an interrupted navigation cancels its fetches.
2. **Chat, notes and diagrams are each a parent route owning the section list plus a child route
   owning the open item.** React Router revalidates every matched loader by default, so a single
   loader for both would refetch the whole list every time you clicked an item. The parent carries
   `shouldRevalidate: () => false` — its list loader runs once per entry into the section and never
   again, because mutations patch the slice row directly (point 7), leaving a revalidation nothing
   to do. The child carries `detailShouldRevalidate(<param>)`, so the open item reloads only when
   the URL names a *different* one. Entering a section from elsewhere is a *new* match, so its
   loader always runs.
   - `/notes` → `GET /notes`
   - `/notes` → `/notes/3` → `GET /notes/3` + `GET /notes/3/backlinks` only
   - `/notes/3` → `/notes/4` → the same two, no list refetch
3. Navigation **blocks** until the data is in. [RouteProgress](../frontend/src/components/common/RouteProgress.tsx)
   shows a top bar meanwhile, driven by `useNavigation`.
4. A failed loader renders [RouteError](../frontend/src/components/common/RouteError.tsx) — the
   server's message plus a Retry that calls `revalidate()`. It is attached per **child** route, so
   the error renders into `App`'s `<Outlet/>`.
5. The root route loads the models list and sets `shouldRevalidate: () => false` — once per page
   load, not per navigation. Because it runs before first paint it also needs a `HydrateFallback`
   ([AppSplash](../frontend/src/components/common/AppSplash.tsx)).
6. Loaders **seed Redux** for state that outlives a single navigation: the models list
   (`setModels`, read from every route) and the three sidebar lists (`setItems` on `notesList` /
   `chatList` / `diagramList`). Those parent loaders return `null` and carry
   `shouldRevalidate: () => false`, so each runs once per entry into its section. **Detail data is
   returned** as ordinary loader data, and the page wrapper passes list + detail into the screen as
   props.
7. After a mutation, components **patch the sidebar row** from the response they already have —
   `upsertItem` / `removeItem` — instead of refetching the list, hand-rolling a refresh callback,
   or prop-drilling a counter. `upsertItem` moves the row to the front, which matches the server's
   `updated_at DESC` ordering (a DB trigger stamps that column on every write). This is what lets a
   note save cost exactly one `PUT`, and a diagram autosave re-sort the list without a request.

Not everything moves: `useApi` remains the tool for **mutations** and **on-demand** fetches —
note search, the revision-history popover, the graph view, `![[…]]` transclusions, the storage
browser's pagination, and the SSE chat stream. The rule is *on arrival → loader; on demand →
`useApi`*.

> The chat stream self-navigates `/chat/new → /chat/:id` when a new conversation is created. Both
> are the **same** route (`NEW_ITEM_ID`), so the screen is not remounted mid-stream — a remount
> would run `ChatMessages`' unmount cleanup, which aborts the SSE request and kills the very
> generation the user just started. The hop also skips the detail loader — `markDraftCreated`
> ([loadRoute.ts](../frontend/src/services/client/loadRoute.ts)) marks the id, and
> `detailShouldRevalidate` consumes that mark — so it is a pure param swap: no request, no pending
> navigation, nothing that could clobber the in-flight stream. Notes and diagrams take the same
> route for their own first save. Reaching the same conversation any other way still loads it, and
> `ChatMessages`' `loadedRef` guard discards a load that lands on the conversation it is already
> streaming.

### 2.1 Model Discovery & Loading

1. **Frontend** calls `GET /api/v1/models/all` on **Central Server** ([ModelController.java](../backend/central-server/src/main/java/com/proprofessor/server/model/ModelController.java)).
2. **Central Server** aggregates models from two sources:
   - **Ollama**: `OllamaClient` — injects a default `["text"]` for `inputModalities` since Ollama does not report audio/image input.
   - **AI Service**: `AiServiceClient` — maps through `inputModalities` (e.g. `["text"]`, `["text","image"]`, `["text","audio"]`).
3. The aggregated `ProviderModel` list — which now **includes `inputModalities`** — is returned and populated in the `ModelSelector`.
4. When a user picks an AI Service model, Central Server proxies a load request (`POST /api/v1/models/load`) to load it into VRAM. AI Service models are also lazily loaded just-in-time at chat send (`ChatService` calls `loadModel` before streaming).

### 2.2 Text Chat Flow (SSE)

Chat streaming uses **Server-Sent Events**, not WebSockets.

1. User submits a prompt; **Frontend** calls `POST /api/v1/chats/send` ([chats.stream.ts](../frontend/src/services/operations/chats/chats.stream.ts)).
2. **Central Server** ([ChatController.java](../backend/central-server/src/main/java/com/proprofessor/server/chat/ChatController.java)) returns an `SseEmitter` and runs generation on the `chatStreamExecutor` thread pool.
3. **ChatService**:
   - Resolves or creates the conversation (deriving a title from the first message), persists the user message to Postgres, and links any uploaded attachments. On create, the turn's inference settings are stored on the conversation row; on an existing conversation, a change to the sampling params is detected and recorded (see §2.7).
   - Touches the conversation row (`ConversationRepository.touch`) right after the user message lands, so its `updated_at` — and therefore its position in the history list — moves for **every** turn, including ones that are later stopped or fail. Messages live in their own table, so nothing else would bump it.
   - Loads conversation history and streams a completion via `ChatCompletionClient`, which drives **both Ollama and AI Service through the OpenAI Java SDK** (OpenAI-compatible `POST /v1/chat/completions`), switching only the base URL by provider.
   - Persists the assembled assistant reply.
4. The reply streams back as SSE frames discriminated by `type`: `chat.start` / `chat.chunk` / `chat.settings` / `chat.thinking` / `chat.metrics` / `chat.done` / `chat.error` (plus `chat.title` / `chat.transcript` on voice turns).
5. **Error handling**: a `requestId` (from `RequestIdFilter`, MDC-correlated in logs) is included in error frames. If the client aborts mid-stream (user hits Stop), `ClientDisconnectedException` is raised and generation is aborted cleanly. Generation failures persist a user-facing `error` message row for the UI.

Conversation management endpoints (plain JSON): `GET /api/v1/chats` (list), `GET /api/v1/chats/{id}` (open), `DELETE /api/v1/chats/{id}`.

### 2.3 WebSocket (notifications only)

A WebSocket lives at `/ws` ([AppWebSocketHandler.java](../backend/central-server/src/main/java/com/proprofessor/server/websocket/AppWebSocketHandler.java)). The client connects on app load and keeps it alive with `ping` heartbeats. Its only job today is server→client broadcast of `notification.info` events. **It does not carry chat or audio** — chat is SSE, audio is plain REST.

### 2.4 Media Upload, Attachments & the Storage browser

1. **Frontend** uploads a file to `POST /api/v1/media/upload` ([MediaController.java](../backend/central-server/src/main/java/com/proprofessor/server/media/MediaController.java)).
2. **MediaService** forwards the bytes to the **Storage Server**, then persists only a reference row (storage UUID + metadata) in Postgres and returns the media id + a **direct Storage Server URL** ([`MediaService.toResponse`](../backend/central-server/src/main/java/com/proprofessor/server/media/MediaService.java)). The same `toResponse` also serializes attachments on chat-history load ([`ChatMapper`](../backend/central-server/src/main/java/com/proprofessor/server/chat/mapper/ChatMapper.java)), so every attachment the frontend sees already carries its download URL.
3. The returned media id is passed as `attachmentIds` in a subsequent chat send; `ChatService` links it to the user message.
4. Downloads are **not proxied**: the browser streams bytes straight from the Storage Server using the `url` from step 2 (range requests supported). Note `![[image.png]]` embeds resolve by *filename*, which storage can't look up — so Central Server resolves them **when it serves the note** and returns an `embedUrls` map (filename → direct storage URL) on the note payload; the frontend renders `<img>` straight from storage. Either way, file bytes never pass through the JVM.
5. **Browsing and deleting** happens in the frontend at **Settings → Storage** ([StoragePanel.tsx](../frontend/src/modules/settings/components/StoragePanel.tsx)) — the Storage Server has no UI of its own. `GET /api/v1/media` proxies the Storage Server's own paginated listing (the **filesystem** is the source of truth, so files with no Postgres row appear too), and `DELETE /api/v1/media/{storageId}` removes the file plus its reference row. Both go through Central Server because the Storage Server sends no CORS headers; only file bytes are fetched cross-origin. Keyed by **storage UUID**, not the `media` row id, since a listed file may have no row.
6. A delete is **refused with 409 while anything references the file** — a chat attachment (`message_attachments` has no cascade, so dropping the media would leave a dead link in history) or a note `![[file.png]]` embed, read from `note_links` (every note save rebuilds it via `NotesService.indexRefs`, AI edits and revision restores included). Note usage is credited only to the upload an embed actually resolves to — the **newest** with that filename, matching `MediaService.urlByFilename` — so re-uploading a filename leaves the superseded copy deletable. The same counts ride along on each `GET /api/v1/media` item as `usage: { chatMessages, notes }`, which the browser renders as an "In use" badge and a locked delete button, so a refusal is visible before you click.
7. Still uncovered: images embedded **by URL** (`![alt](http://…/api/media/{uuid}/file)`) are plain Markdown and leave no `note_links` row, so the guard can't see them.

### 2.5 Voice Chat (implemented)

Voice is wired up via two pass-through audio endpoints ([AudioController.java](../backend/central-server/src/main/java/com/proprofessor/server/audio/AudioController.java)) that forward to the AI Service's local STT/TTS:
- `POST /api/v1/audio/transcriptions` — multipart audio in → transcript text (Whisper/MLX).
- `POST /api/v1/audio/speech` — text in → WAV audio bytes (TTS/MLX).

The voice pipeline is **orchestrated on the frontend** ([VoiceBar.tsx](../frontend/src/modules/chat/components/VoiceBar.tsx), [ChatMessages.tsx](../frontend/src/modules/chat/components/ChatMessages.tsx)):
1. **Record** — `VoiceBar` captures one complete utterance via the `MediaRecorder` API (push-to-talk: record while active, tap stop to send) and shows a mic-reactive waveform.
2. **Input (branches on `inputModalities`)** — `handleUtterance` looks up the selected model's modalities:
   - **Text/Ollama models** — the blob is transcribed at `/api/v1/audio/transcriptions` and the transcript is sent as text through the normal SSE chat channel (§2.2).
   - **Audio-capable models** (`inputModalities` includes `audio`) — **no transcription**. The clip is converted to 16 kHz mono WAV on the frontend ([wav.ts](../frontend/src/modules/chat/wav.ts)), uploaded via the media path (§2.4), and the chat is sent with **empty text** and the returned id in `attachmentIds`.
3. **Synthesize** — when the text reply arrives, it is sent to `/api/v1/audio/speech` and the returned WAV is played via `AudioContext`, visualized as a colorful waveform. The spoken user turn is replayable in the transcript via an inline `<audio>` player (`MessageAttachments`).

The reply is always text → TTS, because **no model in this stack emits audio**. The `inputModalities` distinction only matters on the input side.

### 2.6 Direct Audio Input (implemented)

For audio-capable models, the spoken utterance reaches the model directly as an OpenAI `input_audio` content part instead of being transcribed to text first:

1. The clip arrives at the gateway through the **existing media-upload path** — no new wire field. `ChatService.streamReply` links it to the user message like any attachment.
2. `ChatService.withCurrentTurnAudio` runs **only when `provider == AI_SERVICE`**: it scans the current turn's attachments for `audio/*` media, fetches the bytes from the Storage Server, base64-encodes them, and rebuilds the **last (current)** user message in the history to carry one `AudioPart` per clip. Earlier history turns stay text-only — matching `mlx-vlm`'s "most recent media only" behavior.
3. [ChatCompletionClient.appendUserMessage](../backend/central-server/src/main/java/com/proprofessor/server/chat/provider/ChatCompletionClient.java) emits a multimodal user message (a text part when present, plus an `input_audio` part per clip via the OpenAI Java SDK) instead of the plain-string overload.

The spoken user turn is stored with **empty text content** (audio attachment only) — it is not also transcribed for storage. Gating is defensive: the frontend only takes the direct path for audio-capable models, and the gateway only forwards audio when the provider is `AI_SERVICE`, so a stray audio attachment can never reach a text-only provider. **Image** attachments are stored and displayed but still not forwarded to the model (a parallel gap that can reuse this same multimodal plumbing).

### 2.7 Conversation Inference Settings (persistence + change markers)

Each conversation persists its current inference settings on the `conversations` row, so reopening a chat restores the settings panel:

- **Persisted fields** — `max_tokens`, `temperature`, `top_p`, `repetition_penalty` (the four sampling params, `NOT NULL`), plus `verbose_enabled` / `thinking_enabled` (UI display toggles: show metrics / show reasoning). The four params are also sent every turn in the `POST /chats/send` body; `thinkingEnabled` rides along but is **stored only, never forwarded to the provider** (reasoning is gated for display, not generation — Ollama/AI Service always emit it).
- **Detection on send** — for an existing conversation, `ChatService` diffs the four sampling params against the stored values. On a change it (1) updates the conversation row, (2) inserts a `settings` **marker message** before the user turn, and (3) emits a `chat.settings` SSE frame. The display toggles persist silently (no marker). A brand-new conversation just records its initial settings — no marker.
- **The `settings` marker** is a `messages` row with role `settings`. Like `error`, it is persisted for the UI but excluded from `ChatService.MODEL_ROLES`, so it is **never replayed to the model**. The frontend renders it as a centered "Model settings changed" divider — live (spliced on the `chat.settings` frame) and on reload (returned by `GET /chats/{id}`).

### 2.8 Database schema & migrations

Postgres schema is a **consolidated Flyway migration** (`V1__init_schema.sql`) + **jOOQ** codegen.
One incremental migration currently rides alongside it: `V2__messages_fts.sql` adds
`messages.content_tsv` (a generated `tsvector` + GIN index) for the ⌘K palette's chat search,
mirroring `notes.content_tsv`. It stayed incremental rather than being folded into `V1` only
because `V1` was already applied and editing it would fail Flyway's checksum; fold it back at the
next clean rebuild. Because the dev DB is disposable (see [database-rules.md](../backend/central-server/docs/database-rules.md)), schema changes edit `V1` directly and recreate the DB rather than stacking incremental migrations. Workflow after a schema edit: clean/drop the DB → `task migrate` → `task codegen` → recompile. Tables: `models`, `conversations`, `messages`, `media`, `message_attachments`, the notes tables (`notes`, `tags`, `note_tags`, `note_links`, `note_revisions` — see [notes-flow.md](notes-flow.md)), the diagram tables (`diagram_folders`, `diagrams` — see [diagram-flow.md](diagram-flow.md)), and `app_settings` — all in `V1`.

### 2.8a Global search (⌘K)

One palette searches **both** notes and chats:
[SearchModal](../frontend/src/components/common/SearchModal.tsx), mounted in
[App.tsx](../frontend/src/App.tsx) so the shortcut works on any screen. It fires
`GET /api/v1/notes/search?q=` and `GET /api/v1/chats/search?q=` together (both local, so one
round of results rather than two) and lists notes above chats.

Chat search is Postgres FTS over **message content**, not the titles the sidebar happens to hold:
`ConversationRepository.search` uses `DISTINCT ON (c.id)` to collapse a conversation's many
matching messages to its best one, `ts_headline` for the excerpt shown in the result row, and
`ts_rank` for ordering. Title matches ride along in the same pass (rank 0, so they sort below real
content hits). Note-scoped conversations are excluded, exactly as in `findAll`.

**Neither sidebar carries a search box any more** — chat's could only filter already-loaded titles
while notes' ran a real server query, two behaviours behind two identical-looking inputs. ⌘K rather
than ⌘Space, which macOS reserves for Spotlight; the notes command palette kept ⌘P and gave up its
⌘K half.

### 2.9 Notes module

An Obsidian-like Markdown notes workspace at `/notes` (backend vertical
`com.proprofessor.server.notes`, frontend `modules/notes`): wiki-links/backlinks/embeds, tags,
Postgres full-text search, inline Mermaid diagrams, a graph view, and AI note actions
(local models) with reversible revision snapshots — a rewrite returns the whole note, while
summarize/continue return only delimited new text that the server splices in. A note-scoped chat
panel reuses the chat SSE endpoint with a per-turn `noteContext` and applies replies to the note
only on request. Full architecture and flow: [notes-flow.md](notes-flow.md).

### 2.10 Diagram module

A manual diagram editor at `/diagrams` (backend vertical `com.proprofessor.server.diagram`,
frontend `modules/diagram`): the user draws in an **Excalidraw** canvas and the scene JSON
(`{ type, elements, appState, files }`) is stored inline in Postgres like a note, with debounced
autosave and professional (non-hand-drawn) styling defaults. The sidebar organizes diagrams into
nested folders (`diagram_folders`) with drag-and-drop; deleting a folder or a diagram is refused
while any note still links to a diagram involved. Notes reference a standalone diagram with a
`[[Title.diagram]]` link that opens the diagram page; inline note diagrams use Mermaid.
There is no AI in diagrams. Full architecture and flow: [diagram-flow.md](diagram-flow.md).

## 3. Related Docs

- [frontend/docs/folder-structure.md](../frontend/docs/folder-structure.md) /
  [backend/central-server/docs/folder-structure.md](../backend/central-server/docs/folder-structure.md)
  — per-tier folder conventions (plus the backend's
  [logging-rules.md](../backend/central-server/docs/logging-rules.md) and
  [database-rules.md](../backend/central-server/docs/database-rules.md)).
- [project-rules.md](project-rules.md) — repository boundaries + when to edit directly vs. plan.
- [notes-flow.md](notes-flow.md) — the Notes module's architecture & flow (schema, link parsing,
  shared Markdown rendering, AI actions/revisions).
- [diagram-flow.md](diagram-flow.md) — the Diagram module's architecture & flow (Excalidraw scene
  format, save/load, `[[Title.diagram]]` links, Mermaid for inline note diagrams).
- [../skills/](../skills/README.md) — authoring skills for **external** AI models (paste-ready
  note files); the in-app AI prompts live in `NotesAiService`.
