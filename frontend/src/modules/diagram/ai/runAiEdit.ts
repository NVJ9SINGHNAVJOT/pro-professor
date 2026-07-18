import store from "@/redux/store";
import { selectSemantic } from "@/modules/diagram/model/selectors";
import { parsePatchText } from "@/modules/diagram/ai/patchParser";
import { applyAiPatch } from "@/modules/diagram/ai/applyAiPatch";
import { diagramsStream, type DiagramAiPayload } from "@/services/operations/diagrams/diagrams.stream";

export interface RunAiEditArgs {
  diagramId: number;
  instruction: string;
  provider: string;
  model: string;
  /** Progress display while the model streams (never applied). */
  onChunk?: (accumulated: string) => void;
  /** Receives the AbortController so the caller can cancel mid-stream. */
  onController?: (controller: AbortController) => void;
}

export type RunAiEditResult = { ok: true; repaired: boolean } | { ok: false; error: string };

/**
 * The full AI-edit loop: buffer → parse → ajv-validate → apply atomically.
 * One repair retry: an invalid reply goes back to the model with the
 * validation errors; a second failure rejects the edit with the store
 * untouched (applyAiPatch is all-or-nothing, so there is nothing to roll back).
 */
export async function runAiEdit(args: RunAiEditArgs): Promise<RunAiEditResult> {
  const semantic = selectSemantic(store.getState());

  const first = await streamOnce(args, { semantic });
  if (!first.ok) return first;
  let failure = tryApply(first.raw);
  if (failure === null) return { ok: true, repaired: false };

  const second = await streamOnce(args, { semantic, priorReply: first.raw, validationErrors: failure.join("\n") });
  if (!second.ok) return second;
  failure = tryApply(second.raw);
  if (failure === null) return { ok: true, repaired: true };

  return { ok: false, error: `The model could not produce a valid edit: ${failure[0]}` };
}

/** Parse + apply; null on success, the error list on failure (store untouched). */
function tryApply(raw: string): string[] | null {
  const parsed = parsePatchText(raw);
  if (!parsed.ok) return parsed.errors;
  const applied = store.dispatch(applyAiPatch(parsed.ops));
  return applied.ok ? null : applied.errors;
}

function streamOnce(
  args: RunAiEditArgs,
  extra: Pick<DiagramAiPayload, "semantic" | "priorReply" | "validationErrors">,
): Promise<{ ok: true; raw: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let accumulated = "";
    const controller = diagramsStream.run(
      args.diagramId,
      { instruction: args.instruction, provider: args.provider, model: args.model, ...extra },
      {
        onStart: () => {},
        onChunk: ({ delta }) => {
          accumulated += delta;
          args.onChunk?.(accumulated);
        },
        onDone: ({ raw }) => resolve({ ok: true, raw }),
        onError: (message) => resolve({ ok: false, error: message }),
      },
    );
    args.onController?.(controller);
  });
}
