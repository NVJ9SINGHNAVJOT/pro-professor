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

## Docs

- [docs/folder-structure.md](docs/folder-structure.md) — package conventions + jOOQ persistence rules.
- [docs/logging-rules.md](docs/logging-rules.md) — the request/response logging contract (read
  before adding endpoints; boundary logging is already built).
- [docs/database-rules.md](docs/database-rules.md) — Flyway/jOOQ workflow on the disposable dev DB.
- System flows: [project-flow.md](../../docs/project-flow.md),
  [notes-flow.md](../../docs/notes-flow.md), [diagram-flow.md](../../docs/diagram-flow.md).
