import { useState } from "react";
import { SaveIcon } from "lucide-react";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { settingsRoute, type AppSettings } from "@/services/operations/settings/settings.route";
import type { InferenceParams } from "@/modules/chat/types";
import { NOTES_DEFAULT_PARAMS } from "@/modules/settings/constants";
import InferenceParamsPanel from "@/modules/settings/components/InferenceParamsPanel";

interface NotesSettingsPanelProps {
  /** Current values from the route loader; the fetch and its failure path live there. */
  initial: InferenceParams;
}

/**
 * Global default inference params for the Notes AI actions. Saved to the backend
 * `app_settings` singleton; the defaults are applied server-side, so nothing else reads this.
 */
const NotesSettingsPanel = ({ initial }: NotesSettingsPanelProps) => {
  const { execute: saveSettings } = useApi(settingsRoute.updateSettings);

  const [notesParams, setNotesParams] = useState<InferenceParams>(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const payload: AppSettings = { notes: notesParams };
    const res = await saveSettings(payload);
    setSaving(false);
    if (res.response) toast.success("Settings saved");
    else if (res.error) toast.error(res.error.message);
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="heading-semibold text-white">Notes</h1>
        <p className="mt-1.5 para-small-regular text-neutral-400">
          Default inference parameters applied to the Notes AI actions. Chat keeps its own per-conversation settings.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <InferenceParamsPanel
          title="Notes"
          description="Used when the AI rewrites, summarizes, or continues a note."
          params={notesParams}
          onChange={setNotesParams}
          onReset={() => setNotesParams(NOTES_DEFAULT_PARAMS)}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex cursor-pointer items-center gap-x-2 rounded-lg bg-white px-4 py-2 para-small-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SaveIcon className="size-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
};

export default NotesSettingsPanel;
