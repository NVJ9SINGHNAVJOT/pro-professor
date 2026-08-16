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

The app's built-in **Update note** action uses its own *editing* contract, wired into the backend
pipeline (`NotesAiService` in `backend/central-server`) — intentionally separate and not meant to be
copied into a chat. It resembles what's here in that it returns a complete note, but it is given the
current one plus an instruction, and the result is staged for the user to apply rather than saved.
`NotesAiService` is the pipeline — read it there.
