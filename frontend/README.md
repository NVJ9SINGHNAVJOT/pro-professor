# Frontend

The web client for **Pro Professor**, a single-page app built with **React 19**, **Vite**, and
**TypeScript**. It talks only to the [central-server](../backend/central-server/README.md)
gateway — REST + SSE for chat/notes/diagram streaming, and a WebSocket for notifications.

## Stack

- **React 19** (with the React Compiler babel preset) + **React Router 8**
- **Vite** (rolldown-vite) + `@vitejs/plugin-react`
- **TypeScript**
- **Tailwind CSS 4** + Radix/shadcn primitives + `lucide-react` icons
- **Redux Toolkit** + React Redux for state
- **ajv** (diagram document validation), **react-markdown** + KaTeX + Mermaid rendering
- **vitest** for tests

## Requirements

- **Node.js 20+** and npm

## Configuration

Copy the example env and adjust as needed:

```bash
cp .env.example .env
```

| Variable                          | Description                                  |
| --------------------------------- | -------------------------------------------- |
| `VITE_REACT_APP_ENVIRONMENT`      | `development` / `production`                  |
| `VITE_REACT_APP_BASE_URL_SERVER`  | central-server REST base, e.g. `http://localhost:4000/api/v1` |
| `VITE_PROFESSOR_NAME`             | display name for the AI professor            |

Vite only exposes variables prefixed with `VITE_` to the client.

## Scripts

```bash
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:5173)
npm run build      # type-check (tsc -b) and build to dist/
npm run preview    # preview the production build locally
npm test           # run the vitest suite
npm run lint       # run ESLint
npm run format     # prettier --write
```

## Project structure

```text
src/
├── main.tsx        # app entry + router
├── App.tsx         # root layout (Outlet + nav + toaster)
├── pages/          # thin route wrappers that mount module screens
├── modules/        # feature modules — chat, notes, diagram (see docs/)
├── components/     # shared UI (common/ + Radix/shadcn base in ui/)
├── constants/      # global constants (routes, …)
├── context/        # global providers (SocketProvider)
├── hooks/          # shared hooks (useApi, …)
├── redux/          # store + modelsSlice (page data lives in route loaders)
├── services/       # REST/SSE clients (client/ + operations/ per feature)
├── socket/         # WebSocket client
├── lib/            # small helpers (cn, …)
├── styles/         # global CSS (typography, …)
├── types/          # shared TypeScript types
└── utils/          # global helpers
```

The `@` alias maps to `src/` (configured in `vite.config.ts` and `tsconfig`).

## Docs

- [docs/folder-structure.md](docs/folder-structure.md) — the module architecture and frontend
  conventions to follow when adding code.
- There is deliberately no system-flow doc — read the code. Orientation and cross-tier facts:
  [.claude/CLAUDE.md](../.claude/CLAUDE.md); what each surface does: [usage.md](../docs/usage.md).
- [../skills/](../skills/README.md) — prompt packs for authoring notes/diagrams with external
  AI models and pasting them into the app.
