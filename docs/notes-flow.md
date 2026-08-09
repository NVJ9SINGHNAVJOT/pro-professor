# Notes Module - Architecture & Flow

The Obsidian-like Markdown notes module at `/notes`, implemented from the (since removed)
`docs/notes-feature-plan.md` (Phases 1–4; Phase 5 semantic RAG was
deliberately skipped). Notes live in Postgres like everything else — there is no vault/file
interop; only Obsidian's *syntax and interaction model* is borrowed.

## 1. Overview

- **Dependency budget held:** the only new runtime library for notes is `mermaid` on the
  frontend, lazy-loaded via dynamic `import()` so it stays out of the main bundle.
  central-server added **zero** jars (frontmatter parsing uses the SnakeYAML Spring Boot already
  ships).
- Notes are optimized for **AI-authored Markdown**: content usually arrives pasted from a chat or
  from the AI update's staged proposal (§6), and everything round-trips through one `content`
  text column.

## 2. Database

The notes tables live in the consolidated `V1__init_schema.sql`:

| Table | Shape |
| --- | --- |
| `notes` | id BIGSERIAL, **title UNIQUE**, content, frontmatter jsonb, generated `content_tsv` tsvector column + GIN index for full-text search |
| `tags` / `note_tags` | `tags` (unique name) + `note_tags` link table |
| `note_links` | source_note_id, target_ref, link_type `link\|embed` — also read outside notes, by the media delete guard (see [project-flow.md](project-flow.md) §2.4) |
| `note_revisions` | note_id, content snapshot, created_at — written before a restore. **Not** by the AI update, which no longer writes the note at all (§6) |

Conventions that matter:

- **Titles are the note's identity.** Wiki-links resolve by title (case-insensitive), so titles are
  unique; a colliding save gets a numeric suffix ("Untitled" → "Untitled 2").
- `target_ref` stores the referenced **title as written** — links may point at notes that don't
  exist yet (Obsidian's "unresolved link"); resolution happens at read time.
- Each table must be listed in the jOOQ `<includes>` regex in
  [pom.xml](../backend/central-server/pom.xml); schema changes follow the usual
  `task migrate` → `task codegen` → recompile loop.

## 3. Backend (`com.proprofessor.server.notes`)

Standard vertical: [NotesController](../backend/central-server/src/main/java/com/proprofessor/server/notes/NotesController.java)
→ [NotesService](../backend/central-server/src/main/java/com/proprofessor/server/notes/NotesService.java)
→ [NotesRepository](../backend/central-server/src/main/java/com/proprofessor/server/notes/repository/NotesRepository.java)
(+ `NoteRow`/`NoteRevisionRow` in `common/db`, DTOs, `NoteMapper`), all wrapped in `ApiResponse`.

**On every save** (`create`/`update`) the service re-derives everything from `content`:

1. [Frontmatter](../backend/central-server/src/main/java/com/proprofessor/server/notes/Frontmatter.java)
   parses the leading `--- … ---` YAML block (SafeConstructor — pasted text is untrusted) into the
   `frontmatter` jsonb column; `title:`/`tags:` keys are honored.
2. Title precedence: frontmatter `title` → request title → **the note's current title** →
   "Untitled", then uniqueness suffixing. The current-title step is what lets the editor save
   content without carrying a title: renaming is `PUT /{id}/title`'s job, not the save's.
3. [LinkParser](../backend/central-server/src/main/java/com/proprofessor/server/notes/LinkParser.java)
   scans the body (code fences and inline code excluded) for `[[Note]]`, `[[Note#H|alias]]`,
   `![[embeds]]`, `[text](Note)` and inline `#tags`, then rebuilds `note_links` + `note_tags`.

**Endpoints** (`/api/v1/notes`): CRUD, **`PUT /{id}/title`** (rename only — content, frontmatter,
tags, links and revisions are untouched; blank → 400; same uniqueness suffixing. Separate from the
save for the same reason `PUT /diagrams/{id}/folder` is: renaming from the toolbar must not also
persist an unsaved buffer), `GET ?tag=` filter, `GET /search?q=`
(`websearch_to_tsquery` + `ts_rank` over the note-content tsvector), `GET /{id}/backlinks` (join on
`lower(target_ref) = lower(title)`), `GET /links` (edge list feeding the graph view),
`GET /{id}/revisions`, `POST /{id}/revisions/{revId}/restore`.

One media addition: the note detail payload (`GET /api/v1/notes/{id}`) carries an `embedUrls` map —
each `![[image.png]]` embed target resolved to the newest matching upload's **direct storage-server
URL**. The frontend renders embedded images straight from storage; central-server never proxies the
bytes. (A freshly-typed embed resolves on the next save, when the note is re-read.)

## 4. Frontend (`modules/notes`)

Follows the chat module's patterns: `pages/notes/index.tsx` → route in `main.tsx`,
`pages/notes/loader.ts` (the explorer list), `services/operations/notes/notes.route.ts` (REST via
`createRoute`/`useApi`) and `notes.stream.ts` (SSE via `rawFetch`, mirroring `chats.stream.ts`).

[NotesScreen](../frontend/src/modules/notes/screens/NotesScreen.tsx) is the three-pane workspace;
each pane scrolls independently:

- **Left** — [NoteList](../frontend/src/modules/notes/components/NoteList.tsx): two collapsible
  `SidebarSection`s — a **Tags** browser tree (tag → its notes) above a **Notes** list — the same
  shape as the diagram sidebar's Diagrams/Folders split, with rows sharing one
  `[disclosure][icon][label]` grid (`SIDEBAR_ICON_SLOT` / `sidebarIndent` in
  [sidebar.ts](../frontend/src/components/common/sidebar.ts)) so both explorers align.
  **There is no search box here** — ⌘K searches notes and chats together (see
  [project-flow.md](project-flow.md) §2.8a); `GET /notes/search` is now called from there.
  The whole pane **collapses**, using
  the chat sidebar's mechanics (`sidebarShell` / `sidebarShellInner`: the outer element animates
  `w-67.5` ↔ `w-0`, the inner keeps full width and fades, so nothing reflows on the way out) minus
  its mobile handling. `MainNavbar` collapses with it,
  as in chat, and the pane goes to *zero* width — nothing is left behind. The toggle
  ([SidebarToggle](../frontend/src/components/common/SidebarToggle.tsx), shared with the diagram
  screen) sits at the head of the center pane's top bar, left of the title field, and is
  repeated in all three center states (editor, graph view, empty) — it must never live inside the
  sidebar, which would take the button with it. State is local to NotesScreen, so it resets when
  `/notes` → `/notes/:id` remounts the screen; chat does the same.
- **Center** — [NotesBar](../frontend/src/modules/notes/components/NotesBar.tsx): one toolbar strip
  (explorer toggle, **editable title**, graph view, view toggle source/split/preview — an existing
  note opens in **preview**, a draft in **split**, re-applied whenever the route hands over a
  different note so a manual toggle stands until then, save, revision
  history, AI panel, right rail). The title is the shared
  [EditableTitle](../frontend/src/components/common/EditableTitle.tsx) (diagrams use the same one):
  **Enter or blur commits a rename** through `PUT /{id}/title` and Escape reverts it, so a rename
  never persists the editor buffer — the note stays as dirty as it was, and no revision is written.
  The server's copy (deduplicated) replaces what was typed; a frontmatter `title:` still wins on the
  next content save. **Every AI surface lives in the
  rail's AI tab** (§6a) — no instruction row, no floating panel, and the **model picker lives there
  too**, since that tab is the only thing that reads it. The toolbar's ✨ button opens that tab and **doubles as
  Stop** while the model runs, since the rail can be closed mid-generation and would otherwise
  strand it.
  Then editor
  ([NoteEditor](../frontend/src/modules/notes/components/NoteEditor/NoteEditor.tsx) — a plain `TextareaInput`
  plus a line-number gutter and inline problem squiggles, §5a) ⟷ preview split with a hand-rolled
  draggable divider ([SplitPane](../frontend/src/modules/notes/components/SplitPane.tsx)).
  **Every programmatic edit — Tab/⇧Tab, Enter list continuation, ⌘B/⌘I, toolbar and palette
  formatting, slash-menu blocks, an applied AI reply — goes through `applyTextState`, which writes
  it with `execCommand("insertText")` over just the span `changedRange` says changed, never through
  `setContent`.** The textarea is controlled, so `setContent` makes React *assign* `.value`, and a
  scripted `.value` assignment wipes the browser's native undo stack: ⌘Z would restore nothing after
  an indent, and lose the typing history before it too. An execCommand edit is recorded as a user
  edit, so each transform is one undo step. The two
  panes **scroll in sync** proportionally, with a short driver lock so the pane being driven can't
  scroll the other one back. Cmd/Ctrl+S saves —
  and on `/notes/new` that save is the `POST` that creates the note (see §"New note" below);
  the graph view ([GraphView](../frontend/src/modules/notes/components/GraphView/GraphView.tsx))
  renders `GET /notes/links` through **either of two renderers**, chosen by a segmented control in
  its header — see §4a.
- **Right** — [RightRail](../frontend/src/modules/notes/components/RightRail.tsx), two tabs sharing
  one pane so a chat doesn't cost the editor a third column; **width is draggable** from its left
  edge (260–720px), the same divider mechanics as SplitPane. **Context**
  ([ContextPanel](../frontend/src/modules/notes/components/ContextPanel.tsx)) — problems (§5a),
  backlinks (server), outgoing links + outline (parsed client-side from the live editor content,
  matching LinkParser's code-exclusion rules), tags. **Chat**
  ([NoteChatPanel](../frontend/src/modules/notes/components/NoteChatPanel.tsx)) — see §6a. Both tabs
  stay mounted; the chat is component state, so unmounting it on a tab switch would discard the
  thread.
- **Command palette** — [CommandPalette](../frontend/src/modules/notes/components/CommandPalette.tsx),
  Cmd/Ctrl+P (or +K), hand-rolled (no `cmdk`): open/create notes, view modes, graph, line
  formatting, insert a Mermaid template, AI actions. An AI command is stored as NotesScreen state
  (`NotesBarCommand`) and run by an effect — state, not a ref, because react-compiler lint forbids
  ref access in render paths.

**New note** is `/notes/new` — an editor with no note behind it, exactly like a new chat. It is a
*value* of the `:noteId` param (`NEW_ITEM_ID`), not a route of its own, so the screen isn't
remounted when the save gives it a real id. Clicking "New note" issues **no request**; the first
save `POST`s the note (carrying whatever is in the toolbar's title field), adds it to the
explorer, then replaces the URL with `/notes/:id`. Leaving the draft unsaved leaves nothing behind.
Revision history, backlinks and the NotesBar's AI actions need an id, so they stay inert until that
first save.

Everything else about the workspace is *arrival data* fetched by the route loaders
(`pages/notes/loader.ts`): the open note + its backlinks on `/notes/:noteId`, and the explorer list,
which the parent route's loader dispatches into the `notesList` slice. A save/create/delete then
patches that one row from the response it already has (`upsertNote` / `removeNote`) — the note's new
title, tags and position, with **no `GET /notes`**. Outline clicks in the context panel scroll the
preview directly rather than re-navigating to the note's own URL.

## 4a. Graph view ([components/GraphView/](../frontend/src/modules/notes/components/GraphView))

The note network, in **two renderings of the same data**. Both consume one shared model built by
[`utils/graph.ts`](../frontend/src/modules/notes/utils/graph.ts) `buildGraphModel(notes, links)`, so
they can never disagree about what the network is. Nodes are namespaced ids — `note:<id>` (keyed on
the id, so a rename never moves a node) and `ref:<lowercased target>` for an unresolved `[[link]]`.
A `[[Title.diagram]]` target is **excluded**: it is a diagram, not an unwritten note. `degree` counts
links in both directions and a repeated pair collapses to one edge, so it stays honest as the thing
that sizes a node and decides what counts as an orphan.

- **Interactive (default)** —
  [ForceGraph](../frontend/src/modules/notes/components/GraphView/ForceGraph.tsx), an Obsidian-style
  force-directed canvas. `lazy()`-loaded, so `d3-force` and the painter stay out of the notes chunk
  (the folder's `index.ts` therefore exports the orchestrator **only** — re-exporting `ForceGraph`
  would statically pull that chunk back in). Click a node to open it (an unresolved one opens the
  draft it would create, `/notes/new?title=…`, mirroring `useWikiHandlers`); drag to reposition,
  which **pins** it; Alt-click or "Unpin all" releases it; hover lights the node and its neighbours
  and dims the rest. The open note is drawn **filled in the accent colour with a halo** — "you are
  here" in a field of grey dots — and the camera pans to it on open if a restored viewport doesn't
  already contain it. The toolbar's zoom readout is written to the DOM from the frame loop, not
  through state. The [filter panel](../frontend/src/modules/notes/components/GraphView/GraphFilterPanel.tsx)
  (⌘F, hanging under the toolbar) has a title filter, hide-unlinked, colour-by-tag with a legend,
  and a 1–3 hop local-graph slider around the open note. Escape closes the panel, then the graph.
- **Hierarchy** —
  [MermaidGraph](../frontend/src/modules/notes/components/GraphView/MermaidGraph.tsx) serializes the
  model to a `graph TD` definition and hands it to the same lazy `MermaidBlock` as a
  ```` ```mermaid ```` fence, so it costs no extra dependency. Solid arrows = links, dashed =
  embeds, dashed nodes = unresolved targets. Non-interactive, and the better read for a chain of
  links as a tree.

Three invariants worth not breaking:

- **Filters are a visibility mask, never a re-layout.** The simulation always holds the whole graph;
  filtering fades nodes rather than sliding the one you are hunting for out from under the cursor.
  The depth slider *does* fly the camera (it is a deliberate change of scope), the search box does not.
- **The layout survives an unrelated save.** `notes` is Redux state, so saving any note hands down a
  new array; the sync effect keys on `graphSignature` and merges by id, carrying each surviving
  node's position, velocity and pin across.
- **Opening a node closes the graph, explicitly.** `GraphView.openNode` calls `onClose` before
  navigating. Going from `/notes` to `/notes/:id` changes route entry and remounts the screen, which
  resets `graphOpen` on its own — but `/notes/:a` → `/notes/:b` is the *same* entry, so without the
  explicit close the graph would stay sitting on top of the note the click just asked for.

State lives in [`notesGraphSlice`](../frontend/src/redux/slices/notesGraphSlice.ts) — renderer,
camera, dragged positions, pins, filters — because `/notes` and `/notes/:noteId` are two route
entries, so the first click on a node remounts the screen. It is also **the one slice written to
localStorage** ([`utils/localStore.ts`](../frontend/src/utils/localStore.ts), throttled from a plain
`store.subscribe`), so the graph is where you left it after a reload.

What is **not** persisted is as deliberate as what is: `graphOpen` (a mode — every node click is a
request to leave it), `panelOpen` (a filter panel that reopens itself every session is noise), and
`filters.query` (a search is something you are doing now; one silently reappearing would hide most
of the graph for no visible reason). `hideOrphans`, `colorByTag` and `localDepth` *are* kept — those
are how you like the view set up. The d3 simulation's node objects never enter Redux either: d3
rewrites each edge's `source`/`target` into object references, which makes the graph circular.

## 5. Shared rendering ([components/common/Markdown/Markdown.tsx](../frontend/src/components/common/Markdown/Markdown.tsx))

The `Markdown` component was **extracted from ChatMessages** and is shared by chat and notes:
`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`, plus hand-rolled remark
transforms (no `unist-util-visit` dependency):

- **Callouts** — `> [!note] Title` blockquotes → styled boxes (CSS in `index.css`, per-type colors).
- **Wiki-links** — text nodes are rewritten to `#wiki:`/`#wiki-embed:` links; an `a` component
  override routes clicks to the notes module's [useWikiHandlers](../frontend/src/modules/notes/hooks/useWikiHandlers.tsx):
  existing title → navigate (a `#Heading` part rides along as router state and NotesScreen
  smooth-scrolls the preview to it); missing title → **opens a draft** at
  `/notes/new?title=<target>`, seeded with `# <target>` — the row is written by its first save,
  not by the click. Missing links render dimmed/dashed. Chat passes no `wiki` prop, so this stays inert there.
- **Embeds** — `![[Note]]` / `![[Note#Heading]]` render [NoteEmbed](../frontend/src/modules/notes/components/NoteEmbed.tsx):
  fetches the target and transcludes the body (or just that heading's section via
  `extractSection`); image embeds render from the note's `embedUrls` map (direct storage URLs the
  backend resolves at load). Depth is capped at
  1 — nested embeds fall back to plain links. A `[[Title.diagram]]` **link** (not an embed) opens
  the standalone diagram page: `onLinkClick` resolves the title→id and navigates to `/diagrams/:id`
  (see [diagram-flow.md](diagram-flow.md) §5).
- **Inline diagrams** — ```` ```mermaid ```` fences → [MermaidBlock](../frontend/src/components/common/MermaidBlock.tsx)
  (lazy `import("mermaid")`, dark theme; a parse failure shows mermaid's own error text — which names
  the line and token — above the raw source, and leaves the last good diagram in place, so a
  mid-edit definition doesn't blank the pane). Renders are **serialized
  through a module-level queue**: `mermaid.render()` blanks the container it is handed and resets
  mermaid's global config before awaiting the diagram type's lazy import, so overlapping renders
  destroy each other's DOM and a note with several fences would show only one diagram. Each rendered
  diagram sits in [DiagramViewport](../frontend/src/components/common/DiagramViewport.tsx) — zoom,
  drag-to-pan, ctrl/cmd+wheel, and a fullscreen overlay, since mermaid's `useMaxWidth` shrinks a
  large diagram to the pane. Inline it carries a thin border: the `pre:has(.mermaid-block)` rule
  strips the code block's chrome, so without one the diagram floats loose in the prose. (Excalidraw
  diagrams never render inline — `[[Title.diagram]]` is a link to `/diagrams/:id`, not an embed.) `useMaxWidth` also pins the SVG at its *natural* width, so a diagram
  narrower than the pane sits at its own size rather than stretching — **deliberately left alone**:
  overriding that cap was tried and stretches a simple diagram until its nodes and labels are
  comically large. A diagram looking small is a pane-width problem, not a rendering one. Mermaid is the way to draw
  a diagram inline in a note; it works in chat replies too. Standalone Excalidraw diagrams live in
  the `/diagrams` module and are referenced by `[[Title.diagram]]` link.
- **Edge-numbering convention** — mermaid flows label their edges so a path can be read in order:
  `1`,`2`,`3` linear; `2a`/`2b` where only one branch is taken; `4.1`/`4.2` where every branch is;
  the shared number repeated on both edges where branches rejoin; structural edges (an import,
  "depends on") unlabelled; sequence diagrams use `autonumber` and state/ER/class diagrams stay
  unnumbered. The full table lives in
  [skills/pro-professor-notes/SKILL.md](../skills/pro-professor-notes/SKILL.md) § Numbering the
  edges — **canonical**; condensed copies ride in `MERMAID_TEMPLATE`
  ([constants/index.ts](../frontend/src/modules/notes/constants/index.ts)) and
  `NotesAiService.MERMAID_NUMBERING`, so a change to the notation touches all four.

## 5a. Markdown problems ([editor/lintMarkdown.ts](../frontend/src/modules/notes/editor/lintMarkdown.ts))

Markdown has no syntax errors: every input parses, so a mistake renders as *something else* instead
of raising anything. That is the failure mode worth surfacing — an unclosed fence swallows the rest
of the note, a table without its separator row becomes a paragraph of pipes, and malformed
frontmatter is caught and discarded server-side (`Frontmatter.parse`), silently taking the note's
title and tags with it.

`lintMarkdown(content, linkExists?)` is a pure client-side scan — **no new dependency, and no
server round trip** — returning `{ line, severity, message }[]` in line order. It reads the *raw*
buffer, frontmatter included and nothing stripped, so its 1-based line numbers map straight onto the
textarea. It checks: unclosed ``` / ~~~ fences (matching CommonMark's same-char, same-or-greater
length rule), table headers with a missing or mismatched `|---|` row, `#heading` with no space
(skipping single-`#` single-word lines, which are inline tags), frontmatter that never closes /
doesn't start on line 1 / indents with a tab / has a non-`key: value` top-level line, callout types
with no colour in `markdown.css`, unbalanced `$`/`$$` math, a **URL pasted into a `[[wiki-link]]`**
(which links nothing — `[[…]]` resolves a note *title*, so it offers to create a note named after
the address; the fix is `[text](url)`, and this one is reported whether or not a resolver was
supplied, being wrong syntax rather than an unresolved reference), and unresolved `[[wiki-links]]`
(deduplicated, skipping image and `.diagram` targets). Everything inside a fence is skipped.

Results render as the **Problems** section at the top of the Context tab, badged on the tab itself
so a count is visible while the rail shows chat. Clicking one calls NotesScreen's `jumpToLine`,
which selects that line and centers it via `measureCaret` — the counterpart to `scrollToHeading`,
which moves the preview instead: a problem is a fact about the *source*, so the caret has to land
where the fix goes. Severity colours match the toaster's (`text-red-400` / `text-amber-400`).

Results surface in two places. In the rail, as the **Problems** section at the top of the Context
tab, badged on the tab itself so a count is visible while the rail shows chat; clicking one calls
NotesScreen's `jumpToLine`, which selects that line and centers it via `measureCaret` — the
counterpart to `scrollToHeading`, which moves the preview instead: a problem is a fact about the
*source*, so the caret has to land where the fix goes.

In the editor itself, as a squiggle under the offending line, with the line's messages on hover.
Text inside a `<textarea>` can't be styled, so
[NoteEditor](../frontend/src/modules/notes/components/NoteEditor/NoteEditor.tsx) puts an **invisible mirror
layer** behind a transparent-background textarea: the same text, wrapped identically, carrying a
line number and a squiggle per line. Because the mirror wraps exactly like the textarea, markers on
a wrapped line align with **no measurement code** — the browser does it; this is the same trick
`caretPosition.ts` uses for the slash menu. The mirror takes the textarea's `clientWidth` (not
`offsetWidth` — the scrollbar is excluded, and that is the width the text actually wraps at), synced
by a layout effect after every render *and* a `ResizeObserver` for resizes that don't re-render
(SplitPane divider, rail edge). The textarea's ref is forwarded straight through, so `textActions`,
the slash menu, `jumpToLine` and AI streaming all keep operating on a plain textarea. Hover is
detected on the textarea, not the overlay, which would otherwise steal clicks. Severity colours
match the toaster's (`text-red-400` / `text-amber-400`); the squiggles are three data-URI waves in
`noteEditor.css`, one per severity, since `background-image` can't read `currentColor`.

Deliberately **not** checked: anything that is valid Markdown but not what was meant (`*italic*` for
`**bold**`, wrong list nesting), and mermaid fence contents — those can only fail at render, where
MermaidBlock reports mermaid's own parse error (§5). Syntax highlighting of the source is
out of reach on a textarea and largely redundant here: the preview renders from the *live* buffer, so
whenever it is on screen it already shows what is being typed, styled.

## 6. The AI note update (`notes.ai` package)

`POST /api/v1/notes/{id}/ai-update` — one SSE endpoint, shaped like
chat ([NotesAiController](../backend/central-server/src/main/java/com/proprofessor/server/notes/ai/NotesAiController.java)
runs on the shared `chatStreamExecutor`; frames are `note.start` / `note.chunk` / `note.done` /
`note.error`). Flow in [NotesAiService](../backend/central-server/src/main/java/com/proprofessor/server/notes/ai/NotesAiService.java):

> **The server never writes the note.** It generates a *proposal* and streams it back; the frontend
> stages it and the user applies or discards it (§6a). That review step is the safety net, which is
> why this path writes no `note_revisions` snapshot — the only thing that still does is a restore.
> The table now only grows through §6a's history, and an AI edit is undone with ⌘Z or by not saving.

1. System prompt, picked by scope (see §6b): `FULL_NOTE_SYSTEM_PROMPT` or `SELECTION_SYSTEM_PROMPT`.
   Both end with the same three constants — the Markdown dialect, mermaid label **syntax**, and the
   mermaid edge-**numbering** convention. Those last two are separate constants on purpose:
   `MERMAID_NUMBERING` is house style that
   [SKILL.md](../skills/pro-professor-notes/SKILL.md) owns and must be kept in step with, while
   `MERMAID_SYNTAX` is mermaid's own grammar — an unquoted `(` in a label is read as the start of a
   round node even inside an edge label, so the diagram fails to parse outright. Local models emit
   that regularly; the rule is what keeps them from it. The task prompt follows.
2. **The task prompt branches three ways.** With a `selection`, the whole note is sent with that
   span wrapped in `<<<EDIT_THIS>>>` markers and the task is
   `"rewrite ONLY the marked span… reply with its replacement text alone"`. Without one, a non-empty
   note gets `"Task: apply this instruction to the note… Current note:\n" + content` and an empty one
   gets `"Task: the note is currently empty — write it from scratch."` instead. Ending a prompt with
   `Current note:` and nothing after it leaves a small local model no content to anchor on, and it
   hands back the last text it *did* see — its own system prompt, straight into the editor.
3. Stream through a local model — `ollama`/`ai-service` → the existing `ChatCompletionClient`
   (OpenAI-compatible), guarded by `ModelActivationService.acquireForChat`/`releaseAfterChat`
   like a chat turn. Inference params come from the Notes settings row (§2 of
   [project-flow.md](project-flow.md) §2.8's `app_settings`).
4. Validate, then emit `note.done`: unwrap → empty check → **prompt-echo guard**, which fails with
   `502` when the reply opens with the system prompt's own first 120 characters. Either failure
   throws before `note.done`, so the client drops what it staged. Unwrapping is scope-dependent:
   a whole-note reply goes through `stripWrappingFence` (models fence the whole note despite
   instructions), a scoped one **must not** — the span being replaced is very often a ```` ```mermaid ````
   fence, and stripping it would hand back a bare diagram body that no longer renders. A scoped
   reply instead has any echoed `<<<EDIT_THIS>>>` markers removed.

The AI tab's model picker lists the locally activated models and **starts empty** — no model is
preselected, because which model rewrites a note is worth an explicit choice and a pre-filled picker
reads as one already made. Until one is chosen, a chat turn or note action stops with "Select a
model first".
Tokens stream into the AI tab's proposal block, never into the editor — **the editor stays fully
editable while the model runs**, since nothing is writing to it.

**The update saves first.** It builds its prompt from the note in the database, so running one over
a dirty buffer would rewrite a version of the note the user isn't looking at. NotesScreen saves
before dispatching and aborts if that fails.

## 6b. Scoped updates — editing a selection instead of the note

An update **rewrites only the editor selection** when there is one and the Context control (§6a) is
not on "Whole note". The model still reads the entire note, so it can match the surrounding style
and reuse what is defined elsewhere in it; it just may not answer with any of it.

- **The selection travels as text, not offsets.** The update saves the buffer first, and that save
  re-derives frontmatter (§3), which can shift every offset in the note. `NotesAiService.markSelection`
  locates the text with `indexOf` and wraps it in the markers.
- **A miss is a hard `400`**, never a silent fall back to a whole-note rewrite: the client splices
  the reply into an exact range, so quietly widening the scope under it would overwrite the wrong
  part of the note.
- **The range is frozen at dispatch** (`useNoteAi`'s `target`), because the caret keeps moving while
  the model streams. Apply re-resolves it — offsets first, then `indexOf` on the captured text — and
  **refuses** rather than guessing if the buffer no longer contains it.
- Apply splices through `replaceRange`/`applyTextState` exactly like the whole-note path (§4's
  execCommand rule), so a scoped edit is still one ⌘Z.

Everything outside the marked span is untouchable **by construction** — that constraint is what
makes Apply a safe splice rather than a whole-buffer replace that has to be trusted to have come
back otherwise unchanged. The cost is that the model has no channel for "the diagram further down
has the same problem": to widen the edit, clear the selection (or pick "Whole note") and run again.

## 6a. The AI tab (`NoteChatPanel`)

The **one** AI surface in the workspace: the chat thread, the §6 note update, and a single
composer, as the right rail's AI tab. The chat half reuses `POST /api/v1/chats/send` through the
shared `chats.stream.ts` client (global `src/services`, so no cross-module import). The **model
picker** sits at the **right of the mode tabs**, at the very bottom of the tab (shared
`ModelSelector` in its `iconOnly` mode, embeddings filtered out, locked while generating) — one
control for both the chat turns and the note actions, and the only one, so it carries no "Model"
label. `iconOnly` collapses the trigger to a round provider-coloured chip with the model name in a
tooltip: in a 320px rail a name costs a whole row, and that row was better spent on the composer.
(`fullWidth`, the mode chat's rail-width trigger uses, is still there — it fills its container and
clips the name with an ellipsis instead of sizing to it.)

**One input, one send key, a mode switch.** The composer is the single text box and **Enter** is
the only way to submit it; an **Ask / Update** radio pair directly beneath decides where it goes —
Ask answers from the note, Update rewrites it. A mode switch rather than a second button because the
two are mutually exclusive: with both on screen you could press the wrong one and not notice which
had consumed your text. The highlight is keyed on the *effective* mode, so opening an unsaved draft
(where Update is locked — it runs on the saved copy) visibly falls back to Ask instead of leaving a
selected mode whose send button is dead. `useNoteAi` holds no `instruction` state —
`runAction(instruction, target)` takes it as an argument and returns whether generation started, so
the caller only clears the composer on a real dispatch.

**`noteActionsEnabled` means "an update can be started", not "one is running".** The two were once
one prop, and folding them together made the panel forget it was in Update mode for the whole run:
the effective mode fell back to Ask, so the highlight moved, the composer showed its send arrow
instead of **Stop**, and Enter would have fired a chat turn mid-stream — leaving NotesBar's toolbar
Stop as the only way to cancel. The panel reads `ai.busy` itself for the running state; the toolbar
Stop stays, because the rail can be closed mid-generation and would otherwise strand it.

**Updates are staged, never applied.** The proposal streams into a scrollable block above the
composer, rendered through the same `Markdown`/`MarkdownBody`/`wiki` handlers as a chat reply so
`[[links]]` and mermaid look exactly as they will in the note. **Apply** writes it through
`applyTextState`/`replaceRange` — *not* `setContent`, which would wipe the browser's native undo
stack and make Apply the one edit ⌘Z can't take back (§4) — over the whole buffer, or over just the
targeted span for a scoped update (§6b), leaving the note dirty and unsaved so saving stays the
user's call. **Discard** drops it and the note is untouched. Stopping mid-stream
*keeps* what arrived: a cancelled run usually means "that's enough", and Discard is one click away.
`note.error` clears it, since that text is what the server just rejected.

Its **top edge drags** to grow the review area (a whole note rarely fits the default 256px). Two
things about that gesture are load-bearing, both of which it got wrong once:

- **Track a delta, not an absolute.** The height being set is the scroll body's alone, so deriving
  it from the *block's* bottom edge is off by the block's chrome (drag handle, header, Apply/Discard
  footer) — the top edge jumped ~70px on mousedown before it began following the cursor. Capture
  `startY`/`startHeight` and add the difference.
- **Measure the ceiling, don't budget it.** It was a single constant covering the composer, the mode
  tabs, the context block and the proposal's own chrome, which went stale the moment any of them
  grew — and the drag then pushed the composer and mode tabs past the bottom of the rail, where
  `RightRail`'s `overflow-hidden` clipped them off screen. Now only the *thread's* minimum is a
  constant (`MIN_THREAD_HEIGHT`); everything else is read off the bottom container at drag time, and
  a `ResizeObserver` re-applies the same ceiling when the rail is dragged narrower or the window
  resizes.

The scope selector is labelled **"Context"** and governs **both** halves: Ask carries that much of
the note as context, Update rewrites that much of it (§6b). One asymmetry — "None" is meaningless
for an edit, so it is disabled while Update is the active mode and read as "Auto" if it was already
set. The line beneath is keyed on the *active* mode, so it always states what Enter will really do
("Update will rewrite: Selection · 774 chars"); the old panel showed a selection count next to an
Update that then rewrote the whole note anyway, which is the confusion that prompted §6b.

- The note travels as **`noteContext`**, a per-turn field injected as a system message right before
  the current question and **never persisted**. Not `systemPrompt`: that is only honored when
  `conversationId` is null, so it would freeze the note as of the first message and silently answer
  about stale text.
- Scope is **Selection · Whole note · None**, defaulting to the selection when there is one, capped
  at `NOTE_CONTEXT_MAX_CHARS`. Trimming is the client's job — it is the side that knows about
  selections — and the panel shows what it will send. The cap is the **chat turn's alone**: an
  update sends no note text at all, only which span to edit, and the server already has the rest.
- New conversations started this way get `conversations.mode = 'note'`, which
  `ConversationRepository.findAll` and its `search` filter out, so they stay out of both the chat
  history and the ⌘K palette. The panel says so with an explicit **`noteChat: true`** on the send
  — *not* inferred from `noteContext` being present, because an empty note (or scope "None") sends
  no context and is still a note chat; inferring it filed those threads under chat history.
- The panel sends **no inference params**. The server fills them from the Notes settings row, so the
  sliders on the settings page govern the note chat as well as the update — one control for both AI
  surfaces of the notes module. (They are also `NOT NULL` on `conversations`, so something has to.)
  `findById` is unfiltered, so one can still be opened directly.
- History is **component state**, cleared (and any stream aborted) when the note changes. The
  conversation row survives server-side — that is where persistence would later hook in.
- Replies reach the note only through a per-message `⋯` menu (insert at cursor / replace selection /
  append / copy), disabled while an AI action owns the buffer. Applying makes the note dirty;
  saving stays the user's call.
- The chat's busy state is **separate from `aiBusy`** — sharing it would make the editor read-only
  while the AI answers, the opposite of what a side chat is for. The chat half also works on an
  unsaved draft (context comes from the buffer, and the chat API needs no note id); the note
  actions in the same tab do not, and are disabled until the first save.

## 7. Not implemented (by decision)

Phase 5 semantic RAG (`pgvector`, `mlx-embeddings` in ai-service, hybrid search, `/notes/ask`) —
optional per the plan and requires an ai-service handoff doc under `plans/` if ever wanted.

## 8. Related Docs

- [project-flow.md](project-flow.md) — overall system architecture.
- `docs/notes-feature-plan.md` — the original execution plan (removed after implementation).
- [frontend/docs/folder-structure.md](../frontend/docs/folder-structure.md) /
  [backend/central-server/docs/folder-structure.md](../backend/central-server/docs/folder-structure.md) /
  [project-rules.md](project-rules.md) — the conventions this module follows.
