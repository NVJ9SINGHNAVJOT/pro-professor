import { useState } from "react";
import { SaveIcon } from "lucide-react";
import Button from "@/components/common/Button";
import { toast } from "@/components/common/toast";
import VoiceSettingsControls from "@/components/common/VoiceSettingsControls";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { setVoiceDefaults } from "@/redux/slices/audioSlice";
import { settingsRoute, type AppSettings } from "@/services/operations/settings/settings.route";
import type { InferenceParams, VoiceSettings } from "@/modules/chat/types";

interface ChatSettingsPanelProps {
  /** Current values from the route loader; the fetch and its failure path live there. */
  initial: VoiceSettings;
  /** The Notes params travel with the save — `PUT /settings` writes both blocks at once. */
  notes: InferenceParams;
}

/**
 * App-wide voice defaults for chat. Every new conversation starts from these; the chat's own
 * settings panel can override them for that conversation, which is then what the chat remembers.
 */
const ChatSettingsPanel = ({ initial, notes }: ChatSettingsPanelProps) => {
  const { execute: saveSettings } = useApi(settingsRoute.updateSettings);
  const dispatch = useAppDispatch();

  const [voice, setVoice] = useState<VoiceSettings>(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const payload: AppSettings = { notes, chat: voice };
    const res = await saveSettings(payload);
    setSaving(false);
    if (res.response) {
      // Keep the slice in step so a chat started next picks up the new defaults without a reload.
      dispatch(setVoiceDefaults(res.response.data.chat));
      toast.success("Settings saved");
    } else if (res.error) {
      toast.error(res.error.message);
    }
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="heading-semibold text-white">Chat</h1>
        <p className="mt-1.5 para-small-regular text-neutral-400">
          Default voice settings for chat — which model transcribes what you say, and how replies are
          spoken back. A chat can override them from its own settings panel.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <div className="mb-5">
            <h2 className="para-medium-semibold text-white">Voice</h2>
            <p className="mt-1 caption-small-regular text-neutral-400">
              Applied to the composer's dictation button and to voice chat.
            </p>
          </div>

          <VoiceSettingsControls value={voice} onChange={setVoice} />
        </section>

        <div className="flex justify-end">
          <Button onClick={handleSave} pending={saving} icon={SaveIcon}>
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
};

export default ChatSettingsPanel;
