# Pro Professor

An AI-powered professor / chat application. This is a monorepo containing the web client,
the orchestrating backend, and a Python AI service.

## Architecture

```text
pro-professor/
├── frontend/                 # React 19 + Vite + TypeScript SPA (the web client)
├── backend/
│   ├── central-server/       # Spring Boot 3.3 (Java 21) — main backend / orchestrator
│   └── ai-service/           # Python / FastAPI — LLM inference (separate repo, git submodule)
└── .gitignore                # single, repo-wide ignore file
```

The **central-server** is the hub: the frontend talks to it over REST (`/api/v1`) and
WebSocket (`/ws`), and it coordinates PostgreSQL, Redis, Kafka, the local Ollama runtime,
and the Python **ai-service**.

| Service          | Stack                               | Default URL               |
| ---------------- | ----------------------------------- | ------------------------- |
| frontend         | React 19, Vite, TS, Tailwind, Redux | `http://localhost:5173`   |
| central-server   | Spring Boot 3.3, Java 21            | `http://localhost:4000`   |
| ai-service       | Python, FastAPI                     | `http://localhost:8000`   |

## Clone

`ai-service` is a git submodule, so clone with `--recurse-submodules`:

```bash
git clone --recurse-submodules <repo-url>

# already cloned without it?
git submodule update --init --recursive
```

## Getting started

Each service has its own README with full setup and run instructions:

- [frontend/README.md](frontend/README.md)
- [backend/central-server/README.md](backend/central-server/README.md)
- `backend/ai-service` — see its own repository

Quick start (run each in its own terminal):

```bash
# frontend
cd frontend && npm install && npm run dev

# central-server (requires Postgres, Redis, Kafka running locally)
cd backend/central-server && ./mvnw spring-boot:run
```

## Configuration

Every service ships a `.env.example`. Copy it to `.env` and adjust for your environment.
`.env` files are git-ignored; `.env.example` files are committed.
