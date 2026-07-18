# Diagram Module - Architecture & Flow

The AI-native diagram engine at `/diagrams`, implemented from
the (since removed) `docs/diagram-engine-execution-plan.md` (Phases 0–5 complete;
Phase 6+ — more node types, Dagre/ELK auto-layout, export — is open-as-needed). The core idea:
**AI owns meaning, the user owns layout** — a diagram's `semantic` (nodes/edges) and `layout`
(positions) are separate namespaces with separate owners, so an AI edit can never destroy a
manually arranged diagram.

## 1. Overview

- One document format: the **DiagramBundle** JSON — `schemaVersion`, `semantic` (AI-owned, no
  coordinates), `layout` (user-owned, keyed by node id), `theme` (named ref), `metadata`.
- Stored **inline in Postgres like notes** (`content` jsonb + revisions), NOT as a
  storage-service blob — diagrams are editable documents, not immutable media.
- React Flow (`@xyflow/react`) is the **renderer only**, confined behind an adapter. There is
  exactly **one `<ReactFlow>` mount** in the app:
  [DiagramRenderer.tsx](../frontend/src/modules/diagram/renderer/DiagramRenderer.tsx) — the
  editor canvas, `![[Title.diagram]]` wiki embeds, and the legacy ```reactflow-json chat fence
  ([FlowBlock.tsx](../frontend/src/components/common/FlowBlock.tsx)) all render through it.
- New deps: `ajv` (validation) and `nanoid` (ids) only. **vitest** was added as the frontend's
  test runner for this module's gates (`cd frontend && npm test`).

## 2. Database (migration V6)

| Migration | Tables |
| --- | --- |
| `V6__diagrams.sql` | `diagrams` (id BIGSERIAL, **title UNIQUE**, content jsonb, timestamps + updated_at trigger), `diagram_revisions` (diagram_id, content snapshot, created_at) |

Same conventions as notes: titles are the diagram's identity (`![[Title.diagram]]` embeds
resolve by title, case-insensitively; clashes get a numeric suffix); the tables are listed in the
jOOQ `<includes>` in [pom.xml](../backend/central-server/pom.xml); V6 joins V3–V5 in "to be
folded back into V1 eventually". A revision snapshot is written before every AI-edit save
(`snapshot: true` on PUT), so AI edits are reversible server-side too.

## 3. Backend (`com.proprofessor.server.diagram`)

Standard vertical: [DiagramController](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramController.java)
→ [DiagramService](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramService.java)
→ [DiagramRepository](../backend/central-server/src/main/java/com/proprofessor/server/diagram/repository/DiagramRepository.java), plus `dto/` and `mapper/`.

- CRUD at `/api/v1/diagrams` (+ `GET /by-title/{title}` for embed resolution). `content` rides
  as a Jackson `JsonNode` and is stored as jsonb; the server only requires a JSON object —
  **ajv on the frontend is the single content validator**.
- `PUT /{id}` accepts `snapshot: true` → inserts a `diagram_revisions` row of the current
  content before overwriting.
- **AI edit**: [DiagramAiController](../backend/central-server/src/main/java/com/proprofessor/server/diagram/ai/DiagramAiController.java)
  streams `POST /{id}/ai-edit` as SSE (`diagram.start/chunk/done/error`), mirroring the notes AI
  route. [DiagramAiService](../backend/central-server/src/main/java/com/proprofessor/server/diagram/ai/DiagramAiService.java)
  reuses `ChatCompletionClient` (Ollama / AI Service) with a **JSON-only command-list system
  prompt**; chunks are progress-display only — the client applies nothing until `diagram.done`
  delivers the full buffered reply. The repair retry is client-driven: an invalid reply comes
  back with `priorReply` + `validationErrors` and the conversation is rebuilt with that feedback.

> The in-app AI system prompts live in `DiagramAiService` (command-list *editing* contract) and
> `NotesAiService` (full-note rewrite). For **external** models authoring paste-ready files, use
> the repo-root [skills/](../skills/README.md) folder instead — different contract, deliberately
> not shared.

## 4. Frontend (`src/modules/diagram/`)

Dependency rule: `model → commands → adapter → renderer` — the domain never imports the renderer.

| Layer | Files | Role |
| --- | --- | --- |
| `model/` | 4 namespace slices (`semantic`, `layout`, `viewport`, `selection`) + `doc`/`history` bookkeeping, combined under `state.diagram` | single source of truth in the existing RTK store |
| `schema/` | `diagram.schema.json`, `aiPatch.schema.json`, `validate.ts` | **the single ajv gate** — every load, save, command and AI patch passes `validateBundle` |
| `commands/` | `ops.ts` (pure op appliers) + thunks + `model/historySlice` | every mutation = validated op returning `{redo, undo}`; Ctrl+Z/Ctrl+Shift+Z replay the inverse-command stack (per-diagram) |
| `layout/` | `LayoutStrategy` + `NearParentPlacement` | places ONLY new node ids; frozen entries are never rewritten |
| `adapter/` | `ReactFlowAdapter.ts` | domain→RF memoized selectors; RF→domain guarded commits (drag-end → `moveNodeCommand`, layout only) |
| `renderer/` | `DiagramRenderer` (the one RF mount, lazy-loaded), `DiagramCanvas` (store-connected, local mirror for smooth drags) | |
| `ai/` | `runAiEdit` → `patchParser` → `applyAiPatch` | buffer → parse (strips prose/fences) → ajv → **atomic** apply as ONE history entry → save with `snapshot:true`; ≤1 repair retry, never after a user Stop |
| `persistence/` | `bundleIO.ts` | validate-in/validate-out save + load payload builders |
| `nodes/`, `edges/` | `registry.ts` + components | adding a type = one component + one registry line + its name in `NODE_TYPES`/`EDGE_TYPES` (a sync test enforces the two match) |
| `components/` | `DiagramAiBar`, `DiagramEmbed`, `ImportDiagramDialog` | AI bar; wiki embed (store-free, read-only, edit via deep link); paste-a-JSON import |
| `screens/` | `DiagramsScreen` (routes `/diagrams`, `/diagrams/:diagramId`) | list + editor + AI bar + import |

Behavioral guarantees (all covered by vitest tests):
- A drag can never touch `semantic` (byte-identical before/after layout-only changes).
- An AI edit never moves an existing node; only new ids get placed.
- A malformed AI patch (or any invalid command) leaves the store byte-identical.
- Undo of a delete restores exact document order (index-aware inverse actions).

## 5. Embeds & the fence

- `![[Title.diagram]]` in a note transcludes the diagram:
  [useWikiHandlers](../frontend/src/modules/notes/hooks/useWikiHandlers.tsx) routes `.diagram`
  targets to [DiagramEmbed](../frontend/src/modules/diagram/components/DiagramEmbed.tsx), which
  resolves by title, renders read-only (ephemeral RF mode — drags never commit), and deep-links
  to `/diagrams/:id` for editing. Embeds are store-free, so many can coexist.
- The ```reactflow-json fence remains for quick throwaway diagrams in chat/notes; it parses a
  tolerant shape into an ephemeral bundle and renders through the same adapter/renderer
  (keyed by source so edits re-render). Persistent, AI-editable diagrams are `.diagram` documents.

## 6. Importing externally authored diagrams

`Diagrams → Import` (ImportDiagramDialog) accepts a pasted DiagramBundle JSON, runs it through
`validateBundle`, and creates the diagram on success. The authoring contract external AI models
follow lives in [skills/pro-professor-diagrams](../skills/pro-professor-diagrams/SKILL.md);
notes have the equivalent in [skills/pro-professor-notes](../skills/pro-professor-notes/SKILL.md).
