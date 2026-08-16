# Pro Professor — what to use for what

A map of the app's surfaces: which control does what, and which one to reach for when. Written for
the person *using* the app rather than the person building it — for how the code is laid out, see
each tier's own `docs/` folder ([frontend](../frontend/docs/folder-structure.md),
[central-server](../backend/central-server/docs/folder-structure.md),
[storage-server](../backend/storage-server/docs/architecture.md)).

---

## The four sections

Click the logo (top-left of any sidebar) to open the nav drawer.

| Section | Use it when |
| --- | --- |
| **Chat** (`/chat`) | You want a conversation. Nothing is written anywhere else; history is per-conversation. |
| **Notes** (`/notes`) | You want to *keep* something — a document you'll come back to, link to, and search. |
| **Diagrams** (`/diagrams`) | You want to draw. A freehand Excalidraw canvas, one scene per diagram. |
| **Settings** (`/settings`) | Voice defaults for chat, default inference params for the Notes AI, and the file store. |

The rule of thumb: **chat is throwaway, notes are permanent.** If you'd be annoyed to lose it, it
belongs in a note.

---

## Notes

### Left pane — the explorer

- **New note (toolbar button)** — costs nothing until you save it. It's a draft at the top level;
  leaving it unsaved leaves nothing behind.
- **New note (right-click a folder)** — different on purpose. A row appears *inside that folder*
  with a suggested name ("Untitled", "Untitled 2", …) ready to type over. **Enter** creates it there
  and opens it; **Escape** creates nothing. Same for folders in the card view and for diagrams.
- **Search** — matches titles and tags instantly as you type, and full note *content* a moment later
  (that half is a server-side full-text search, so it lags by a keystroke or two).
- **Tags** — a collapsible tree of every tag → the notes carrying it. Tags come from frontmatter
  (`tags: [x, y]`) or inline `#tags` in the body.
- **Right-click a row** for its actions (Rename, Delete). Rows are ordered **A→Z by name**, folders
  first, so nothing moves when you save.
- **Deleting a folder takes everything inside it** — subfolders and their notes. You're asked first,
  and the dialog says how much goes. Nothing undoes it.

### Middle pane with nothing open — the card view

The explorer as cards, one folder at a time. Double-click to open (a folder descends, a note opens),
right-click a card to act on it, right-click empty space to create, and drag cards onto folder cards
to file them. The breadcrumb walks back up, and the folder you're in is in the URL, so the view
survives a reload.

### Top bar — left to right

| Control | What it does |
| --- | --- |
| Panel icon | Collapses/expands the explorer. |
| **Title** | Rename. **Enter** (or clicking away) commits it, **Escape** puts the old one back. It renames *only* the title — unsaved body edits stay unsaved, and no revision is written. |
| Graph icon | The whole vault as a link graph (see below). |
| Source / Split / Preview | Which half of the editor you see. |
| **Save** | Writes the body. Also `⌘S`. Greyed out when there's nothing to save. |
| History icon | Revision list for this note. |
| ✨ | Opens the AI tab — and turns into **Stop** while the model is running. |
| Rail icon | Shows/hides the right rail. |

The **amber dot** left of the buttons means the body has unsaved changes.

### Writing

- `⌘S` save · `⌘P` (or `⌘K`) command palette · `Tab` / `⇧Tab` indent · Enter continues a list.
- **`/` at the start of a line** opens the block menu: headings, lists, task list, quote, callout,
  table, divider, wiki link, embed, math, code block, Mermaid diagram.
- **`[[Note Title]]`** links to another note. Clicking an unresolved one *creates* that note as a
  draft seeded with its title. `[[Note#Heading]]` jumps to a heading; `[[Note|alias]]` renames the
  link text.
- **`![[file.png]]`** embeds an uploaded image; `![[Other Note]]` embeds another note's content.
- **`[[Title.diagram]]`** opens a diagram from the diagrams section.
- ` ```mermaid ` blocks render as diagrams **inside** a note. Use those for a quick flowchart in
  prose; use the Diagrams section when the drawing is the point.

### Command palette (`⌘P` / `⌘K`)

Everything above, searchable: new note, view modes, panels, history, every formatting action, the
three AI actions, and **every note by title** (to jump to it). Reach for it when you don't want to
hunt for a button.

### Revision history

Snapshots are written **before an AI action overwrites the note** (and before a restore). They
capture *content only* — a rename never creates one. Use it to undo an AI edit you don't like.

### Graph view

`GET /notes/links` drawn as a graph: solid arrows are links, dashed are embeds, dashed nodes are
links pointing at notes that don't exist yet. Use it to find orphans and dead links.

### Right rail — Context tab vs AI tab

- **Context** — this note's *backlinks* (who links here), its outgoing links, its outline
  (click a heading to scroll there), and its tags. Read-only navigation.
- **AI** — everything model-driven. Detailed below.

Drag the rail's left edge to resize it.

---

## The AI tab (the one that needs explaining)

Four controls, in the order they appear.

### 1. Model picker (top row)

The model both the chat *and* the note actions run on. Names are clipped to fit — hover for the
full name. Locked while the model is generating.

### 2. Chat context — Auto · Whole note · None

Governs **only what the chat turn sees**:

| Mode | Sends |
| --- | --- |
| **Auto** | Your editor selection if you have one, otherwise the whole note. The default. |
| **Whole note** | Always the full note, selection or not. |
| **None** | Nothing — a plain chat that happens to live in this pane. |

The line underneath tells you exactly what will be sent and how large it is. **The note actions
ignore this setting entirely** — they always run server-side over the whole *saved* note.

### 3. The composer — one box, two jobs

- **Enter** → asks the chat. Nothing in your note changes.
- **Rewrite** → the same text becomes an *instruction*, applied to the note.

That's the whole trick: type "make this shorter and add a summary", press Enter to *discuss* it,
press Rewrite to *do* it.

### 4. Chat vs the three actions

| You want to… | Use |
| --- | --- |
| Ask a question, brainstorm, check something — without touching the note | **Chat** (Enter) |
| Change the note per an instruction you type | **Rewrite** |
| Add or refresh a summary section | **Summarize** |
| Keep writing from where the note ends | **Continue** |

Things worth knowing about the three actions:

- They **need a saved note**, and they save first if the buffer is dirty — otherwise the model would
  work from the stale saved copy and then overwrite what you'd typed.
- They rewrite the note **in place** and take a revision snapshot first, so History is your undo.
- Summarize and Continue ignore the composer text. Only Rewrite reads it.
- **Rewrite is the whole-note one.** To change one paragraph, select it, ask in chat, then apply the
  reply with the `⋯` menu (next item) — that's the surgical path.

### Applying a chat reply

Hover any reply → `⋯` → **Insert at cursor** · **Replace selection** · **Append to note** · **Copy**.
Applying makes the note dirty like any other edit, so it's undoable in the editor and nothing is
persisted until you save. This is the deliberate difference from the actions above: **chat never
touches your note unless you say so; the actions always do.**

### Stop

Both the ✨ button in the toolbar and the composer's button become Stop while the model runs — so
you can still abort with the rail closed.

---

## Diagrams

- Excalidraw canvas, one scene per diagram, **autosaved** ~0.8s after you stop drawing ("Saved" pill
  in the top bar).
- **Title** behaves exactly like a note's: Enter/Escape, rename only, no scene round-trip.
- The sidebar and card view work exactly like the notes ones — nested folders, drag to move, A→Z
  ordering, right-click to create/rename/delete, and the same confirm before a folder cascade.
  **New diagram** from the toolbar is a blank draft canvas at the top level; from a folder's
  right-click menu it's created in that folder as soon as you accept the name.
- **No AI here.** Diagrams are drawn by hand. For a generated diagram, write Mermaid in a note.
- Deleting a diagram (or a folder containing one) is **refused** while a note still links to it with
  `[[Title.diagram]]` — the error names the note. Remove the link first.

---

## Chat

- The **model picker** in the header is locked once a conversation has started — a thread stays on
  the model it began with.
- **Chat settings** (gear) open in a dialog — close it with ✕, Escape, or a click outside. It holds
  max tokens, temperature, top-p, repetition penalty, a system prompt (honored only on the first
  message of a conversation), verbose/thinking toggles where the model supports them, and this
  chat's **voice** settings.
- The **context meter** shows how much of the model's window the conversation is using.
- Voice: record → the model thinks → it speaks back; audio replies get a player.
- **Voice settings** — which speech-to-text model transcribes you (used by the mic in the composer
  and by voice mode alike), the voice, language and speed replies are spoken in, and whether a model
  that accepts audio should hear the recording itself instead of being handed a transcript. A chat
  starts from the defaults in Settings → Chat; changing them here applies to that chat only, and
  sticks with it when you reopen it.
- Only **one model is resident at a time** across the local backends. If something else is
  generating, you'll see a "busy" toast rather than a queued request — wait for it to finish.

---

## Settings

- **Chat** — the voice defaults every new conversation starts from: the speech-to-text model, the
  voice, language and speed replies are spoken in, and whether an audio-capable model listens to the
  recording directly. The lists come from the AI core, so they are empty while it is down. A
  conversation can override any of them from its own settings dialog.
- **Notes** — default inference parameters for the notes AI actions (rewrite / summarize / continue).
  Chat keeps its own per-conversation settings; these don't affect it.
- **Storage** — every uploaded file, with a download and a delete. A file is **locked** while a chat
  message or a note embed still references it ("In use" badge, delete disabled), so nothing can turn
  a live embed into a dead link.

---

## Quick answers

| "How do I…" | |
| --- | --- |
| rename a note or diagram without saving my edits | Type in the title, press **Enter**. That's all it writes. |
| undo what the AI did to my note | History icon → pick the revision before it → restore. |
| get AI output into my note *without* rewriting the whole thing | Ask in chat, then `⋯` → Insert / Replace selection. |
| ask about only one paragraph | Select it — Chat context "Auto" sends the selection. |
| find a note when I only remember a phrase inside it | Explorer search; content matches arrive a beat after title matches. |
| see what links to this note | Right rail → Context → Backlinks. |
| link a drawing into a note | `[[Diagram Title.diagram]]` |
| draw something inside a note instead | ` ```mermaid ` block (or `/` → Mermaid diagram). |
