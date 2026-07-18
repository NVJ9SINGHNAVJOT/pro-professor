# Pro Professor

**A fully local, multimodal AI workspace.** Chat, Obsidian-style notes, and an AI-native diagram
editor — text, voice, and file-attachment conversations with open-source LLMs running entirely on
your own machine, no cloud provider, no API keys, no data leaving the device.

Pro Professor is a polyglot monorepo: a React 19 SPA, a Spring Boot (Java 25) orchestration
gateway, and a Python/FastAPI inference service running MLX models on Apple Silicon, backed by
PostgreSQL and a standalone Go file-storage service. The browser talks to exactly one backend;
the gateway fans out to everything else.

---

## Highlights

- **Token-by-token streaming** over Server-Sent Events, including live model reasoning
  ("thinking") and per-response performance metrics (tokens/sec, context usage).
- **Two inference backends, one interface** — Ollama (open-source models) and a local MLX
  service are both driven through a single OpenAI-compatible client; the gateway swaps only the
  base URL, so adding a provider is configuration, not code.
- **Voice chat with local STT/TTS** — push-to-talk capture, local Whisper/MLX transcription,
  local speech synthesis, and a live mic-reactive waveform. Zero network round-trips.
- **Native multimodal input** — for audio-capable models the raw clip is passed straight to the
  model as an OpenAI `input_audio` content part, skipping transcription entirely.
- **Attachment pipeline** — uploads stream through the gateway to a dedicated storage service;
  PostgreSQL holds only a reference row, never the bytes.
- **Per-conversation inference settings** — sampling parameters are persisted per chat, restored
  on reopen, and mid-conversation changes are diffed and rendered as inline markers in the
  transcript.
- **Production-minded gateway** — request-ID correlation across logs (MDC), clean mid-stream
  abort handling, actuator health checks, Flyway migrations, and compile-time-safe SQL via jOOQ.
- **Obsidian-style notes** — `[[wiki-links]]`, `![[embeds]]`, backlinks, tags, full-text search,
  a Mermaid-rendered graph view, and revision history; AI actions (rewrite / summarize /
  continue) stream into the editor over the same SSE pipeline as chat.
- **AI-native diagram editor** — a `.diagram` document format that separates AI-owned semantics
  (nodes/edges) from user-owned layout (positions), so an AI edit can add to a diagram but never
  move a node you've placed by hand. Every change, manual or AI, is an invertible command, giving
  free undo/redo.

---

## Tech Stack

| Layer     | Technologies                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite, Redux Toolkit, React Router, Tailwind 4, Radix / shadcn, Mermaid, React Flow, ajv, Vitest |
| Gateway   | Java 25, Spring Boot 3.5, jOOQ, Flyway, OpenAI Java SDK, SSE, WebSocket, Actuator                                     |
| Inference | Python, FastAPI, MLX-LM / MLX-VLM, Whisper (STT), MLX TTS                                                             |
| Storage   | Go 1.25 (standard library only, zero dependencies)                                                                    |
| Data      | PostgreSQL                                                                                                            |
| Tooling   | Maven, npm, Taskfile, ESLint, Prettier, OWASP Dependency-Check                                                        |

---

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

---

## Repository Layout

```text
pro-professor/
├── frontend/                 # React 19 + Vite + TypeScript SPA
├── backend/
│   ├── central-server/       # Spring Boot 3.5 (Java 25) — API gateway / orchestrator
│   └── ai-service/           # Python + FastAPI — local MLX inference (git submodule)
├── docs/                     # system architecture + notes/diagram flow docs
├── skills/                   # paste-ready authoring packs for external AI models
├── scripts/                  # setup + storage-service bootstrap
└── AGENTS.md                 # orientation pointer table for AI coding tools
```

| Service           | Stack                                  | Default URL             | Role                                                     |
| ----------------- | -------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `frontend`        | React 19, Vite, TS, Tailwind 4, Redux  | `http://localhost:5173` | Web client / chat UI                                     |
| `central-server`  | Spring Boot 3.5, Java 25, jOOQ, Flyway | `http://localhost:4000` | API gateway; REST + SSE + WebSocket, PostgreSQL          |
| `ai-service`      | Python, FastAPI, MLX-LM                | `http://localhost:8000` | Local LLM inference + STT/TTS (Apple Silicon)            |
| `storage-service` | Go 1.25 (stdlib only)                  | `http://localhost:9000` | File upload / retrieval (external; from `micro-yard`)    |

**`ai-service`** is a git submodule maintained in its own repository. **`storage-service`** lives in
the external **`micro-yard`** monorepo and is fetched into `backend/storage-service/` (git-ignored)
by `task setup`.

---

## Getting Started

**Prerequisites:** JDK 25, Node 20+, Python 3.11+, Go 1.25, PostgreSQL, Ollama, and an Apple
Silicon Mac (for MLX inference).

```bash
# 1. Clone with the ai-service submodule
git clone --recurse-submodules <repo-url>
cd pro-professor

# 2. Fetch the storage-service out of micro-yard
task setup

# 3. Configure — every service ships a .env.example
cp .env.example .env   # repeat per service, then adjust
```

`task setup` sparse-fetches the three subtrees storage-service needs from `micro-yard` (the service
itself, the `go-shared` module it imports, and the `ui-shared` assets its dashboard embeds),
assembles them into `backend/storage-service/`, and generates a `go.work` so the modules resolve in
the flat layout. Re-run it any time to pull the latest; your `.env` and uploaded files under
`storage/` are preserved. If the `micro-yard` layout changes, update the config block at the top of
[scripts/setup-storage-service.sh](scripts/setup-storage-service.sh) — the script fails loudly when
a subtree it expects is gone.

### Run (each in its own terminal)

```bash
cd frontend               && npm install && npm run dev
cd backend/central-server && ./mvnw spring-boot:run      # requires Postgres
cd backend/ai-service     && python -m app.main          # Apple Silicon
cd backend/storage-service && task run
```

A root [Taskfile.yaml](Taskfile.yaml) provides shortcuts: `task setup`, `task server`,
`task client`, `task storage`, plus `task migrate` / `task codegen` for Flyway + jOOQ.

Per-service setup details:
[frontend](frontend/README.md) ·
[central-server](backend/central-server/README.md) ·
[ai-service](backend/ai-service/README.md) ·
`storage-service` (see its README after `task setup`)
