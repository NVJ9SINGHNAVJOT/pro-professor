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

Two tables in the consolidated `V1__init_schema.sql`, both listed in the jOOQ `<includes>` in
[pom.xml](../backend/central-server/pom.xml):

- **`diagrams`** — id BIGSERIAL, **title UNIQUE**, content jsonb, `folder_id`, timestamps +
  updated_at trigger. Same conventions as notes: titles are the diagram's identity
  (`[[Title.diagram]]` links resolve by title, case-insensitively; clashes get a numeric suffix).
  There is no revisions table — diagrams are drawn directly, with no snapshot/undo-on-server
  machinery.
- **`diagram_folders`** — id, name, self-referencing `parent_id`, created_at. Declared *above*
  `diagrams`, which references it. Folders are addressed by id and never by name, so sibling names
  may repeat; no `updated_at`, since nothing reads it and folders sort by name.

`folder_id` and `parent_id` are nullable on purpose — NULL is the root level, the one genuinely
absent value, not a legacy-row accommodation. Both are indexed (Postgres does not index FK columns
automatically, and the cascade deletes walk them). Deleting a folder cascades to its subfolders and
their diagrams, but only after the service has cleared the note-link guard (§3).

## 3. Backend (`com.proprofessor.server.diagram`)

Two verticals in one package: [DiagramController](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramController.java)
→ [DiagramService](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramService.java)
→ [DiagramRepository](../backend/central-server/src/main/java/com/proprofessor/server/diagram/repository/DiagramRepository.java),
and [DiagramFolderController](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramFolderController.java)
→ [DiagramFolderService](../backend/central-server/src/main/java/com/proprofessor/server/diagram/DiagramFolderService.java)
→ [DiagramFolderRepository](../backend/central-server/src/main/java/com/proprofessor/server/diagram/repository/DiagramFolderRepository.java),
plus shared `dto/` and `mapper/`.

- Diagrams at `/api/v1/diagrams`: list (folders **and** diagrams, so the sidebar is one request),
  `GET /{id}`, `GET /by-title/{title}` (for `[[Title.diagram]]` link resolution), `POST`,
  `PUT /{id}`, `PUT /{id}/title` (rename only), `PUT /{id}/folder`, `DELETE /{id}`.
- Folders at `/api/v1/diagram-folders`: `POST`, `PUT /{id}` (rename), `PUT /{id}/parent` (move),
  `DELETE /{id}`. Its own path rather than `/diagrams/folders`, which would sit under the
  `/diagrams/{id}` path variable. There is no list endpoint — folders ride with the diagram list.
- `content` rides as a Jackson `JsonNode` and is stored as jsonb; the server only requires it to be
  a JSON object — there is no server-side scene schema (Excalidraw's `restore` normalises on load).

**Renames and moves are their own endpoints, never part of `PUT /{id}`.** That route is the
editor's ~800ms autosave, which sends title + content — so folding a rename into it would make
every title keystroke round-trip the whole scene, and a rename would carry whatever is on the
canvas. `PUT /{id}/title` touches the title column only (blank → 400, same uniqueness suffixing).
A `folderId` field there would deserialize an absent
value to null on every save (a Java record cannot tell "absent" from "explicitly null") and drag the
open diagram back to the root. `DiagramCreateRequest`/`DiagramUpdateRequest` therefore carry no
folder at all; `DiagramMoveRequest` and `DiagramFolderMoveRequest` do, with null meaning root.

**Deleting is guarded by note links.** `DiagramService.requireNoNoteReferences` joins `note_links`
against `diagrams.title || '.diagram'` (case-insensitively; embeds count too) and throws **409**
naming the diagrams and the notes holding the links. `DiagramFolderService.deleteFolder` runs it
over the folder's whole subtree, so a folder delete is all-or-nothing: one still-linked diagram
anywhere beneath it and nothing is deleted. `DELETE /api/v1/diagrams/{id}` runs the same check for a
single diagram. Moving a folder into itself or a descendant is rejected with 400; descendants are
resolved by walking the flat folder list in memory rather than with a recursive CTE.

## 4. Frontend (`src/modules/diagram/`)

A thin module — the editor is a wrapper around `<Excalidraw>`; there is no domain/adapter/renderer
layering (Excalidraw is the model + renderer).

| Layer | Files | Role |
| --- | --- | --- |
| `types/` | `index.ts` | the `DiagramScene` document type |
| `constants/` | `index.ts` | `EMPTY_DRAG_IMAGE` — the 1×1 GIF that suppresses the native drag ghost in the sidebar tree |
| `persistence/` | `sceneIO.ts` | pure helpers (`makeEmptyScene`, professional-style constants `PRO_ROUGHNESS` / `PRO_FONT_FAMILY`) — no Excalidraw import, so the list screen stays light |
| `utils/` | `folderTree.ts` | pure tree helpers (`childFolders`, `diagramsIn`, `descendantIds`, `isDescendant`) — the drag guards are testable without a DOM |
| `components/` | `DiagramEditor.tsx` | mounts `<Excalidraw>`; loads via `restore`, debounce-autosaves via `serializeAsJSON` + `PUT`; header matches the notes header (`h-11.5`) and shares its `EditableTitle` |
| `components/` | `DiagramTree.tsx` | one level of the sidebar tree, recursing into expanded folders |
| `screens/` | `DiagramsScreen.tsx` (routes `/diagrams`, `/diagrams/new`, `/diagrams/:diagramId`) | folder tree + `<DiagramEditor>`, and every mutation handler |

Save/load: `DiagramEditor` loads a scene with `restore(content)`, seeds the professional tool
defaults, and mounts `<Excalidraw>`. `onChange` is debounced (~800ms) and skipped when the scene
version (`getSceneVersion`) is unchanged, so selection/pointer events don't trigger saves. Save
serialises with `serializeAsJSON(..., "database")` and `PUT`s the scene. The version being sent is
claimed *before* the request, not read back off the snapshot afterwards — Excalidraw replaces
element objects as it finalises an edit, so the later read can return a stale number and fire a
second, identical save.

The **title is not part of that autosave**: [EditableTitle](../frontend/src/components/common/EditableTitle.tsx)
(shared with the notes toolbar) commits on Enter or blur through `PUT /{id}/title` and reverts on
Escape, so the scene is never resent for a rename. On a draft there is no row yet, so a committed
title falls back to the create path below.

Every successful save calls `onSaved(detail)`, which patches the list row (`upsertDiagram`) — the
title *and* the position, since `updatedAt` moved and the list is ordered by it. That's a local
dispatch, not a refetch, which is why it can run on every content autosave; the list has no loader
of its own after the section is entered.

**New diagram** is `/diagrams/new`, a *value* of the `:diagramId` param (`NEW_ITEM_ID`) rather than
a route of its own. The button issues **no request**; the editor mounts on `makeEmptyScene()` with
`diagram = null`, and the first debounced autosave `POST`s instead of `PUT`ting (a blank title lands
as "Untitled Diagram" server-side), then replaces the URL with `/diagrams/:id`. The editor holds its
id in a ref, and both the route and the screen's `key` are kept stable across that hop on purpose —
remounting `<Excalidraw>` mid-drawing would reset the scene, the viewport and the undo history.
Drawing nothing leaves nothing behind. A new diagram always lands at the **root** level — it is
moved into a folder by dragging, which keeps the draft path free of any folder plumbing.

**The sidebar tree.** The server sends folders flat, each with a `parentId`; the tree is assembled
at render time, sorting folders A→Z and diagrams by last-updated at every level. The root is split
into two collapsible `SidebarSection`s — **Diagrams** (the loose ones, `folderId === null`) above
**Folders** (the tree) — via `DiagramTree`'s `only` prop; the two partition the list, so a diagram
shows in exactly one. Nested levels render both kinds together. Folders live in
their own `diagramFolderList` slice beside `diagramList` — a second `createListSlice` rather than
one slice holding both, so the diagram rows keep the upsert-to-front behavior the autosave relies
on. `diagramsListLoader` seeds both from the single list response.

**The whole sidebar collapses**, with the same mechanics as the chat and notes ones — the outer
element animates `w-67.5` ↔ `w-0` while the inner keeps full width and fades, so the tree doesn't
reflow on the way out, and `LeftNav` goes with it. The toggle is
[SidebarToggle](../frontend/src/components/common/SidebarToggle.tsx), passed into `DiagramEditor`
as its `leading` slot so it sits at the head of the editor's toolbar (and into a matching band on
the empty state). It deliberately does **not** live inside the sidebar, which would take the button
with it. Open/closed is local `DiagramsScreen` state — unlike which *folders* are expanded, which
is in Redux because it survives the `/diagrams` → `/diagrams/:id` remount and matters more.

**Drag and drop** is HTML5-native. The dragged row is held in a `useRef`, not in `dataTransfer`,
whose payload is unreadable during `dragover` — which is exactly when a folder drop has to be judged
valid. The native drag ghost is suppressed in favour of a custom preview that follows the cursor
(see the frontend conventions doc — browsers rasterize that ghost at 1×, so it is always blurry on a
HiDPI screen). **A folder's drop target is its whole block** — the row plus everything nested under
it when open — so dropping onto a folder's visible contents means "put it in this folder"; nested
blocks stop propagation so the innermost still wins, and diagram rows carry no handlers, so they
bubble to whichever folder encloses them. The highlighted target is one shared value, not per-row
state: dropping into a nested folder never fires `dragleave` on its ancestors, so their highlights
would otherwise stay lit. **Getting back to the top level is a drag to the far-left gutter**, the way
VS Code's explorer un-nests — a 16px overlay strip that appears only while a nested row is in
flight, showing a hairline that thickens on approach. It replaced three worse designs: the whole
scroll area (any stray release pulled a diagram out of its folder), the Diagrams section
(undiscoverable, and semantically wrong for a folder), and a banner above the list (shifted the list
mid-gesture). A drop into a collapsed folder expands it, or the row would appear to vanish. Moves apply locally first and roll back on error, so
the row doesn't sit under the cursor waiting on the round-trip. Dropping a folder into itself or a descendant is refused on both
tiers. After a folder delete succeeds the client prunes the same subtree locally (`descendantIds`)
instead of refetching, since the server already cascaded; a 409 leaves the tree untouched and
surfaces the server's message.

**Which folders are open lives in Redux** (`diagramSidebar`), not in `DiagramsScreen`. `/diagrams`
and `/diagrams/:diagramId` are two route entries rendering two separate `<DiagramsPage>` elements,
so the first click on a diagram remounts the screen — with the state local, the folder you had just
opened snapped shut as you clicked into it. (The notes explorer's tag expansion sits on the same
route shape and has the same behavior.) Arriving on `/diagrams/:id` cold — a reload, or a
`[[Title.diagram]]` link — reveals the whole `ancestorIds` chain down to the open diagram, keyed on
the diagram's id so a later collapse isn't undone by an unrelated autosave.

## 5. Referencing a diagram from a note

A note references a standalone diagram with a **link**, not an inline render:
`[[Title.diagram]]`. [useWikiHandlers](../frontend/src/modules/notes/hooks/useWikiHandlers.tsx)'s
`onLinkClick` detects the `.diagram` suffix (`DIAGRAM_SUFFIX`), resolves the title→id via
`diagramsRoute.getDiagramByTitle`, and navigates to `/diagrams/:id`. There is no inline diagram
embed.

Because that link resolves by **title**, deleting the diagram behind one would silently turn a
working link into a dead one — which is what the delete guard in §3 exists to prevent, for a single
diagram and for a whole folder subtree alike. (Renaming a diagram still orphans links pointing at
the old title; that is unchanged and unguarded.)

**Diagrams drawn *inside* a note** use **Mermaid**: a ```mermaid fenced block renders inline via
[MermaidBlock](../frontend/src/components/common/MermaidBlock.tsx) (the `language-mermaid` case in
[Markdown.tsx](../frontend/src/components/common/markdown/Markdown.tsx)). Renders are serialized —
concurrent `mermaid.render()` calls wreck each other, see
[notes-flow.md](notes-flow.md) §5 — and each diagram gets zoom / pan / fullscreen controls from
[DiagramViewport](../frontend/src/components/common/DiagramViewport.tsx). Mermaid is the tool for quick
in-note diagrams; the Excalidraw `/diagrams` module is for standalone, hand-drawn diagrams linked
from notes.
