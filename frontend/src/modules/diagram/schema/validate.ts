import { Ajv } from "ajv";
import schema from "@/modules/diagram/schema/diagram.schema.json";
import { NODE_TYPES, EDGE_TYPES, type DiagramBundle } from "@/modules/diagram/types";

export type ValidationResult = { ok: true; bundle: DiagramBundle } | { ok: false; errors: string[] };

const ajv = new Ajv({ allErrors: true });
const validateShape = ajv.compile(schema);

/**
 * The single validation gate for every bundle that enters the store — loads,
 * saves and AI patches all pass through here. Two layers:
 *   1. ajv structural validation against diagram.schema.json
 *   2. referential invariants ajv can't express: unique ids, edge endpoints
 *      exist, layout keys ⊆ semantic node ids, node/edge types are registered.
 */
export function validateBundle(input: unknown): ValidationResult {
  if (!validateShape(input)) {
    const errors = (validateShape.errors ?? []).map(
      (error) => `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`,
    );
    return { ok: false, errors };
  }

  // ajv's type guard narrowed `input` to the schema's inferred shape; go through unknown.
  const bundle = input as unknown as DiagramBundle;
  const errors: string[] = [];

  const nodeIds = new Set<string>();
  for (const node of bundle.semantic.nodes) {
    if (nodeIds.has(node.id)) errors.push(`duplicate node id "${node.id}"`);
    nodeIds.add(node.id);
    if (!NODE_TYPES.includes(node.type)) errors.push(`node "${node.id}" has unregistered type "${node.type}"`);
  }

  const edgeIds = new Set<string>();
  for (const edge of bundle.semantic.edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge id "${edge.id}"`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) errors.push(`edge "${edge.id}" source "${edge.source}" is not a semantic node`);
    if (!nodeIds.has(edge.target)) errors.push(`edge "${edge.id}" target "${edge.target}" is not a semantic node`);
    if (!EDGE_TYPES.includes(edge.type)) errors.push(`edge "${edge.id}" has unregistered type "${edge.type}"`);
  }

  for (const key of Object.keys(bundle.layout)) {
    if (!nodeIds.has(key)) errors.push(`layout entry "${key}" has no semantic node`);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, bundle };
}
