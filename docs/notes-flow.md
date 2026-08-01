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
  is rewritten in place by the AI actions (§6), and everything round-trips through one `content`
  text column.

## 2. Database

The notes tables live in the consolidated `V1__init_schema.sql`:

| Table | Shape |
| --- | --- |
| `notes` | id BIGSERIAL, **title UNIQUE**, content, frontmatter jsonb, generated `content_tsv` tsvector column + GIN index for full-text search |
| `tags` / `note_tags` | `tags` (unique name) + `note_tags` link table |
| `note_links` | source_note_id, target_ref, link_type `link\|embed` — also read outside notes, by the media delete guard (see [project-flow.md](project-flow.md) §2.4) |
| `note_revisions` | note_id, content snapshot, created_at — written before every AI overwrite/restore |

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
  [sidebarRow.ts](../frontend/src/components/common/sidebarRow.ts)) so both explorers align.
  **There is no search box here** — ⌘K searches notes and chats together (see
  [project-flow.md](project-flow.md) §2.8a); `GET /notes/search` is now called from there.
  The whole pane **collapses**, using
  the chat sidebar's mechanics (outer element animates `w-67.5` ↔ `w-0`, inner keeps full width and
  fades, so nothing reflows on the way out) minus its mobile handling. `LeftNav` collapses with it,
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
  history, AI panel, right rail), plus a transient status strip while a *fragment* AI action runs,
  since those don't write to the editor. The title is the shared
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
  ([NoteEditor](../frontend/src/modules/notes/components/NoteEditor.tsx) — a plain `TextareaInput`
  plus a line-number gutter and inline problem squiggles, §5a) ⟷ preview split with a hand-rolled
  draggable divider ([SplitPane](../frontend/src/modules/notes/components/SplitPane.tsx)). The two
  panes **scroll in sync** proportionally, with a short driver lock so the pane being driven can't
  scroll the other one back. Cmd/Ctrl+S saves —
  and on `/notes/new` that save is the `POST` that creates the note (see §"New note" below);
  the graph view ([GraphView](../frontend/src/modules/notes/components/GraphView.tsx)) renders
  `GET /notes/links` as a *generated Mermaid definition* — solid arrows = links, dashed = embeds,
  dashed nodes = unresolved targets.
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

## 5. Shared rendering ([components/common/markdown/Markdown.tsx](../frontend/src/components/common/markdown/Markdown.tsx))

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
[NoteEditor](../frontend/src/modules/notes/components/NoteEditor.tsx) puts an **invisible mirror
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

## 6. AI note actions (`notes.ai` package)

`POST /api/v1/notes/{id}/ai-update | summarize | continue` — SSE endpoints shaped exactly like
chat ([NotesAiController](../backend/central-server/src/main/java/com/proprofessor/server/notes/ai/NotesAiController.java)
runs on the shared `chatStreamExecutor`; frames are `note.start` / `note.chunk` / `note.done` /
`note.error`). Flow in [NotesAiService](../backend/central-server/src/main/java/com/proprofessor/server/notes/ai/NotesAiService.java):

**Two shapes of action, carried on `note.start` as `mode`:**

| Action | `mode` | The model returns | The server does |
| --- | --- | --- | --- |
| `ai-update` | `replace` | the complete updated note | saves it as-is |
| `summarize` | `fragment` | `<summary>…</summary>` only | replaces/inserts the note's Summary section |
| `continue` | `fragment` | `<continuation>…</continuation>` only | appends it |

Only a rewrite legitimately needs the whole note back. Asking a local model to echo a long note
verbatim just to add one section makes it drift — reflowed paragraphs, dropped callouts — which
reads as the AI mangling the note, so the fragment actions ask for the new text alone.

1. System prompt: `FULL_NOTE_SYSTEM_PROMPT` for the rewrite, `FRAGMENT_SYSTEM_PROMPT` otherwise;
   both describe the Markdown dialect. A per-action task prompt follows. Fragment actions are fed
   `Frontmatter.parse(content).body()` — the YAML block is noise for them.
2. Stream through a local model — `ollama`/`ai-service` → the existing `ChatCompletionClient`
   (OpenAI-compatible), guarded by `ModelActivationService.acquireForChat`/`releaseAfterChat`
   like a chat turn.
3. **Fragment pipeline** — `extractBlock` (the delimiter is what makes the answer identifiable: a
   model that echoes the note *around* its answer still splices cleanly, and preambles fall outside
   the tag; an unclosed tag means a token cap, so the remainder is salvaged) → `stripWrappingFence`
   → drop a stray leading `# Summary` → empty check → **echo guard**: with no tag at all, a
   fragment reproducing the note's first 120 characters is the note handed back, so the action
   fails with `502` and saves nothing. Notes under 80 characters skip the check. Applied **whether
   or not the tag was used** — wrapping output in a delimiter is the easy half of the instruction
   and condensing the note is the hard half, so a model can comply with the format while handing
   the note straight back inside it.
4. On completion: **snapshot the old content into `note_revisions`** → save through
   `NotesService.updateNote` (re-parses frontmatter/links/tags) → emit `note.done` with the revision
   id. A restore snapshots the current content first, so restores are themselves undoable. Nothing
   is persisted on error/abort.

The AI tab's model picker lists the locally activated models and **starts empty** — no model is
preselected, because which model rewrites a note is worth an explicit choice and a pre-filled picker
reads as one already made. Until one is chosen, a chat turn or note action stops with "Select a
model first".
On `replace` the frontend streams tokens straight into the editor; on `fragment` it leaves the
buffer alone (the note is spliced server-side) and shows the text in a status strip, then refetches
on `note.done`. The editor is read-only during both — a fragment action's refetch would discard
anything typed meanwhile.

**AI actions save first.** They read the note from the database, so running one over a dirty buffer
would work off the stale saved copy and then the refetch would replace what was typed. NotesScreen
saves before dispatching and aborts if that fails.

## 6a. The AI tab (`NoteChatPanel`)

The **one** AI surface in the workspace: the chat thread, the §6 note actions, and a single
composer, as the right rail's AI tab. Everything reuses `POST /api/v1/chats/send` through the
shared `chats.stream.ts` client (global `src/services`, so no cross-module import). The **model
picker** heads the tab (shared `ModelSelector` in its `fullWidth` mode, embeddings filtered out,
locked while generating) — one control for both the chat turns and the note actions, and the only
one, so the row carries no "Model" label. `fullWidth` means the trigger **fills the rail and clips
the name with an ellipsis** instead of sizing to it: same `ModelOptionLabel` row as chat's trigger
(provider badge, name, modality badges), but built directly rather than through `SelectValue`,
which is the only way to give the name `min-w-0 truncate` while the badges keep their size. The
whole name is in a tooltip.

**One input, two jobs.** The composer is the single text box: **Enter** sends it to the chat,
**Rewrite** applies the same text as the note-edit instruction, and Summarize/Continue ignore it.
The three action buttons sit directly under the composer, which is what makes the second reading
discoverable. `useNoteAi` therefore holds no `instruction` state — `runAction(action, instruction)`
takes it as an argument and returns whether generation started, so the caller only clears the
composer on a real dispatch.

The scope selector is labelled **"Chat context"** deliberately: it governs the chat turn only. The
note actions always run server-side over the whole *saved* note, so an unlabelled control sitting
next to them would misread.

- The note travels as **`noteContext`**, a per-turn field injected as a system message right before
  the current question and **never persisted**. Not `systemPrompt`: that is only honored when
  `conversationId` is null, so it would freeze the note as of the first message and silently answer
  about stale text.
- Scope is **Selection · Whole note · None**, defaulting to the selection when there is one, capped
  at `NOTE_CONTEXT_MAX_CHARS`. Trimming is the client's job — it is the side that knows about
  selections — and the panel shows what it will send.
- New conversations started this way get `conversations.mode = 'note'`, which
  `ConversationRepository.findAll` filters out, so they stay out of the chat history.
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
