import type { NodeTypes } from "@xyflow/react";
import ServiceNode from "@/modules/diagram/nodes/ServiceNode";
import DatabaseNode from "@/modules/diagram/nodes/DatabaseNode";
import NoteNode from "@/modules/diagram/nodes/NoteNode";

/**
 * The node-type registry. Adding a type = one component + one line here (its
 * name must also appear in NODE_TYPES in types/ so validation accepts it —
 * the registry sync test enforces the two stay identical).
 */
export const nodeTypes: NodeTypes = {
  service: ServiceNode,
  database: DatabaseNode,
  note: NoteNode,
};
