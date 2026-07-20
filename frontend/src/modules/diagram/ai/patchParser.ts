import { Ajv } from "ajv";
import patchSchema from "@/modules/diagram/schema/aiPatch.schema.json";
import type { DiagramCommand } from "@/modules/diagram/types";

const ajv = new Ajv({ allErrors: true });
const validateReply = ajv.compile(patchSchema);

export type ParsedReply =
  | { ok: true; kind: "commands"; ops: DiagramCommand[] }
  | { ok: true; kind: "mermaid"; definition: string }
  | { ok: false; errors: string[] };

/**
 * Buffered model reply → either a command list (incremental edit) or a Mermaid
 * definition (from-scratch generation). Local models routinely wrap the JSON in
 * prose or a code fence; extraction recovers the common cases before ajv gets
 * the final say. On failure the errors are precise enough for the repair retry.
 */
export function parseAiReply(raw: string): ParsedReply {
  const json = extractJson(raw);
  if (json === null) return { ok: false, errors: ["reply contains no parseable JSON object"] };

  if (!validateReply(json)) {
    const errors = (validateReply.errors ?? []).map(
      (error) => `${error.instancePath || "(root)"} ${error.message ?? "is invalid"}`,
    );
    return { ok: false, errors };
  }

  const obj = json as { commands?: DiagramCommand[]; mermaid?: string };
  if (obj.mermaid !== undefined) return { ok: true, kind: "mermaid", definition: obj.mermaid };
  return { ok: true, kind: "commands", ops: obj.commands ?? [] };
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
