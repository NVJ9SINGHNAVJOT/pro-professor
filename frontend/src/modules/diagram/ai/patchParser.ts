import { Ajv } from "ajv";
import patchSchema from "@/modules/diagram/schema/aiPatch.schema.json";
import type { DiagramOp } from "@/modules/diagram/commands/ops";

const ajv = new Ajv({ allErrors: true });
const validatePatchShape = ajv.compile(patchSchema);

export type ParsedPatch = { ok: true; ops: DiagramOp[] } | { ok: false; errors: string[] };

/**
 * Buffered model reply → validated command list. Local models routinely wrap
 * the JSON in prose or a code fence; extraction recovers the common cases
 * before ajv gets the final say. On failure the errors are precise enough to
 * feed back into the repair retry.
 */
export function parsePatchText(raw: string): ParsedPatch {
  const json = extractJson(raw);
  if (json === null) return { ok: false, errors: ["reply contains no parseable JSON object"] };

  if (!validatePatchShape(json)) {
    const errors = (validatePatchShape.errors ?? []).map(
      (error) => `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`,
    );
    return { ok: false, errors };
  }
  return { ok: true, ops: (json as { commands: DiagramOp[] }).commands };
}

/** Direct parse first; otherwise the outermost {...} span (strips prose/fences around it). */
function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}
