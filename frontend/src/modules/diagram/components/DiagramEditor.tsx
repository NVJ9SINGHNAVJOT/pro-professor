import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, getSceneVersion, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "@/modules/diagram/components/diagramEditor.css";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { diagramsRoute, type DiagramDetail } from "@/services/operations/diagrams/diagrams.route";
import { makeEmptyScene, PRO_FONT_FAMILY, PRO_ROUGHNESS } from "@/modules/diagram/persistence/sceneIO";

interface DiagramEditorProps {
  /**
   * Loaded by the route loader; the parent remounts this component per diagram via `key`.
   * `null` on `/diagrams/new` — an unsaved draft, created by its first autosave.
   */
  diagram: DiagramDetail | null;
  /** Called with the new id once a draft's first autosave has created it. */
  onCreated?: (id: number) => void;
  /**
   * Called after every successful save with the server's copy of the row. The list shows the title
   * and orders by `updatedAt`, both of which move on a content save, so this fires per save — it
   * only patches local state, it doesn't refetch anything.
   */
  onSaved?: (diagram: DiagramDetail) => void;
}

type SaveState = "idle" | "saving" | "saved";

/**
 * The editable diagram: an Excalidraw scene handed in by the route loader and saved back to
 * the diagram row. Excalidraw owns the scene state and undo history; we debounce-save on
 * change. Diagrams are drawn by the user — there is no AI generation/editing.
 */
const DiagramEditor = ({ diagram, onCreated, onSaved }: DiagramEditorProps) => {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [title, setTitle] = useState(diagram?.title ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // null until a draft's first save creates the row; the prop can't carry it, since the parent
  // deliberately keeps this component mounted across that transition.
  const idRef = useRef<number | null>(diagram?.id ?? null);

  // Derived once per mount — the parent's `key` remounts on a switch, which is
  // also what resets Excalidraw's own scene and undo history.
  const [initialData] = useState<ExcalidrawInitialDataState>(() => {
    const restored = restore((diagram?.content ?? makeEmptyScene()) as ExcalidrawInitialDataState, null, null);
    // Default the tools to a professional (non-hand-drawn) look every session.
    return {
      ...restored,
      appState: { ...restored.appState, currentItemRoughness: PRO_ROUGHNESS, currentItemFontFamily: PRO_FONT_FAMILY },
      scrollToContent: true,
    };
  });
  const savedVersion = useRef(getSceneVersion(initialData.elements ?? []));

  const { execute: createDiagram } = useApi(diagramsRoute.createDiagram);
  const { execute: updateDiagram } = useApi(diagramsRoute.updateDiagram);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

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

      // Claim the version we're about to send *now*, not after the round trip: Excalidraw replaces
      // element objects as it finalises an edit, so reading it back off this snapshot afterwards
      // can yield a stale number — which reads as "still unsaved" and fires a second, identical
      // save. Anything drawn while the request is in flight moves past this and saves next tick.
      const sentVersion = getSceneVersion(elements);
      const previousVersion = savedVersion.current;
      savedVersion.current = sentVersion;

      const titleToSave = typeof overrideTitle === "string" ? overrideTitle : titleRef.current;
      // A draft's first save is the create — a blank title lands as "Untitled Diagram" server-side.
      const res =
        idRef.current === null
          ? await createDiagram({ title: titleToSave, content })
          : await updateDiagram(idRef.current, { title: titleToSave, content });

      if (res.error) {
        savedVersion.current = previousVersion; // nothing landed — let the next change retry
        setSaveState("idle");
        toast.error("Failed to save diagram");
        return;
      }
      const saved = res.response.data;
      setSaveState("saved");
      const created = idRef.current === null;
      if (created) {
        idRef.current = saved.id;
        // The server named it ("Untitled Diagram", or a de-duplicated title); adopt that unless
        // the user has typed on since.
        if (titleRef.current === titleToSave) setTitle(saved.title);
      }
      // Every save moves the row: `updatedAt` changed, so the list re-sorts it to the top.
      onSaved?.(saved);
      if (created) onCreated?.(saved.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
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
          <Excalidraw
            theme="dark"
            initialData={initialData}
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            onChange={onChange}
          >
            {/* Replaces Excalidraw's default menu; listing the items ourselves
                is the only way to drop its "Excalidraw links" (socials) group. */}
            <MainMenu>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.SaveToActiveFile />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        </div>
      </div>
    </div>
  );
};

export default DiagramEditor;
