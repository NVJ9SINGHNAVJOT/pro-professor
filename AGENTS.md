# Agent Guide — Pro Professor

Orientation for AI coding tools working in this monorepo.

| Where | What |
| --- | --- |
| [frontend/docs/](frontend/docs/folder-structure.md) | Frontend module architecture + conventions (React 19 SPA) |
| [backend/central-server/docs/](backend/central-server/docs/folder-structure.md) | Backend package-by-feature conventions, plus [logging-rules](backend/central-server/docs/logging-rules.md) and [database-rules](backend/central-server/docs/database-rules.md) |
| [backend/storage-server/](backend/storage-server/README.md) | Local Go file-storage server — [architecture](backend/storage-server/docs/architecture.md) and [API](backend/storage-server/docs/api.md) (uploads + direct browser downloads) |
| [docs/project-flow.md](docs/project-flow.md) | System architecture & flows (with [notes-flow](docs/notes-flow.md) and [diagram-flow](docs/diagram-flow.md)) |
| [skills/](skills/README.md) | Prompt packs for authoring paste-ready notes with any AI model |
| `plans/` | Handoff plans for changes that belong to **other repos** (gitignored, local-only) — not general documentation |

**Hard boundaries** (see [docs/project-rules.md](docs/project-rules.md)): edit `frontend/`,
`backend/central-server/`, and `backend/storage-server/` directly. **Never** edit
`backend/ai-service/` (a git submodule with its own repo) — write a plan into `plans/` instead.
