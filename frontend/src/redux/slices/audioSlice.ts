import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/modules/chat/types";
import type { AudioCapabilities } from "@/services/operations/audio/audio.route";

interface AudioState {
  /** What the AI core offers; null while unloaded, or when it was unreachable at boot. */
  capabilities: AudioCapabilities | null;
  /** App-wide voice defaults (Settings → Chat) — what a new conversation starts from. */
  defaults: VoiceSettings;
  loaded: boolean;
}

const initialState: AudioState = {
  capabilities: null,
  defaults: DEFAULT_VOICE_SETTINGS,
  loaded: false,
};

/**
 * Voice capabilities and defaults, seeded by `rootLoader` like the models list — both the chat
 * screen and the settings panel read them, and they sit below the routes that would otherwise have
 * to prop-drill them. `setAudioCapabilities` also runs from the settings loader, which is how the
 * lists recover after the AI core was down at boot.
 */
const audioSlice = createSlice({
  name: "audio",
  initialState,
  reducers: {
    setAudioCapabilities(state, action: PayloadAction<AudioCapabilities | null>) {
      state.capabilities = action.payload;
      state.loaded = true;
    },
    setVoiceDefaults(state, action: PayloadAction<VoiceSettings>) {
      state.defaults = action.payload;
    },
  },
});

export const { setAudioCapabilities, setVoiceDefaults } = audioSlice.actions;
export default audioSlice.reducer;
