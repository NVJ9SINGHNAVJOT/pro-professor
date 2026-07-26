import { TriangleAlertIcon, RotateCcwIcon } from "lucide-react";
import { isRouteErrorResponse, useNavigate, useRouteError, useRevalidator } from "react-router";
import { ROUTES } from "@/constants/routes";

/** The `ApiError` shape `loadRoute.load` throws as the router error response body. */
const messageOf = (error: unknown): string => {
  if (isRouteErrorResponse(error)) {
    const body = error.data as { message?: string } | null;
    // status 0 is fetchApi's "the request never reached the server"
    if (error.status === 0) return "Can't reach the server. Is it running?";
    return body?.message || error.statusText || "Something went wrong";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
};

/**
 * Rendered as a route's `errorElement` when its loader fails: the server's own message, plus a
 * Retry that revalidates. Attached per child route, so it renders inside `App`'s layout and the
 * nav chrome stays usable.
 */
const RouteError = () => {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const status = isRouteErrorResponse(error) && error.status > 0 ? error.status : null;

  return (
    <div className="flex h-full min-w-minContent flex-col items-center justify-center gap-y-4 bg-grey px-6 text-white">
      <TriangleAlertIcon className="size-10 text-neutral-500" />
      <div className="flex flex-col items-center gap-y-1.5 text-center">
        <h1 className="para-medium-semibold">{status ? `Couldn't load this page (${status})` : "Couldn't load this page"}</h1>
        <p className="max-w-md para-small-regular text-neutral-400">{messageOf(error)}</p>
      </div>
      <div className="flex items-center gap-x-2">
        <button
          type="button"
          onClick={() => revalidator.revalidate()}
          disabled={revalidator.state === "loading"}
          className="flex cursor-pointer items-center gap-x-2 rounded-lg bg-white px-4 py-2 para-small-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcwIcon className="size-4" />
          {revalidator.state === "loading" ? "Retrying…" : "Retry"}
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="cursor-pointer rounded-lg border border-neutral-800 px-4 py-2 para-small-medium text-neutral-300 hover:bg-neutral-800"
        >
          Go home
        </button>
      </div>
    </div>
  );
};

export default RouteError;
