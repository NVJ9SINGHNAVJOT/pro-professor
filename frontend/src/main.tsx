import ReactDOM from "react-dom/client";
import store from "@/redux/store.ts";
import { Provider } from "react-redux";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import App from "@/App.tsx";
import "@/index.css";
import { ROUTES } from "@/constants/routes";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import RouteError from "@/components/common/RouteError";
import AppSplash from "@/components/common/AppSplash";
import HomePage from "@/pages/index";
import ChatPage from "@/pages/chat/index";
import NotesPage from "@/pages/notes/index";
import DiagramsPage from "@/pages/diagrams/index";
import SettingsLayout, { SettingsNotesPage, SettingsStoragePage } from "@/pages/settings/index";
import ErrorPage from "@/pages/error/index";
import { rootLoader } from "@/pages/rootLoader";
import { chatListLoader, chatDetailLoader } from "@/pages/chat/loader";
import { notesListLoader, noteDetailLoader } from "@/pages/notes/loader";
import { diagramsListLoader, diagramDetailLoader } from "@/pages/diagrams/loader";
import { settingsLoader, storageLoader } from "@/pages/settings/loader";
import { detailShouldRevalidate } from "@/services/client/loadRoute";

// Page data is fetched by these loaders before the screen renders. Each child route carries its
// own errorElement so a failed load renders inside App's layout, keeping the nav chrome.
const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ),
    loader: rootLoader,
    // The models list is app-wide and effectively static — fetch it once per page load,
    // not on every navigation.
    shouldRevalidate: () => false,
    // The root loader runs before first paint; without this the initial load is a blank page.
    HydrateFallback: AppSplash,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      // Each section is a parent route whose loader seeds the sidebar list, plus a child route
      // owning the open item. The list loader runs once per entry into the section and never
      // again: mutations patch their row in the slice (see redux/createListSlice.ts), so there is
      // nothing left for a revalidation to do. The item route also serves the unsaved draft
      // (`/chat/new`, `/notes/new`, `/diagrams/new`) — its loader skips the fetch for `NEW_ITEM_ID`, and
      // keeping it on one route is what stops the screen remounting when the first save gives the
      // draft a real id.
      {
        path: "chat",
        element: <Outlet />,
        loader: chatListLoader,
        shouldRevalidate: () => false,
        errorElement: <RouteError />,
        children: [
          // A new chat is `/chat/new`, a value of the item route below — not a route of its own, or
          // the screen (and its in-flight stream) would be torn down when the first turn swaps
          // `new` for the real conversation id.
          { index: true, element: <Navigate to={ROUTES.CHAT_NEW} replace /> },
          {
            path: ":chatId",
            element: <ChatPage />,
            loader: chatDetailLoader,
            shouldRevalidate: detailShouldRevalidate("chatId"),
            errorElement: <RouteError />,
          },
        ],
      },
      {
        path: "notes",
        element: <Outlet />,
        loader: notesListLoader,
        shouldRevalidate: () => false,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <NotesPage /> },
          {
            path: ":noteId",
            element: <NotesPage />,
            loader: noteDetailLoader,
            shouldRevalidate: detailShouldRevalidate("noteId"),
            errorElement: <RouteError />,
          },
        ],
      },
      {
        path: "diagrams",
        element: <Outlet />,
        loader: diagramsListLoader,
        shouldRevalidate: () => false,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DiagramsPage /> },
          {
            path: ":diagramId",
            element: <DiagramsPage />,
            loader: diagramDetailLoader,
            shouldRevalidate: detailShouldRevalidate("diagramId"),
            errorElement: <RouteError />,
          },
        ],
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        errorElement: <RouteError />,
        children: [
          {
            path: "notes",
            element: <SettingsNotesPage />,
            loader: settingsLoader,
            errorElement: <RouteError />,
          },
          {
            path: "storage",
            element: <SettingsStoragePage />,
            loader: storageLoader,
            errorElement: <RouteError />,
          },
        ],
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
