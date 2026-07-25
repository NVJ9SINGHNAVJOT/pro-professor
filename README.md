# Pro Professor

**A fully local, multimodal AI workspace.** Chat, Obsidian-style notes, and a diagram
editor — text, voice, and file-attachment conversations with open-source LLMs running entirely on
your own machine, no cloud provider, no API keys, no data leaving the device.

Pro Professor is a polyglot monorepo: a React 19 SPA, a Spring Boot (Java 25) orchestration
gateway, and a Python/FastAPI inference service running MLX models on Apple Silicon, backed by
PostgreSQL and a standalone Go file-storage server. The browser talks to exactly one backend;
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
- **Attachment pipeline** — uploads stream through the gateway to a local Go storage server, which
  returns a direct URL; PostgreSQL holds only a reference row, never the bytes. Downloads then
  stream **straight from storage to the browser** — file bytes never pass through the JVM heap.
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
│   ├── ai-service/           # Python + FastAPI — local MLX inference (git submodule)
│   └── storage-server/       # Go 1.25 — local file storage (uploads + direct downloads)
├── docs/                     # system architecture + notes/diagram flow docs
├── skills/                   # paste-ready authoring packs for external AI models
├── scripts/                  # per-service setup scripts
└── AGENTS.md                 # orientation pointer table for AI coding tools
```

| Service           | Stack                                  | Default URL             | Role                                                     |
| ----------------- | -------------------------------------- | ----------------------- | -------------------------------------------------------- |
| `frontend`        | React 19, Vite, TS, Tailwind 4, Redux  | `http://localhost:5173` | Web client / chat UI                                     |
| `central-server`  | Spring Boot 3.5, Java 25, jOOQ, Flyway | `http://localhost:4000` | API gateway; REST + SSE + WebSocket, PostgreSQL          |
| `ai-service`      | Python, FastAPI, MLX-LM                | `http://localhost:8000` | Local LLM inference + STT/TTS (Apple Silicon)            |
| `storage-server`  | Go 1.25 (stdlib only)                  | `http://localhost:9000` | Local file storage — uploads + direct browser downloads  |

**`ai-service`** is a git submodule maintained in its own repository. **`storage-server`** is a
first-class service committed in this repo under `backend/storage-server/` (the browser downloads
files directly from it; central-server only records the reference and never proxies the bytes).

---

## Getting Started

**Prerequisites:** JDK 25, Node 20+, Python 3.11+, Go 1.25, PostgreSQL, Ollama, and an Apple
Silicon Mac (for MLX inference).

```bash
# 1. Clone with the ai-service submodule
git clone --recurse-submodules <repo-url>
cd pro-professor

# 2. Install dependencies + create each service's .env from its .env.example
task init

# 3. Adjust the generated .env files as needed (ports, DB, model paths, storage dir)
```

`task init` sets up the ai-service (submodule venv + dependencies) and installs the frontend and
central-server dependencies, creating each service's `.env` from its `.env.example` (existing
`.env` files are left untouched). The storage-server is committed in-repo and needs no fetch step —
it is a single Go module with zero external dependencies, so `task storage:run` builds it straight
from source.

### Run (each in its own terminal)

```bash
task frontend:dev     # Vite dev server               → http://localhost:5173
task backend:dev      # Spring Boot (needs Postgres)   → http://localhost:4000
task ai:run:api       # FastAPI inference (Apple Silicon) → http://localhost:8000
task storage:run      # Go storage server            → http://localhost:9000
```

Other handy shortcuts from the root [Taskfile.yaml](Taskfile.yaml): `task backend:migrate` /
`task backend:codegen` (Flyway + jOOQ), `task storage:build`, `task db:backup` / `task db:restore`.
Run `task -l` for the full list.

Per-service details:
[frontend](frontend/README.md) ·
[central-server](backend/central-server/README.md) ·
[ai-service](backend/ai-service/README.md) ·
[storage-server](backend/storage-server/README.md)
