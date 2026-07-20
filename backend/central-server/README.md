# Central Server

The gateway and orchestration layer of **Pro Professor**, built with **Spring Boot 3.5**
(**Java 25**). The browser talks only to this service; it fans out to PostgreSQL, Kafka,
**Ollama**, the Python **AI service** (MLX), and the external Go **storage-service**. Chat,
notes-AI and diagram-AI responses stream back over **SSE**; persistence is **jOOQ** over
**Flyway**-migrated Postgres (no JPA).

## Requirements

- **JDK 25** — check with `java -version`.
- **PostgreSQL** and **Kafka** running locally (the server connects on startup).
- [Task](https://taskfile.dev) for the dev workflow (`brew install go-task`); Maven is **not**
  required — the bundled wrapper (`./mvnw`) is used underneath.
- Optional at runtime: Ollama and the AI service (model calls fail gracefully without them).

## Configuration

Config lives in `src/main/resources/application.yml` and reads environment variables with
sensible local defaults (`${VAR:default}`), so it runs without any env vars. `.env.example`
documents every variable; the `task` commands load `.env` automatically (Spring itself does
**not** auto-load it).

## Run & build

```bash
# from backend/central-server
task dev        # run with spring-boot:run (devtools reload)
task migrate    # apply Flyway migrations
task codegen    # regenerate jOOQ sources from the current schema
task build      # package the runnable jar (skips tests)
task start      # run the packaged jar
task audit      # dependency vulnerability check
```

The server starts on **http://localhost:4000**.

After any schema change: drop/clean the DB → `task migrate` → `task codegen` → recompile
(details in [docs/database-rules.md](docs/database-rules.md)).

## Verify

```bash
curl http://localhost:4000/health            # app liveness
curl http://localhost:4000/actuator/health   # db + kafka should be "UP"
```

## Project structure

Package-by-feature (vertical slices) — see [docs/folder-structure.md](docs/folder-structure.md):

```text
com.proprofessor.server/
├── Application.java   # entry point
├── audio/             # STT/TTS pass-through to the AI service
├── chat/              # conversations, SSE streaming, OpenAI-compatible provider client
├── common/            # ApiResponse envelope, exceptions, logging boundary, shared db rows
├── config/            # CORS, WebSocket, executors, type-safe properties
├── diagram/           # diagram CRUD + AI edit route (see docs/diagram-flow.md)
├── health/            # /health + Kafka health indicator
├── media/             # upload/download proxy to the storage-service
├── model/             # model discovery/activation across Ollama + AI service
├── notes/             # notes CRUD, links/tags/search + AI note actions
└── websocket/         # /ws notification channel
```

## System Design

### Topology

The browser has exactly one dependency: the central server. Every other service is private to the
backend, which keeps auth, validation, and persistence in a single enforceable choke point and
lets inference or storage be swapped without touching the client.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser — React 19 SPA (:5173)                                              │
│  chat UI · streaming renderer · voice recorder/player · settings panel       │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │ REST /api/v1  +  SSE (chat stream)           │ WS /ws
                ▼                                              ▼ (notifications)
┌──────────────────────────────────────────────────────────────────────────────┐
│  Central Server — Spring Boot 3.5 / Java 25 (:4000)          ← API GATEWAY   │
│                                                                              │
│   ChatService   ModelService   MediaService   AudioService                   │
│   • conversation lifecycle & title derivation                                │
│   • history assembly + multimodal message construction                       │
│   • provider routing (Ollama ⇄ AI Service)                                   │
│   • SSE fan-out on a dedicated executor pool                                 │
│   • request-ID correlation (MDC), error persistence, abort handling          │
└───────┬──────────────────────┬──────────────────────┬────────────────────────┘
        │ jOOQ / JDBC          │ OpenAI-compatible    │ HTTP
        ▼                      ▼ /v1/chat/completions ▼
┌───────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ PostgreSQL    │   │ AI Service (:8000)   │   │ Storage Service      │
│               │   │ FastAPI · MLX-LM     │   │ (:9000) Go, stdlib   │
│ conversations │   │ MLX-VLM · Whisper    │   │                      │
│ messages      │   │ STT/TTS · model mgmt │   │ file bytes on disk   │
│ media refs    │   └──────────────────────┘   │ + JSON metadata      │
│ models        │   ┌──────────────────────┐   └──────────────────────┘
│ attachments   │   │ Ollama (:11434)      │
└───────────────┘   │ open-source models   │
                    └──────────────────────┘
```

### Key design decisions

**SSE for generation, not WebSocket.** Token streaming is strictly server→client and
request-scoped, which is exactly SSE's shape. It rides on plain HTTP (no upgrade handshake, no
custom framing, no reconnect state machine) and each stream is naturally tied to one request's
lifecycle — so a client abort surfaces as a broken pipe the server can act on immediately. The
WebSocket at `/ws` is kept for the one case SSE can't serve: unsolicited server-push
notifications outside any request.

**A single provider abstraction over two very different engines.** Ollama and the MLX service
both expose OpenAI-compatible `/v1/chat/completions`, so `ChatCompletionClient` drives both
through the OpenAI Java SDK and switches only the base URL by provider enum. Provider-specific
quirks are isolated at the edges — Ollama doesn't report input modalities, so the client injects
a `["text"]` default, letting the rest of the system treat modality as a first-class, uniform
field.

**Typed, discriminated stream frames.** Every SSE event carries a `type`, so one channel
multiplexes the whole turn without out-of-band coordination:

| Frame            | Payload                                                        |
| ---------------- | -------------------------------------------------------------- |
| `chat.start`     | conversation + message ids (client swaps optimistic ids)       |
| `chat.chunk`     | a token delta of the reply                                     |
| `chat.thinking`  | a token delta of the model's reasoning trace                   |
| `chat.settings`  | mid-conversation sampling-parameter change marker              |
| `chat.metrics`   | tokens/sec, token counts, context usage                        |
| `chat.title`     | auto-derived conversation title                                |
| `chat.transcript`| STT result for a spoken turn                                   |
| `chat.done`      | terminal success                                               |
| `chat.error`     | user-facing message + `requestId` for log correlation          |

**Bytes and references are stored separately.** Uploads are proxied to the storage service, which
returns a UUID; PostgreSQL persists only a `media` reference row plus a `message_attachments` link.
Downloads are proxied back through `GET /api/v1/media/{id}/file`, so the browser never addresses
the storage service directly and the blob layer stays swappable (local disk today, object storage
tomorrow) behind a stable API.

**Multimodal input without a new wire format.** An audio-capable model receives the spoken clip
directly rather than a transcript. The clip travels the ordinary media-upload path; at send time
the gateway detects `audio/*` attachments on the *current* turn, fetches the bytes, base64-encodes
them, and rebuilds that message as a multimodal OpenAI content array. Earlier turns stay text-only
— matching MLX-VLM's "most recent media only" contract — and the forwarding is provider-gated so a
stray clip can never reach a text-only engine.

**Non-model message roles.** `error` and `settings` rows live in the `messages` table so the UI can
replay a faithful transcript on reload, but they're excluded from the roles sent to the model. The
transcript and the model's context are deliberately different views of the same table.

**jOOQ over JPA.** Queries are hand-written, type-safe SQL generated from the live schema at build
time — no lazy-loading surprises, no N+1s hidden behind an ORM, and schema drift becomes a
compile error rather than a runtime one.

### Chat request lifecycle

```text
User submits prompt
  │
  ├─▶ POST /api/v1/chats/send ──▶ ChatController returns SseEmitter immediately,
  │                               hands generation to chatStreamExecutor
  │
  ├─▶ ChatService
  │     1. resolve or create conversation (derive title from first message)
  │     2. persist user message; link attachment ids
  │     3. diff sampling params vs. stored → on change: update row,
  │        insert `settings` marker, emit chat.settings
  │     4. load history (model-visible roles only)
  │     5. AI Service model? → ensure it's loaded into VRAM (lazy, just-in-time)
  │     6. attach current-turn audio as input_audio parts (AI Service only)
  │
  ├─▶ ChatCompletionClient ──▶ Ollama | AI Service  (OpenAI-compatible, streaming)
  │         │
  │         └─▶ deltas ──▶ chat.chunk / chat.thinking frames ──▶ browser renders live
  │
  ├─▶ persist assembled assistant reply
  └─▶ chat.metrics → chat.done

  Client aborts mid-stream (Stop / chat switch / unmount)
      └─▶ ClientDisconnectedException → generation cancelled, no orphaned reply row
  Generation fails
      └─▶ `error` row persisted + chat.error frame carrying requestId (MDC-correlated)
```

### Data model

```text
models ──< conversations ──< messages ──< message_attachments >── media
```

- **`models`** — one row per `(provider, name)`; conversations point at it, so the model used for
  any chat is always known.
- **`conversations`** — title, mode, and the current inference settings (`max_tokens`,
  `temperature`, `top_p`, `repetition_penalty`) plus display toggles, restored on reopen.
- **`messages`** — `user` / `assistant` / `system` / `error` / `settings`, CHECK-constrained;
  cascade-deleted with the conversation.
- **`media`** — storage UUID, filename, MIME type, size, category. Bytes never touch Postgres.
- **`message_attachments`** — many-to-many link between messages and media.

Schema is versioned with **Flyway** and mirrored into type-safe **jOOQ** sources at build time.

### API surface

| Method   | Endpoint                        | Purpose                                  |
| -------- | ------------------------------- | ---------------------------------------- |
| `POST`   | `/api/v1/chats/send`            | Send a message; returns an SSE stream    |
| `GET`    | `/api/v1/chats`                 | List conversations                       |
| `GET`    | `/api/v1/chats/{id}`            | Open a conversation with full transcript |
| `DELETE` | `/api/v1/chats/{id}`            | Delete a conversation                    |
| `GET`    | `/api/v1/models/all`            | Aggregated models (Ollama + AI Service)  |
| `POST`   | `/api/v1/models/load`           | Load an MLX model into memory            |
| `POST`   | `/api/v1/media/upload`          | Upload an attachment                     |
| `GET`    | `/api/v1/media/{id}/file`       | Download an attachment (proxied)         |
| `POST`   | `/api/v1/audio/transcriptions`  | Speech → text (local Whisper/MLX)        |
| `POST`   | `/api/v1/audio/speech`          | Text → speech (local TTS, WAV)           |
| `GET`    | `/api/v1/health`                | Service health                           |
| `WS`     | `/ws`                           | Server→client notifications              |


## Docs

- [docs/folder-structure.md](docs/folder-structure.md) — package conventions + jOOQ persistence rules.
- [docs/logging-rules.md](docs/logging-rules.md) — the request/response logging contract (read
  before adding endpoints; boundary logging is already built).
- [docs/database-rules.md](docs/database-rules.md) — Flyway/jOOQ workflow on the disposable dev DB.
- System flows: [project-flow.md](../../docs/project-flow.md),
  [notes-flow.md](../../docs/notes-flow.md), [diagram-flow.md](../../docs/diagram-flow.md).
