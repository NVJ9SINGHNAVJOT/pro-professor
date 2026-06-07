# Frontend

The web client for **Pro Professor**, a single-page app built with **React 19**, **Vite**,
and **TypeScript**. It talks to the [central-server](../backend/central-server/README.md)
over REST and WebSocket.

## Stack

- **React 19** with React Router 7
- **Vite** (rolldown-vite) + `@vitejs/plugin-react-swc`
- **TypeScript**
- **Tailwind CSS 4** + Radix UI primitives + `lucide-react` icons
- **Redux Toolkit** + React Redux for state
- **React Hook Form** for forms, **sonner** for toasts

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
npm run lint       # run ESLint
```

## Project structure

```text
src/
├── main.tsx        # app entry
├── App.tsx         # root component / routes
├── pages/          # route-level views
├── components/     # reusable UI components
├── context/        # React context providers
├── hooks/          # custom hooks
├── redux/          # Redux Toolkit store and slices
├── services/       # REST API clients
├── socket/         # WebSocket client
├── data/           # static data / constants
├── types/          # shared TypeScript types
└── utils/          # helpers
```

The `@` alias maps to `src/` (configured in `vite.config.ts` and `tsconfig`).
