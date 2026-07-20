import type { DiagramScene } from "@/modules/diagram/types";

/**
 * Scene helpers kept free of any `@excalidraw/excalidraw` import, so the (not
 * lazy-loaded) list screen can use them without pulling the Excalidraw runtime
 * into the main bundle. Loading/serialising a live scene (restore/serializeAsJSON)
 * happens inside the lazy DiagramEditor instead.
 */

export const EXCALIDRAW_SOURCE = "pro-professor";

/**
 * Professional (non-hand-drawn) defaults for new content: roughness 0 (architect,
 * clean lines) and a normal sans font (Excalidraw FONT_FAMILY.Nunito = 6) rather
 * than the sketchy Excalifont default. Kept as literals so this stays free of any
 * `@excalidraw/excalidraw` import.
 */
export const PRO_ROUGHNESS = 0;
export const PRO_FONT_FAMILY = 6;

/** A fresh empty scene for "New diagram". */
export function makeEmptyScene(): DiagramScene {
  return {
    type: "excalidraw",
    version: 2,
    source: EXCALIDRAW_SOURCE,
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
      currentItemRoughness: PRO_ROUGHNESS,
      currentItemFontFamily: PRO_FONT_FAMILY,
    },
    files: {},
  };
}
