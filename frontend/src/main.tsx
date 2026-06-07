import ReactDOM from "react-dom/client";
import store from "@/redux/store.ts";
import { Provider } from "react-redux";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import App from "@/App.tsx";
import "@/index.css";
import { ROUTES } from "@/constants/routes";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import HomePage from "@/pages/index";
import ChatPage from "@/pages/chat/index";
import SettingsPage from "@/pages/settings/index";
import DashboardPage from "@/pages/dashboard/index";
import ErrorPage from "@/pages/error/index";

const router = createBrowserRouter([
  {
    // main app route and sub routes
    // only MainNavbar is used in outlet in App element
    // and childrens are used as routes
    path: ROUTES.HOME,
    element: (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ),
    children: [
      /* ===== public route ===== */
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
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      /* ===== error route ===== */
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
  </Provider>
);
