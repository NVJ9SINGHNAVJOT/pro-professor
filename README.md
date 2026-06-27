# Pro Professor

An AI-powered professor / chat application. This is a monorepo containing the web client,
the orchestrating backend, a local AI inference service, and a file storage service.

## Architecture

```text
pro-professor/
├── frontend/                 # React 19 + Vite + TypeScript SPA (the web client)
├── backend/
│   ├── central-server/       # Spring Boot 3.3 (Java 21) — main backend / orchestrator
│   ├── ai-service/           # Python / FastAPI — local MLX LLM inference (git submodule)
│   └── storage-service/      # Go 1.25 — file upload/storage service (git submodule)
└── docs/                     # design / planning notes
```

The **central-server** is the hub: the frontend talks to it over REST (`/api/v1`) and
WebSocket (`/ws`), and it coordinates PostgreSQL, Redis, Kafka, the **ai-service** (via an
OpenAI-compatible API), and the **storage-service**.

## Services

| Service           | Stack                                  | Default URL             | Role                                                                    |
| ----------------- | -------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `frontend`        | React 19, Vite, TS, Tailwind 4, Redux  | `http://localhost:5173` | Web client / chat UI                                                    |
| `central-server`  | Spring Boot 3.3, Java 21, jOOQ, Flyway | `http://localhost:4000` | Orchestrator; REST + WebSocket API, PostgreSQL/Redis/Kafka              |
| `ai-service`      | Python, FastAPI, MLX-LM                | `http://localhost:8000` | Local LLM inference + audio (Apple Silicon); OpenAI-compatible endpoint |
| `storage-service` | Go 1.25 (stdlib only)                  | `http://localhost:9000` | File upload, retrieval, and serving                                     |

### frontend

React 19 single-page app built with Vite. Uses Redux Toolkit for state, React Router for
routing, Tailwind 4 + shadcn/Radix UI for styling, and `react-markdown` for rendering chat
responses (with streaming/reasoning support). Talks to the central-server over REST and
WebSocket.

### central-server

The Spring Boot orchestrator and source of truth. Exposes the REST (`/api/v1`) and
WebSocket (`/ws`) APIs the frontend consumes, persists data in PostgreSQL (migrations via
Flyway, queries via jOOQ), caches with Redis, and uses Kafka for messaging. It calls the
ai-service through an OpenAI-compatible client (`openai-java`) for model inference and the
storage-service for file handling.

### ai-service

A Python / FastAPI service for running MLX-compatible LLMs locally on Apple Silicon Macs
(built on MLX-LM). Provides model management, an OpenAI-compatible chat endpoint (full and
streaming responses), audio routes, and a CLI to download/list/update/delete/chat with
models. Single machine, one model loaded at a time, local filesystem model storage.
Maintained in its own repository as a git submodule.

### storage-service

A lightweight Go file storage service using only the standard library (zero external
dependencies). Upload files over HTTP, retrieve them by ID, and serve them back — stored on
the local filesystem with JSON metadata alongside each upload. Maintained in its own
repository as a git submodule.

## Clone

`ai-service` and `storage-service` are git submodules, so clone with `--recurse-submodules`:

```bash
git clone --recurse-submodules <repo-url>

# already cloned without it?
git submodule update --init --recursive
```

## Getting started

Each service has its own README with full setup and run instructions:

- [frontend/README.md](frontend/README.md)
- [backend/central-server/README.md](backend/central-server/README.md)
- [backend/ai-service/README.md](backend/ai-service/README.md)
- [backend/storage-service/README.md](backend/storage-service/README.md)

Quick start (run each in its own terminal):

```bash
# frontend
cd frontend && npm install && npm run dev

# central-server (requires Postgres, Redis, Kafka running locally)
cd backend/central-server && ./mvnw spring-boot:run

# ai-service (Apple Silicon)
cd backend/ai-service && python -m app.main

# storage-service
cd backend/storage-service && task run   # or: go run ./cmd/server/
```

A root [Taskfile.yaml](Taskfile.yaml) provides shortcuts (`task server`, `task client`).

## Configuration

Every service ships a `.env.example`. Copy it to `.env` and adjust for your environment.
`.env` files are git-ignored; `.env.example` files are committed.
