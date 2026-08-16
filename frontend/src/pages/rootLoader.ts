import type { LoaderFunctionArgs } from "react-router";
import store from "@/redux/store";
import { setModels } from "@/redux/slices/modelsSlice";
import { setAudioCapabilities, setVoiceDefaults } from "@/redux/slices/audioSlice";
import { loadOptional } from "@/services/client/loadRoute";
import { modelsRoute, type GetAllModelsResponse } from "@/services/operations/models/models.route";
import { audioRoute, type GetAudioCapabilitiesResponse } from "@/services/operations/audio/audio.route";
import { settingsRoute, type GetSettingsResponse } from "@/services/operations/settings/settings.route";

const EMPTY: GetAllModelsResponse = { message: "", data: { models: [] } };
const NO_AUDIO: GetAudioCapabilitiesResponse | null = null;
const NO_SETTINGS: GetSettingsResponse | null = null;

/**
 * Root layout loader — the models list every module reads from `modelsSlice`, plus the voice
 * capabilities and defaults `audioSlice` holds. Seeded into Redux here rather than returned,
 * because their `useAppSelector` consumers (ModelSelector, ChatMessages, the settings panels)
 * sit below the routes that would have to prop-drill them.
 *
 * `loadOptional`: neither a models outage nor an AI core that is down must blank the whole app —
 * the app renders with an empty list, every screen's "no model available" state, and the voice
 * settings falling back to their built-in defaults.
 *
 * The root route sets `shouldRevalidate: () => false` — this runs once per page load,
 * not on every navigation.
 */
export async function rootLoader({ request }: LoaderFunctionArgs) {
  const [models, audio, settings] = await Promise.all([
    loadOptional(EMPTY, request.signal, modelsRoute.getAllModels),
    loadOptional(NO_AUDIO, request.signal, audioRoute.getAudioCapabilities),
    loadOptional(NO_SETTINGS, request.signal, settingsRoute.getSettings),
  ]);
  store.dispatch(setModels(models.data.models));
  store.dispatch(setAudioCapabilities(audio ? audio.data : null));
  if (settings) store.dispatch(setVoiceDefaults(settings.data.chat));
  return null;
}
