# Project Rules

Project-specific rules for `pro-professor`. These complement the general behavioral
guidelines an AI tool loads for this repo.

> **Per-tier conventions live with their tier** (loaded via the repo's agent config):
>
> - Frontend structure & rules → [frontend/docs/folder-structure.md](../frontend/docs/folder-structure.md)
> - Backend structure & rules → [backend/central-server/docs/folder-structure.md](../backend/central-server/docs/folder-structure.md)
> - Backend logging contract → [backend/central-server/docs/logging-rules.md](../backend/central-server/docs/logging-rules.md)
> - Backend database/migration workflow → [backend/central-server/docs/database-rules.md](../backend/central-server/docs/database-rules.md)
>
> This file keeps only what is session-level: **where changes are allowed** and how to hand off
> work that belongs to another repo.

## Repository boundaries — where changes are allowed

`pro-professor` is a monorepo umbrella. Most of it — `frontend/`, `backend/central-server/`, and
`backend/storage-server/` — lives in **this** repo and is edited directly. The one exception is
`backend/ai-core/`, a **git submodule maintained in its own repository with its own agent
config**. This decides **where** a change is made and **how** — edit code directly, or write a plan
for another session.

| Path                        | Lives in         | From a `pro-professor` session |
| --------------------------- | ---------------- | ------------------------------ |
| `frontend/`                 | this repo        | **Edit directly**              |
| `backend/central-server/`   | this repo        | **Edit directly**              |
| `backend/storage-server/`   | this repo        | **Edit directly**              |
| `backend/ai-core/`       | submodule repo   | **Plan only — do not edit**    |

**Edit directly.** `frontend/`, `backend/central-server/`, and `backend/storage-server/` are part
of this repository — make code changes here as normal, following each tier's docs (the frontend and
central-server keep a `docs/folder-structure.md`; the storage-server has its own
[README](../backend/storage-server/README.md) and [docs/](../backend/storage-server/docs/)).

**Plan only (never touch the files).** `backend/ai-core/` (Python) is vendored as a git submodule
with its own repository and agent guidelines. Do **not** edit its code from a `pro-professor`
session — it gets its own dedicated session where the real work happens.

When a task needs a change inside the submodule service, the deliverable is a **task-requirements
plan**, not code:

1. Write a markdown plan under `plans/` — the user's handoff folder for these plans (e.g.
   `plans/<feature>-plan.md`; the folder is **gitignored**, local-only). The user picks it up
   from `plans/` and carries it into the submodule session; a plan is removed once it has been
   implemented.
2. Name the **target repo** at the top (`ai-core`).
3. Capture *what* to change and *why* — requirements, endpoints, request/response contracts,
   the files or areas to touch — with enough detail that a fresh session opened in that repo can
   implement it. Do **not** assume this repo's folder/style conventions apply there; that repo's
   own agent config governs its code.
4. The user opens a separate session inside the submodule repo and implements the plan there.

**Cross-repo features** (a change spanning `central-server`/`frontend`/`storage-server` *and* the
`ai-core` submodule): implement the in-repo side here directly, and write a plan md for the
submodule side. Spell out the shared contract (API path, payload fields, SSE frame shape, etc.) in
both places so the two sessions stay in sync.

**Why:** the submodule service is an independent repo with its own history and conventions; editing
its files from here would bypass its agent rules and desync the submodule pointer. A plan md is the
clean hand-off boundary.
