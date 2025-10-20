import ReactDOM from "react-dom/client";
import store from "@/redux/store.ts";
import { Provider } from "react-redux";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import App from "@/App.tsx";
import "@/index.css";
import Home from "@/pages/Home";
import Error from "@/pages/Error";
import ErrorBoundary from "@/components/error/ErrorBoundary";

const router = createBrowserRouter([
  {
    // main app route and sub routes
    // only MainNavbar is used in outlet in App element
    // and childrens are used as routes
    path: "/",
    element: (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ),
    children: [
      /* ===== public route ===== */
      {
        index: true,
        element: <Home />,
      },
      /* ===== error route ===== */
      {
        path: "error",
        element: <Error />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/error" />,
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <RouterProvider router={router} />
  </Provider>
);
