import type { EdgeTypes } from "@xyflow/react";
import StraightEdge from "@/modules/diagram/edges/StraightEdge";
import CurvedEdge from "@/modules/diagram/edges/CurvedEdge";

/** The edge-type registry — mirror of EDGE_TYPES in types/ (enforced by the sync test). */
export const edgeTypes: EdgeTypes = {
  straight: StraightEdge,
  curved: CurvedEdge,
};
