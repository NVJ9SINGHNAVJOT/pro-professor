# Diagram Module - Architecture & Flow

The diagram feature at `/diagrams` is a **manual [Excalidraw](https://github.com/excalidraw/excalidraw)
editor**. A diagram is a single Excalidraw **scene** (`{ type, elements, appState, files }`) that the
user draws by hand; it is stored inline in Postgres like a note. There is **no AI** in diagrams —
diagrams are created and edited by the user. (An AI generate/edit path existed briefly and was
removed; it may return "some other day".)

## 1. Overview

- One document format: the canonical **Excalidraw scene** JSON (`type: "excalidraw"`, `version`,
  `source`, `elements`, `appState`, `files`) — the whole document, no separate semantic model.
- Stored **inline in Postgres like notes** (`content` jsonb + revisions), NOT as a storage-server
  blob — diagrams are editable documents, not immutable media.
- Excalidraw (`@excalidraw/excalidraw`) is the editor. It owns scene state and undo/redo; it is
  lazy-loaded (a code-split chunk) so the runtime + CSS stay out of the main bundle.
- **Professional defaults**: new content is drawn clean, not sketchy — roughness `0` (architect)
  and a normal sans font (`FONT_FAMILY.Nunito = 6`), seeded via `appState`
  (`currentItemRoughness` / `currentItemFontFamily`) in
  [sceneIO.ts](../frontend/src/modules/diagram/persistence/sceneIO.ts).

## 2. Database

A single `diagrams` table lives in the consolidated `V1__init_schema.sql` (id BIGSERIAL,
**title UNIQUE**, content jsonb, timestamps + updated_at trigger). Same conventions as notes: titles
are the diagram's identity (`[[Title.diagram]]` links resolve by title, case-insensitively; clashes
get a numeric suffix); the table is listed in the jOOQ `<includes>` in
[pom.xml](../backend/central-server/pom.xml). There is no revisions table — diagrams are drawn
directly, with no snapshot/undo-on-server machinery.

## 3. Backend (`com.proprofessor.server.diagram`)

Pure CRUD vertical: [DiagramController](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramController.java)
→ [DiagramService](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramService.java)
→ [DiagramRepository](../backend/central-server/src/main/java/com/proprofessor/server/diagram/repository/DiagramRepository.java), plus `dto/` and `mapper/`.

- CRUD at `/api/v1/diagrams`: list, `GET /{id}`, `GET /by-title/{title}` (for `[[Title.diagram]]`
  link resolution), `POST`, `PUT /{id}`, `DELETE /{id}`.
- `content` rides as a Jackson `JsonNode` and is stored as jsonb; the server only requires it to be
  a JSON object — there is no server-side scene schema (Excalidraw's `restore` normalises on load).

## 4. Frontend (`src/modules/diagram/`)

A thin module — the editor is a wrapper around `<Excalidraw>`; there is no domain/adapter/renderer
layering (Excalidraw is the model + renderer).

| Layer | Files | Role |
| --- | --- | --- |
| `types/` | `index.ts` | the `DiagramScene` document type |
| `persistence/` | `sceneIO.ts` | pure helpers (`makeEmptyScene`, professional-style constants `PRO_ROUGHNESS` / `PRO_FONT_FAMILY`) — no Excalidraw import, so the list screen stays light |
| `components/` | `DiagramEditor.tsx` | mounts `<Excalidraw>`; loads via `restore`, debounce-autosaves via `serializeAsJSON` + `PUT`; header matches the notes header (`h-11.5`) |
| `screens/` | `DiagramsScreen.tsx` (routes `/diagrams`, `/diagrams/:diagramId`) | diagram list + `<DiagramEditor>` |

Save/load: `DiagramEditor` loads a scene with `restore(content)`, seeds the professional tool
defaults, and mounts `<Excalidraw>`. `onChange` is debounced (~800ms) and skipped when the scene
version (`getSceneVersion`) is unchanged, so selection/pointer events don't trigger saves. Save
serialises with `serializeAsJSON(..., "database")` and `PUT`s the scene.

## 5. Referencing a diagram from a note

A note references a standalone diagram with a **link**, not an inline render:
`[[Title.diagram]]`. [useWikiHandlers](../frontend/src/modules/notes/hooks/useWikiHandlers.tsx)'s
`onLinkClick` detects the `.diagram` suffix (`DIAGRAM_SUFFIX`), resolves the title→id via
`diagramsRoute.getDiagramByTitle`, and navigates to `/diagrams/:id`. There is no inline diagram
embed.

**Diagrams drawn *inside* a note** use **Mermaid**: a ```mermaid fenced block renders inline via
[MermaidBlock](../frontend/src/components/common/MermaidBlock.tsx) (the `language-mermaid` case in
[Markdown.tsx](../frontend/src/components/common/markdown/Markdown.tsx)). Mermaid is the tool for quick
in-note diagrams; the Excalidraw `/diagrams` module is for standalone, hand-drawn diagrams linked
from notes.
