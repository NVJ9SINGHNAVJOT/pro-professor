# Pro Professor — AI Authoring Skills

Portable prompt packs that teach **any** AI model (Claude on web, ChatGPT, a local model, …)
to produce files you can paste straight into Pro Professor:

| Skill | Produces | Paste it via |
| --- | --- | --- |
| [pro-professor-notes](pro-professor-notes/SKILL.md) | a complete Markdown note in the app's dialect | Notes → **New note** → paste into the source editor → Save |

## How to use

- **Claude (claude.ai):** upload a skill folder as an Agent Skill (each folder is a standard
  `SKILL.md` package), then just ask for a note — the skill activates by itself.
- **Any other model:** copy the body of the relevant `SKILL.md` into the chat as your first
  message (or system prompt), then describe the note you want.

## Scope note

These skills are **authoring** contracts for external models: produce a whole note, paste it in.

The app's built-in AI actions use their own *editing* contracts, wired into the backend pipeline
(`NotesAiService` in `backend/central-server`) — intentionally separate and not meant to be copied
into a chat. There are two of them, and only the first resembles what's here: **Rewrite** returns a
complete note, while **Summarize** and **Continue** return only delimited new text that the server
splices into the existing note. See [docs/notes-flow.md](../docs/notes-flow.md) §6 for the pipeline.
