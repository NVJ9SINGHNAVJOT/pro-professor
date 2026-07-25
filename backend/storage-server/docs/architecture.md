# Architecture

One binary, zero external dependencies.

```
browser ──▶ central-server (:4000) ──JSON: upload, list, delete──▶ server (:9000) ──▶ filesystem
   └────────────── file bytes: GET /api/media/{id}/file ─────────────▶│    └─ storage/<category>/<uuid>/
```

## In Pro Professor

Inside the [pro-professor](../../../README.md) monorepo this service is the file store behind
`central-server`. This service has no UI of its own — the media browser lives in the React app
under **Settings → Storage**. Two callers reach `server` (:9000):

- **`central-server`** uploads bytes (`POST /api/media/upload`), lists them (`GET /api/media`)
  for the Settings browser, and deletes them (`DELETE /api/media/{id}`), keeping only the
  returned UUID + metadata in Postgres. This service sends no CORS headers, so every JSON call
  goes through `central-server`.
- **The browser** downloads bytes (`GET /api/media/{id}/file`) directly, using the URL
  `central-server` hands out — file bytes never round-trip through the Java gateway, and range
  requests let `<video>` / `<audio>` seek natively.

## Processes

| Binary   | Entry point   | Port (default) | Role                                                    |
| -------- | ------------- | -------------- | ------------------------------------------------------- |
| `server` | `cmd/server/` | `9000`         | The API. Owns all filesystem reads/writes and metadata. |

## Packages

- `internal/api/` — HTTP handlers: upload, paginated list, metadata, download, delete.
- `internal/storage/` — filesystem layout + metadata read/write. The only code that touches disk.
- `internal/models/` — the `Media` struct shared across handlers.
- `internal/middleware/` — structured request logging with a correlation ID.
- `pkg/uuid/` — UUID generation (`crypto/rand`).
- `pkg/env/` — the `.env` loader.
- `helper/` — response writers (JSON, paginated JSON, errors).

## Storage layout

Each upload gets its own UUID directory under a category folder, holding the file
plus a `meta.json` sidecar:

```
storage/images/a1b2c3d4-…/
├── photo.jpg
└── meta.json
```

Category is derived from the detected MIME type (`http.DetectContentType`, first
512 bytes). A failed upload cleans up its partial directory. The `storage/` tree
is created at startup and is gitignored.

## Configuration

The server loads `.env` from the working directory at startup (`env.LoadEnv`
from `github.com/navjot/storage-server/pkg/env`).
See the [README](../README.md#configuration) for the variable table.
