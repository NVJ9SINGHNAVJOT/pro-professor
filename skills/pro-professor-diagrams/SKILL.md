---
name: pro-professor-diagrams
description: Author or edit Pro Professor .diagram JSON documents (a semantic/layout-separated DiagramBundle). Use when asked to produce a diagram file the user will import into Pro Professor, or to modify a pasted .diagram JSON.
---

# Writing a Pro Professor `.diagram` document

You are authoring a **DiagramBundle** — the JSON document behind Pro Professor's diagrams.
The user imports your output via **Diagrams → Import** (it is validated before anything is
created, so an invalid document is rejected with the reason).

## Output contract

- Respond with **ONLY one JSON object** — no prose, no code fence.
- The object must have exactly these top-level keys:

```json
{
  "schemaVersion": "1.0.0",
  "semantic": {
    "nodes": [{ "id": "gateway", "type": "service", "label": "API Gateway" }],
    "edges": [{ "id": "e1", "source": "gateway", "target": "db", "type": "straight", "label": "reads/writes" }]
  },
  "layout": {},
  "theme": "default-dark",
  "metadata": { "created": "2026-07-18T00:00:00Z", "updated": "2026-07-18T00:00:00Z", "rendererVersion": "1" }
}
```

## Rules (the validator enforces all of these)

- **Node types**: `service`, `database`, `note` — nothing else.
  **Edge types**: `straight`, `curved` — nothing else.
- Every node/edge `id` is unique; use short **kebab-case** ids (`auth-service`, `user-db`).
- Every edge's `source` and `target` must be the id of a node in `semantic.nodes`.
- Node shape: `{ "id", "type", "label" }` (optional `"data"` object).
  Edge shape: `{ "id", "source", "target", "type" }` (optional `"label"`).
- `metadata.created` / `metadata.updated`: ISO-8601 timestamps; `rendererVersion`: `"1"`.

## Layout is the USER'S, not yours

- **New diagram** → emit `"layout": {}`. The app places nodes automatically and the user
  arranges them by hand afterwards. Never invent coordinates unless explicitly asked.
- **Editing an existing diagram** (the user pastes their current `.diagram` JSON plus an
  instruction) → return the **complete updated JSON**, and copy every existing `layout` entry
  **verbatim** — do not move, resize, or delete a placed node's entry unless you are deleting
  that node itself (then drop its layout entry too). Layout keys must always be a subset of the
  node ids.

## Semantics guidance

- `service` = any process/component/API; `database` = any datastore; `note` = a free-text
  annotation pinned into the diagram.
- Edge direction reads source → target ("gateway calls db"). Use `label` for the relationship
  ("reads/writes", "publishes to"). `straight` suits direct calls; `curved` suits async or
  annotation links — either is always safe.
- The diagram's **title** is not part of this JSON — the user names it at import. If they ask
  to embed it in a note, that note references it as `![[Title.diagram]]`.
