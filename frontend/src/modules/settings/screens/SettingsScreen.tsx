import { useEffect, useState } from "react";
import { SaveIcon } from "lucide-react";
import Page from "@/components/common/Page";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { settingsRoute, type AppSettings } from "@/services/operations/settings/settings.route";
import type { InferenceParams } from "@/modules/chat/types";
import { NOTES_DEFAULT_PARAMS, DIAGRAM_DEFAULT_PARAMS } from "@/modules/settings/constants";
import InferenceParamsPanel from "@/modules/settings/components/InferenceParamsPanel";

/**
 * Global default inference params for the Notes and Diagrams AI actions. Loaded from and saved to the
 * backend `app_settings` singleton; the defaults are applied server-side, so nothing else reads this.
 */
const SettingsScreen = () => {
  const { execute: fetchSettings, loading } = useApi(settingsRoute.getSettings);
  const { execute: saveSettings } = useApi(settingsRoute.updateSettings);

  const [notesParams, setNotesParams] = useState<InferenceParams | null>(null);
  const [diagramParams, setDiagramParams] = useState<InferenceParams | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetchSettings();
      if (res.response) {
        setNotesParams(res.response.data.notes);
        setDiagramParams(res.response.data.diagram);
      } else if (res.error) {
        toast.error(res.error.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!notesParams || !diagramParams) return;
    setSaving(true);
    const payload: AppSettings = { notes: notesParams, diagram: diagramParams };
    const res = await saveSettings(payload);
    setSaving(false);
    if (res.response) toast.success("Settings saved");
    else if (res.error) toast.error(res.error.message);
  };

  const ready = notesParams != null && diagramParams != null;

  return (
    <Page className="overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 pb-16 pt-20">
        <header className="mb-8">
          <h1 className="heading-semibold text-white">Settings</h1>
          <p className="mt-1.5 para-small-regular text-neutral-400">
            Default inference parameters applied to the Notes and Diagrams AI actions. Chat keeps its own
            per-conversation settings.
          </p>
        </header>

        {loading && !ready ? (
          <p className="para-small-regular text-neutral-500">Loading settings…</p>
        ) : ready ? (
          <div className="flex flex-col gap-6">
            <InferenceParamsPanel
              title="Notes"
              description="Used when the AI rewrites, summarizes, or continues a note."
              params={notesParams}
              onChange={setNotesParams}
              onReset={() => setNotesParams(NOTES_DEFAULT_PARAMS)}
            />
            <InferenceParamsPanel
              title="Diagrams"
              description="Used when the AI edits a diagram. A lower temperature yields more schema-valid patches."
              params={diagramParams}
              onChange={setDiagramParams}
              onReset={() => setDiagramParams(DIAGRAM_DEFAULT_PARAMS)}
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
        ) : (
          <p className="para-small-regular text-neutral-500">Couldn't load settings. Try reloading.</p>
        )}
      </div>
    </Page>
  );
};

export default SettingsScreen;
