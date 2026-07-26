import type { LoaderFunctionArgs } from "react-router";
import store from "@/redux/store";
import { setModels } from "@/redux/slices/modelsSlice";
import { loadOptional } from "@/services/client/loadRoute";
import { modelsRoute, type GetAllModelsResponse } from "@/services/operations/models/models.route";

const EMPTY: GetAllModelsResponse = { message: "", data: { models: [] } };

/**
 * Root layout loader — the models list every module reads from `modelsSlice`.
 * Seeded into Redux here rather than returned, because its `useAppSelector` consumers
 * (ModelSelector, ChatMessages, useDefaultSelectedModel) sit below the routes that would
 * have to prop-drill it.
 *
 * `loadOptional`: a models outage must not blank the whole app — the app renders with an
 * empty list and every screen's "no model available" state.
 *
 * The root route sets `shouldRevalidate: () => false` — this runs once per page load,
 * not on every navigation.
 */
export async function rootLoader({ request }: LoaderFunctionArgs) {
  const response = await loadOptional(EMPTY, request.signal, modelsRoute.getAllModels);
  store.dispatch(setModels(response.data.models));
  return null;
}
