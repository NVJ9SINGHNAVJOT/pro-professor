# Agent Guide — Pro Professor

Orientation for AI coding tools working in this monorepo.

| Where | What |
| --- | --- |
| [frontend/docs/](frontend/docs/folder-structure.md) | Frontend module architecture + conventions (React 19 SPA) |
| [backend/central-server/docs/](backend/central-server/docs/folder-structure.md) | Backend package-by-feature conventions, plus [logging-rules](backend/central-server/docs/logging-rules.md) and [database-rules](backend/central-server/docs/database-rules.md) |
| [docs/project-flow.md](docs/project-flow.md) | System architecture & flows (with [notes-flow](docs/notes-flow.md) and [diagram-flow](docs/diagram-flow.md)) |
| [skills/](skills/README.md) | Prompt packs for authoring paste-ready notes/`.diagram` files with any AI model |
| `plans/` | Handoff plans for changes that belong to **other repos** (gitignored, local-only) — not general documentation |

**Hard boundaries** (see [docs/project-rules.md](docs/project-rules.md)): edit only
`frontend/` and `backend/central-server/`. **Never** edit `backend/ai-service/` (a git
submodule with its own repo) or the storage-service (external `micro-yard` repo) — write a
plan into `plans/` instead.
