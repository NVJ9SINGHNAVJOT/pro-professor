import type { DiagramDetail, DiagramSavePayload } from "@/services/operations/diagrams/diagrams.route";
import { validateBundle } from "@/modules/diagram/schema/validate";
import { bundleLoaded } from "@/modules/diagram/model/actions";
import { selectBundle, selectDiagramDoc } from "@/modules/diagram/model/selectors";
import { DIAGRAM_SCHEMA_VERSION, type DiagramBundle } from "@/modules/diagram/types";
import type { RootState } from "@/redux/rootReducer";

/**
 * Bundle ⇄ server round-trip. Validation is the gate in BOTH directions: a
 * fetched document that fails ajv never reaches the store, and a store state
 * that somehow fails ajv is never sent to the server.
 */

/** Validates a fetched diagram and returns the bundleLoaded action, or the errors. */
export function parseLoadedDiagram(detail: DiagramDetail): { action: ReturnType<typeof bundleLoaded> } | { errors: string[] } {
  const result = validateBundle(detail.content);
  if (!result.ok) return { errors: result.errors };
  return { action: bundleLoaded({ id: detail.id, title: detail.title, bundle: result.bundle }) };
}

/** Reassembles + validates the open diagram for saving (metadata.updated is bumped). */
export function buildSavePayload(state: RootState): { payload: DiagramSavePayload } | { errors: string[] } {
  const doc = selectDiagramDoc(state);
  const bundle: DiagramBundle = {
    ...selectBundle(state),
    metadata: { ...doc.metadata, updated: new Date().toISOString() },
  };
  const result = validateBundle(bundle);
  if (!result.ok) return { errors: result.errors };
  return { payload: { title: doc.title, content: result.bundle } };
}

/** A fresh empty document for "New diagram". */
export function makeEmptyBundle(): DiagramBundle {
  const now = new Date().toISOString();
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    semantic: { nodes: [], edges: [] },
    layout: {},
    theme: "default-dark",
    metadata: { created: now, updated: now, rendererVersion: "1" },
  };
}
