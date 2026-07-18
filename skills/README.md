# Pro Professor — AI Authoring Skills

Portable prompt packs that teach **any** AI model (Claude on web, ChatGPT, a local model, …)
to produce files you can paste straight into Pro Professor:

| Skill | Produces | Paste it via |
| --- | --- | --- |
| [pro-professor-notes](pro-professor-notes/SKILL.md) | a complete Markdown note in the app's dialect | Notes → **New note** → paste into the source editor → Save |
| [pro-professor-diagrams](pro-professor-diagrams/SKILL.md) | a complete `.diagram` JSON document (DiagramBundle) | Diagrams → **Import** → paste the JSON |

## How to use

- **Claude (claude.ai):** upload a skill folder as an Agent Skill (each folder is a standard
  `SKILL.md` package), then just ask for a note or a diagram — the skill activates by itself.
- **Any other model:** copy the body of the relevant `SKILL.md` into the chat as your first
  message (or system prompt), then describe the note/diagram you want.

## Scope note

These skills are **authoring** contracts for external models. The app's built-in AI actions use
their own *editing* contracts wired into the backend pipeline
(`NotesAiService` / `DiagramAiService` in `backend/central-server`) — those are intentionally
separate and are not meant to be copied into a chat.
