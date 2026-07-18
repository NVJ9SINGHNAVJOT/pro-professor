import { useState } from "react";
import { validateBundle } from "@/modules/diagram/schema/validate";
import type { DiagramBundle } from "@/modules/diagram/types";
import { cn } from "@/lib/utils";

interface ImportDiagramDialogProps {
  open: boolean;
  onClose: () => void;
  /** Receives an already-validated bundle; returns an error message to display, or null on success. */
  onImport: (title: string, bundle: DiagramBundle) => Promise<string | null>;
}

/**
 * Paste-a-.diagram dialog: JSON in → ajv gate → create. The paste path for
 * externally authored documents (see skills/pro-professor-diagrams).
 */
const ImportDiagramDialog = ({ open, onClose, onImport }: ImportDiagramDialogProps) => {
  const [title, setTitle] = useState("");
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Not valid JSON — paste the complete .diagram document.");
      return;
    }
    const result = validateBundle(parsed);
    if (!result.ok) {
      setError(result.errors[0]);
      return;
    }
    setBusy(true);
    const failure = await onImport(title.trim() || "Imported Diagram", result.bundle);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setTitle("");
    setJson("");
    setError(null);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      {/* Panel */}
      {open && (
        <div className="fixed left-1/2 top-1/2 z-50 flex w-120 -translate-x-1/2 -translate-y-1/2 flex-col gap-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-white shadow-2xl">
          <span className="para-small-medium">Import diagram</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title (optional — defaults to “Imported Diagram”)"
            className="rounded-lg border border-neutral-700 bg-transparent px-3 py-2 caption-small-regular outline-none placeholder:text-neutral-500 focus:border-neutral-500"
          />
          <textarea
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
              setError(null);
            }}
            rows={10}
            spellCheck={false}
            placeholder='Paste the .diagram JSON here — {"schemaVersion":"1.0.0","semantic":{…},"layout":{},…}'
            className="resize-none rounded-lg border border-neutral-700 bg-transparent px-3 py-2 font-mono caption-small-regular outline-none placeholder:text-neutral-500 focus:border-neutral-500"
          />
          {error && <span className="caption-small-regular text-red-400">{error}</span>}
          <div className="flex justify-end gap-x-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg px-3 py-1.5 caption-small-medium text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy || !json.trim()}
              className="cursor-pointer rounded-lg bg-white px-3 py-1.5 caption-small-medium text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ImportDiagramDialog;
