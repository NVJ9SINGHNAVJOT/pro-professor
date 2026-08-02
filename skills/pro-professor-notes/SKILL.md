---
name: pro-professor-notes
description: Author complete Markdown notes for the Pro Professor app (Obsidian-like dialect — YAML frontmatter, wiki-links, embeds, callouts, KaTeX, mermaid diagrams). Use when asked to produce a note file the user will paste into Pro Professor.
---

# Writing a Pro Professor note

You are authoring a **complete Markdown note** for the Pro Professor app. The user will paste
your output into the app's source editor exactly as you produce it.

## Output contract

- Respond with **ONLY the complete Markdown note** — no explanations before or after it, and do
  **not** wrap the whole note in a code fence.
- Start with a YAML frontmatter block when the note benefits from a title/tags; otherwise a
  leading `# Heading` is fine.

## The app's Markdown dialect

- **Frontmatter** (optional): `title`, `tags` (list), `aliases` (list). Example below.
- **GitHub-flavored Markdown**: tables, task lists (`- [x]`), fenced code blocks.
- **Math (KaTeX)**: inline `$\varphi = \frac{1+\sqrt{5}}{2}$`, block `$$ … $$`.
- **Wiki-links**: `[[Note Title]]` and `[[Note Title#Heading]]`. Links may point at notes that
  don't exist yet — clicking one creates the note.
- **Embeds (transclusion)**: `![[Note Title]]` inlines another note and `![[Note Title#Heading]]`
  inlines one section of it.
- **Images** — two forms, both render inline the same way:
  - `![[image.png]]` embeds a file **already uploaded to the app**. Reference it by its exact
    filename and the app resolves that to the image's URL when the note is opened. An unknown
    filename shows an unresolved placeholder until that file is uploaded and the note is re-saved.
  - `![alt text](https://…)` embeds an image by URL — plain Markdown, for a URL you were given.
  - Only use image references the user actually gave you — never invent a filename or a URL.
  - A URL inside `![[ ]]` does **not** work, and neither do `data:` base64 URIs.
- **Diagram links**: `[[Title.diagram]]` is a link to a standalone diagram — clicking it opens that
  diagram in the app's diagram editor. (Diagrams are not embedded inline; use Mermaid for that.)
- **Callouts**: blockquotes starting with a marker —
  `> [!note]`, `> [!tip]` (also `hint`/`important`), `> [!warning]` (also `caution`),
  `> [!danger]` (also `error`/`bug`/`failure`), `> [!success]` (also `check`/`done`),
  `> [!question]` (also `help`/`faq`), `> [!example]`, `> [!quote]`.
  An optional custom title follows the marker: `> [!tip] Remember this`.
- **Tags**: inline `#tag` anywhere in the body, plus the frontmatter `tags` list. Both are indexed.
- **Mermaid diagrams**: a ```mermaid fenced block renders as a diagram inline — this is the way to
  draw a diagram inside a note, and its edges carry the step numbers described below. For a
  standalone, hand-drawn diagram, link to it with `[[Title.diagram]]` (the user creates that
  diagram in the app's diagram editor).

## Numbering the edges

In a mermaid diagram, number every edge that is a **step in a flow**, so the path can be followed
in order. Edges that represent **structure** (an import, "depends on") are never numbered — that
difference is the point of the notation.

| Situation | Notation | Read it as |
|---|---|---|
| Linear step | `1`, `2`, `3` | happens next |
| **Split — either/or** (one branch is taken) | same number, letter suffix: `2a`, `2b` | *or* |
| **Split — fan-out** (every branch is taken) | dotted decimal: `4.1`, `4.2` | *and* |
| **Converge** (branches rejoin) | the shared number repeats on both incoming edges | both paths arrive at the same step |
| Structural / dependency edge | no label | not part of any flow |

So when an arrow reaches a box and then splits in two, the question is whether the flow picks one
exit or takes both. Picks one → `2a` / `2b` (they are the *same* step, two outcomes, so the counter
does **not** advance twice). Takes both → `4.1` / `4.2` (one step, two effects). When the branches
meet again, the next number is written once on each incoming arrow, not renumbered per branch:

```mermaid
flowchart LR
    a["step"] -->|1| b["branch point"]
    b -->|2a| c["taken when X"]
    b -->|2b| d["taken when not X"]
    c -->|3| e["rejoin"]
    d -->|3| e
    e -->|"4.1"| f["both happen"]
    e -->|"4.2"| g["both happen"]
```

Two diagram types opt out:

- **Sequence diagrams** use mermaid's `autonumber`, which counts messages linearly. Branching is
  already expressed by the `alt` / `else` blocks, so the letter suffixes are redundant there — an
  `alt` block visually brackets its own alternative.
- **Graphs whose edges are relationships rather than steps** — state diagrams, ER diagrams, class
  diagrams — have no step order at all: their edges are transitions and relationships, not a
  sequence. They stay unnumbered.

## Title rules

The note's title comes from frontmatter `title` → else the first `#` heading → else "Untitled".
Titles are unique app-wide (a clash gets a numeric suffix), and wiki-links resolve by title —
so pick a stable, descriptive title.

## Example

```
---
title: Spaced Repetition
tags: [study, memory]
---

# Spaced Repetition

> [!tip] The core idea
> Review just before you forget — intervals grow with each success.

The forgetting curve decays roughly as $R = e^{-t/S}$.

![Forgetting curve](https://example.com/forgetting-curve.png)

## Schedule

| Review | Interval |
| --- | --- |
| 1st | 1 day |
| 2nd | 3 days |

See [[Active Recall]] and the flow below.

![[Study Loop.diagram]]

#learning
```

(When actually responding, output the note content directly — the fence above exists only to
delimit this example.)
