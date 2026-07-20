# Pro Professor

**A fully local, multimodal AI workspace.** Chat, Obsidian-style notes, and a diagram
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
- **Diagram editor** — a hand-drawn diagram workspace built on [Excalidraw](https://github.com/excalidraw/excalidraw)
  with a clean, professional (non-sketchy) default style. Scenes are stored inline in Postgres like
  notes, with debounced autosave. Notes link to a standalone diagram via `[[Title.diagram]]`, and
  draw inline diagrams with Mermaid.

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
