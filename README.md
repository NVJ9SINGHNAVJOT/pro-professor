# Pro Professor

An AI-powered professor / chat application. This is a monorepo containing the web client,
the orchestrating backend, and a local AI inference service. File storage is provided by an
external local service (`micro-yard`).

## Features

A fully local AI chat app — every model runs on your own machine, nothing leaves the device.

- **Chat with local models** — open-source models via **Ollama** and MLX models via the local
  **ai-service**, all in one chat UI. ai-service models are loaded into memory on demand.
- **Streaming replies** — responses stream token-by-token over Server-Sent Events, with a live
  view of the model's reasoning ("thinking") and optional per-response metrics.
- **Voice chat** — push-to-talk speech is transcribed locally (Whisper/MLX); for audio-capable
  models the clip is sent to the model directly. Replies are spoken back with local
  text-to-speech and a live waveform.
- **Attachments** — upload files with a message; the bytes live in the storage service and the
  chat keeps only a reference.
- **Per-conversation settings** — sampling params (max tokens, temperature, top-p, repetition
  penalty) and display toggles are saved per conversation and restored on reopen; mid-chat
  changes are marked inline.
- **Conversation management** — chats are persisted in PostgreSQL with auto-derived titles;
  list, open, and delete them.

## Architecture

```text
pro-professor/
├── frontend/                 # React 19 + Vite + TypeScript SPA (the web client)
├── backend/
│   ├── central-server/       # Spring Boot 3.5 (Java 25) — main backend / orchestrator
│   └── ai-service/           # Python / FastAPI — local MLX LLM inference (git submodule)
└── docs/                     # design / planning notes
```

The **central-server** is the hub: the frontend talks to it over REST (`/api/v1`) and
WebSocket (`/ws`), and it coordinates PostgreSQL, the **ai-service** (via an
OpenAI-compatible API), and the **storage-service**.

## Services

| Service           | Stack                                  | Default URL             | Role                                                                    |
| ----------------- | -------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `frontend`        | React 19, Vite, TS, Tailwind 4, Redux  | `http://localhost:5173` | Web client / chat UI                                                    |
| `central-server`  | Spring Boot 3.5, Java 25, jOOQ, Flyway | `http://localhost:4000` | Orchestrator; REST + WebSocket API, PostgreSQL                          |
| `ai-service`      | Python, FastAPI, MLX-LM                | `http://localhost:8000` | Local LLM inference + audio (Apple Silicon); OpenAI-compatible endpoint |
| `storage-service` | Go 1.25 (stdlib only)                  | `http://localhost:9000` | File upload, retrieval, and serving (external; from `micro-yard`)       |

### frontend

React 19 single-page app built with Vite. Uses Redux Toolkit for state, React Router for
routing, Tailwind 4 + shadcn/Radix UI for styling, and `react-markdown` for rendering chat
responses (with streaming/reasoning support). Talks to the central-server over REST and
WebSocket.

### central-server

The Spring Boot orchestrator and source of truth. Exposes the REST (`/api/v1`) and
WebSocket (`/ws`) APIs the frontend consumes, and persists data in PostgreSQL (migrations via
Flyway, queries via jOOQ). It calls the ai-service through an OpenAI-compatible client
(`openai-java`) for model inference and the storage-service for file handling.

### ai-service

A Python / FastAPI service for running MLX-compatible LLMs locally on Apple Silicon Macs
(built on MLX-LM). Provides model management, an OpenAI-compatible chat endpoint (full and
streaming responses), audio routes, and a CLI to download/list/update/delete/chat with
models. Single machine, one model loaded at a time, local filesystem model storage.
Maintained in its own repository as a git submodule.

### storage-service

A lightweight Go file storage service using only the standard library (zero external
dependencies). Upload files over HTTP, retrieve them by ID, and serve them back — stored on
the local filesystem with JSON metadata alongside each upload. Lives in the external
**`micro-yard`** repo (a local multi-service monorepo) — it is not vendored here, but
`task setup` fetches it into `backend/storage-service/` (see below).

## Clone

`ai-service` is a git submodule, so clone with `--recurse-submodules`:

```bash
git clone --recurse-submodules <repo-url>

# already cloned without it?
git submodule update --init --recursive
```

Then pull in the storage-service:

```bash
task setup
```

This sparse-fetches the three subtrees storage-service needs out of the `micro-yard` repo —
the service itself, the `go-shared` module it imports, and the `ui-shared` design assets its
web dashboard embeds — and assembles them into `backend/storage-service/` (git-ignored),
generating a `go.work` so the modules resolve in the flat layout. Re-run `task setup` any
time to pull the latest storage-service; your `.env` and uploaded files under `storage/` are
preserved.

If the layout changes on the `micro-yard` side, update the config block at the top of
[scripts/setup-storage-service.sh](scripts/setup-storage-service.sh) — the script fails with
an explicit message when a subtree it expects is gone.

## Getting started

Each service has its own README with full setup and run instructions:

- [frontend/README.md](frontend/README.md)
- [backend/central-server/README.md](backend/central-server/README.md)
- [backend/ai-service/README.md](backend/ai-service/README.md)
- `storage-service` — run `task setup`, then see `backend/storage-service/README.md`

Quick start (run each in its own terminal):

```bash
# frontend
cd frontend && npm install && npm run dev

# central-server (requires Postgres running locally)
cd backend/central-server && ./mvnw spring-boot:run

# ai-service (Apple Silicon)
cd backend/ai-service && python -m app.main

# storage-service (after `task setup`)
cd backend/storage-service && task run   # or: go run ./cmd/server/
```

A root [Taskfile.yaml](Taskfile.yaml) provides shortcuts (`task setup`, `task server`,
`task client`, `task storage`).

## Configuration

Every service ships a `.env.example`. Copy it to `.env` and adjust for your environment.
`.env` files are git-ignored; `.env.example` files are committed.
