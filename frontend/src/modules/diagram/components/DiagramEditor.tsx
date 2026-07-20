import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, getSceneVersion, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { diagramsRoute } from "@/services/operations/diagrams/diagrams.route";
import { PRO_FONT_FAMILY, PRO_ROUGHNESS } from "@/modules/diagram/persistence/sceneIO";

interface DiagramEditorProps {
  diagramId: number;
  /** Called after a successful save so the list can refresh its ordering. */
  onSaved?: () => void;
}

type SaveState = "idle" | "saving" | "saved";

/**
 * The editable diagram: an Excalidraw scene loaded from / saved to the diagram
 * row. Excalidraw owns the scene state and undo history; we debounce-save on
 * change. Diagrams are drawn by the user — there is no AI generation/editing.
 */
const DiagramEditor = ({ diagramId, onSaved }: DiagramEditorProps) => {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const savedVersion = useRef(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const { execute: fetchDiagram } = useApi(diagramsRoute.getDiagram);
  const { execute: updateDiagram } = useApi(diagramsRoute.updateDiagram);

  // Load (and reload on diagram switch). A remount via key also resets Excalidraw.
  useEffect(() => {
    let alive = true;
    setInitialData(null);
    (async () => {
      const res = await fetchDiagram(diagramId);
      if (!alive) return;
      if (res.error) {
        toast.error("Failed to load diagram");
        return;
      }
      const detail = res.response.data;
      setTitle(detail.title);
      const restored = restore(detail.content as ExcalidrawInitialDataState, null, null);
      savedVersion.current = getSceneVersion(restored.elements);
      // Default the tools to a professional (non-hand-drawn) look every session.
      setInitialData({
        ...restored,
        appState: { ...restored.appState, currentItemRoughness: PRO_ROUGHNESS, currentItemFontFamily: PRO_FONT_FAMILY },
        scrollToContent: true,
      });
    })();
    return () => {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const doSave = useCallback(
    async (overrideTitle?: string | React.MouseEvent | Event) => {
      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElements();
      const content = JSON.parse(serializeAsJSON(elements, api.getAppState(), api.getFiles(), "database"));
      setSaveState("saving");
      
      const titleToSave = typeof overrideTitle === "string" ? overrideTitle : titleRef.current;
      const res = await updateDiagram(diagramId, { title: titleToSave, content });
      
      if (res.error) {
        setSaveState("idle");
        toast.error("Failed to save diagram");
        return;
      }
      savedVersion.current = getSceneVersion(elements);
      setSaveState("saved");
      onSaved?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diagramId],
  );

  // Excalidraw fires onChange for selection/pointer too; the scene version only
  // moves on real element edits, so it debounces those into a single save.
  const onChange = useCallback(
    (elements: readonly unknown[]) => {
      if (getSceneVersion(elements as never) === savedVersion.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSave(), 800);
    },
    [doSave],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11.5 shrink-0 items-center gap-x-2 border-b border-neutral-800 px-4 pt-2 pb-2">
        <input
          value={title}
          spellCheck={false}
          onChange={(e) => {
            setTitle(e.target.value);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => doSave(e.target.value), 800);
          }}
          className="min-w-0 flex-1 truncate bg-transparent para-medium-semibold outline-none"
          placeholder="Untitled Diagram"
        />
        <span className="ml-auto caption-small-regular text-neutral-500">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>
      {/* Pin Excalidraw to an absolutely-filled box so it fills the canvas area. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          {initialData ? (
            <Excalidraw
              theme="dark"
              initialData={initialData}
              excalidrawAPI={(api) => {
                apiRef.current = api;
              }}
              onChange={onChange}
            />
          ) : (
            <span className="p-4 caption-small-regular text-neutral-500">Loading canvas…</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiagramEditor;
