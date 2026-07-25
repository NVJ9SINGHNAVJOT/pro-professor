# Storage Server

A lightweight personal file storage server written in Go using only the standard library. Upload files via HTTP, retrieve them by ID, and serve them back — all stored on the local filesystem with metadata tracked in JSON files alongside each upload.

> **Role in Pro Professor.** This is the file store for the [pro-professor](../../README.md) monorepo.
> `central-server` uploads bytes here and keeps only a reference (this service's UUID + metadata) in
> Postgres; the browser then **downloads files directly from this service** using a URL that
> `central-server` hands out — file bytes never round-trip through the Java gateway. Downloads are
> plain public `GET`s by UUID with HTTP range support, so `<img>` / `<audio>` / `<video>` stream and
> seek straight from here. It has no dependency on `central-server` and no UI of its own — files are
> browsed and deleted from the React app under **Settings → Storage**, which reaches the endpoints
> below through `central-server`.

## Tech Stack

| Layer       | Technology                                                  |
| ----------- | ----------------------------------------------------------- |
| Language    | [Go 1.25](https://go.dev)                                   |
| HTTP server | `net/http` — stdlib router with Go 1.22+ pattern matching   |
| Storage     | Local filesystem via `os`, `io`, `path/filepath`            |
| Metadata    | JSON files via `encoding/json`                              |
| MIME detect | `http.DetectContentType` (reads first 512 bytes)            |
| UUID        | `crypto/rand` — no external package                         |
| Logging     | `log/slog` — structured JSON logs                           |
| Config      | `.env` file parsed with `bufio` — no external package       |

> Zero external dependencies. Everything is Go standard library.

## Requirements

- Go 1.25+
- [Task](https://taskfile.dev) (optional, for `task` commands)

## Quick Start

```bash
cp .env.example .env   # edit PORT if needed
task run               # or: go run ./cmd/server/
```

The server starts on the port set in `.env` (default `9000`).

## Configuration

Copy `.env.example` to `.env` and set the values:

| Variable | Default | Description                    |
| -------- | ------- | ------------------------------ |
| `PORT`   | `9000`  | Port the API server listens on |

## Available Tasks

| Command      | Description                                    |
| ------------ | ---------------------------------------------- |
| `task run`   | Run the API server                             |
| `task start` | Build and run the compiled API server binary   |
| `task build` | Build the server binary to `bin/`              |
| `task check` | Format, vet, and build (run before committing) |
| `task fmt`   | Format all Go source files                     |
| `task vet`   | Run `go vet` across all packages               |
| `task tidy`  | Tidy `go.mod`                                  |
| `task clean` | Remove build artifacts                         |

## Project Structure

A single Go module (`github.com/navjot/storage-server`) with no external dependencies —
nothing to fetch, no `go.sum`.

```text
storage-server/
├── cmd/
│   └── server/          # API server entry point
├── internal/            # Server-side logic
│   ├── api/             # HTTP handlers (paginated list, metadata, download, delete)
│   ├── middleware/      # Structured request logging with a correlation ID
│   ├── models/          # Media struct
│   └── storage/         # Filesystem and metadata logic
├── pkg/
│   ├── env/             # .env loader
│   └── uuid/            # UUID generation (crypto/rand)
├── helper/              # Response helpers (JSON, paginated JSON, error writers)
├── storage/             # Uploaded files (gitignored, created at startup)
│   ├── images/
│   ├── videos/
│   ├── audio/
│   ├── documents/
│   └── others/
├── docs/
│   ├── api.md           # Full API reference
│   └── architecture.md  # How the pieces fit together
├── .env.example
└── Taskfile.yaml
```

## Storage Layout

Each uploaded file gets its own directory named by UUID:

```text
storage/
└── images/
    └── a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789/
        ├── photo.jpg
        └── meta.json
```

If an upload fails midway, the partial directory is automatically cleaned up.

## Browsing uploads

There is no dashboard here. Uploaded files are browsed, previewed, downloaded and deleted from the
React app at **Settings → Storage**, which calls `central-server`'s `GET /api/v1/media` and
`DELETE /api/v1/media/{storageId}` — these forward to the endpoints below. Deleting a file that is
still attached to a chat message is refused by `central-server`, not here.

## API

See [docs/api.md](docs/api.md) for the full endpoint reference.

### Quick reference

| Method   | Path                    | Description                                      |
| -------- | ----------------------- | ------------------------------------------------ |
| `GET`    | `/health`               | Health check                                     |
| `POST`   | `/api/media/upload`     | Upload a file                                    |
| `GET`    | `/api/media`            | List files (paginated — `limit`, `offset`)       |
| `GET`    | `/api/media/{id}`       | Get file metadata                                |
| `GET`    | `/api/media/{id}/file`  | Download the file                                |
| `DELETE` | `/api/media/{id}`       | Delete a file                                    |
