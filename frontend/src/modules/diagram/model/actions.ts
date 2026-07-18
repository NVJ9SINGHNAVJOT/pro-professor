import { createAction } from "@reduxjs/toolkit";
import type { DiagramBundle } from "@/modules/diagram/types";

/**
 * Cross-slice lifecycle actions. Each of the four namespace slices (and the doc
 * bookkeeping slice) reacts to these via extraReducers, so loading/closing a
 * diagram atomically resets every namespace without slices importing each other.
 */

/** A validated bundle enters the store. `id` is null for a not-yet-persisted diagram. */
export const bundleLoaded = createAction<{ id: number | null; title: string; bundle: DiagramBundle }>(
  "diagram/bundleLoaded",
);

/** The open diagram is closed — every slice resets to its initial state. */
export const diagramClosed = createAction("diagram/closed");
