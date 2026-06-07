# Central Server

The main backend for Pro Professor, built with **Spring Boot 3.3 (Java 21)**. It is the
orchestrator between the React frontend, PostgreSQL, Redis, Kafka, and the Python AI service.

This is **Phase 1**: a runnable scaffold with a health endpoint, a WebSocket endpoint, and
live connections to Postgres / Redis / Kafka. Persistence, REST CRUD, and AI streaming come
in later phases.

## Requirements

- **JDK 21** (LTS). Check with `java -version` → should show `21.x`.
  - Install via Homebrew: `brew install openjdk@21`
- PostgreSQL, Redis, and Kafka running locally (the server connects on startup).
- Maven is **not** required — use the bundled wrapper (`./mvnw`).

## Configuration

Config lives in `src/main/resources/application.yml` and reads environment variables with
sensible local defaults (`${VAR:default}`). The defaults already match a standard local
setup, so it runs without any env vars.

`.env.example` documents every variable. Spring Boot does **not** auto-load `.env`; if you
want non-default values, export them in your shell (or your IDE run config) before starting.

## Run

```bash
# from backend/central-server
./mvnw spring-boot:run
```

The server starts on **http://localhost:4000**.

## Verify

```bash
# App liveness (simple)
curl http://localhost:4000/health

# Dependency health — db, redis, and kafka should all be "UP"
curl http://localhost:4000/actuator/health

# WebSocket echo (needs Node's wscat: npx wscat -c ...)
npx wscat -c ws://localhost:4000/ws
```

## Project Structure

```
com.proprofessor.server/
├── Application.java        # entry point
├── config/                # CORS, WebSocket, type-safe properties
├── common/                # ApiResponse envelope + global exception handling
├── health/                # /health endpoint + custom Kafka health indicator
└── websocket/             # /ws handler (echo scaffold)
```

Each future feature (chat, model, ...) becomes its own package with a controller, service,
repository, `dto/`, `entity/`, `mapper/`, and `provider/` — see the project plan for the
layer-responsibility rules this codebase follows.

## Build

```bash
./mvnw clean compile     # compile
./mvnw clean package     # build runnable jar into target/
./mvnw test              # run tests
```
