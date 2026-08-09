/**
 * A 1×1 transparent GIF used to suppress the native drag ghost in the sidebar trees.
 *
 * The browser rasterizes that ghost at 1× regardless of device pixel ratio, so on a HiDPI display
 * the dragged row is *always* upscaled and soft — nothing about the row's own styling can fix it.
 * So we don't draw one: the source row dims and the drop target rings instead, which is both
 * sharper and closer to how Linear/Notion handle a list drag. Each tree draws its own preview
 * element following the cursor.
 *
 * Module scope so it is decoded long before a drag begins — `setDragImage` with an unloaded image
 * silently falls back to the default ghost.
 *
 * Global rather than module-scoped because both the diagram tree and the note tree use it, and
 * modules may not import from one another.
 */
export const EMPTY_DRAG_IMAGE =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });
