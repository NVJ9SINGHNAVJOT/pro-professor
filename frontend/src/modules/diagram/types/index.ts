/* ── Diagram domain types ─────────────────────────────────────────────────────
 * Diagrams are stored as Excalidraw scenes (elements + appState + files). The
 * scene is the whole document — there is no separate semantic model; the user
 * draws in the Excalidraw editor and the scene is saved as-is.
 */

/** The stored diagram document — the canonical Excalidraw scene shape. */
export interface DiagramScene {
  type: "excalidraw";
  version: number;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}
