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
- **Embeds (transclusion)**: `![[Note Title]]` inlines another note, `![[Note Title#Heading]]`
  inlines one section, and `![[image.png]]` embeds an uploaded image.
- **Diagram links**: `[[Title.diagram]]` is a link to a standalone diagram — clicking it opens that
  diagram in the app's diagram editor. (Diagrams are not embedded inline; use Mermaid for that.)
- **Callouts**: blockquotes starting with a marker —
  `> [!note]`, `> [!tip]` (also `hint`/`important`), `> [!warning]` (also `caution`),
  `> [!danger]` (also `error`/`bug`/`failure`), `> [!success]` (also `check`/`done`),
  `> [!question]` (also `help`/`faq`), `> [!example]`, `> [!quote]`.
  An optional custom title follows the marker: `> [!tip] Remember this`.
- **Tags**: inline `#tag` anywhere in the body, plus the frontmatter `tags` list. Both are indexed.
- **Mermaid diagrams**: a ```mermaid fenced block renders as a diagram inline — this is the way to
  draw a diagram inside a note. For a standalone, hand-drawn diagram, link to it with
  `[[Title.diagram]]` (the user creates that diagram in the app's diagram editor).

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
