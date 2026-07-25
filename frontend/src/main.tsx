import ReactDOM from "react-dom/client";
import store from "@/redux/store.ts";
import { Provider } from "react-redux";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import App from "@/App.tsx";
import "@/index.css";
import { ROUTES } from "@/constants/routes";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import HomePage from "@/pages/index";
import ChatPage from "@/pages/chat/index";
import NotesPage from "@/pages/notes/index";
import DiagramsPage from "@/pages/diagrams/index";
import SettingsPage from "@/pages/settings/index";
import ErrorPage from "@/pages/error/index";

const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ),
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "chat",
        element: <ChatPage />,
      },
      {
        path: "chat/:chatId",
        element: <ChatPage />,
      },
      {
        path: "notes",
        element: <NotesPage />,
      },
      {
        path: "notes/:noteId",
        element: <NotesPage />,
      },
      {
        path: "diagrams",
        element: <DiagramsPage />,
      },
      {
        path: "diagrams/:diagramId",
        element: <DiagramsPage />,
      },
      {
        path: "settings",
        element: <Navigate to={ROUTES.SETTINGS_NOTES} replace />,
      },
      {
        path: "settings/:section",
        element: <SettingsPage />,
      },
      {
        path: "error",
        element: <ErrorPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to={ROUTES.ERROR} />,
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <RouterProvider router={router} />
  </Provider>,
);
