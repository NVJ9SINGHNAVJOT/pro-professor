import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { parseAiReply } from "@/modules/diagram/ai/patchParser";
import { applyCommandsToScene } from "@/modules/diagram/ai/applyCommandsToScene";
import { applyMermaid } from "@/modules/diagram/ai/applyMermaid";
import { readSemantics, toSummary } from "@/modules/diagram/ai/sceneSemantics";
import { diagramsStream, type DiagramAiPayload } from "@/services/operations/diagrams/diagrams.stream";

export interface RunAiEditArgs {
  diagramId: number;
  instruction: string;
  provider: string;
  model: string;
  /** The live editor API — the current scene is read from it and edits applied to it. */
  api: ExcalidrawImperativeAPI;
  /** Progress display while the model streams (never applied). */
  onChunk?: (accumulated: string) => void;
  /** Receives the AbortController so the caller can cancel mid-stream. */
  onController?: (controller: AbortController) => void;
}

export type RunAiEditResult =
  | { ok: true; repaired: boolean }
  | { ok: false; error: string; cancelled?: boolean };

/**
 * The full AI-edit loop: buffer → parse → apply. The reply is either a Mermaid
 * definition (regenerates the scene) or a command list (incremental edit over
 * the current graph). One repair retry: an invalid/unappliable reply goes back
 * to the model with the errors; a second failure rejects the edit (appliers are
 * all-or-nothing, so there is nothing to roll back).
 */
export async function runAiEdit(args: RunAiEditArgs): Promise<RunAiEditResult> {
  const semantic = toSummary(readSemantics(args.api.getSceneElements()));

  const first = await streamOnce(args, { semantic });
  if (!first.ok) return first; // includes user stop (cancelled) — never repair after a stop
  let failure = await tryApply(args.api, first.raw);
  if (failure === null) return { ok: true, repaired: false };

  const second = await streamOnce(args, { semantic, priorReply: first.raw, validationErrors: failure.join("\n") });
  if (!second.ok) return second;
  failure = await tryApply(args.api, second.raw);
  if (failure === null) return { ok: true, repaired: true };

  return { ok: false, error: `The model could not produce a valid edit: ${failure[0]}` };
}

/** Parse + apply; null on success, the error list on failure (scene untouched). */
async function tryApply(api: ExcalidrawImperativeAPI, raw: string): Promise<string[] | null> {
  const parsed = parseAiReply(raw);
  if (!parsed.ok) return parsed.errors;
  const result = parsed.kind === "mermaid" ? await applyMermaid(api, parsed.definition) : applyCommandsToScene(api, parsed.ops);
  return result.ok ? null : result.errors;
}

function streamOnce(
  args: RunAiEditArgs,
  extra: Pick<DiagramAiPayload, "semantic" | "priorReply" | "validationErrors">,
): Promise<{ ok: true; raw: string } | { ok: false; error: string; cancelled?: boolean }> {
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
    // Stop button: the stream client swallows the AbortError and never calls back,
    // so settle here — otherwise this promise (and runAiEdit) would hang forever.
    controller.signal.addEventListener("abort", () => resolve({ ok: false, error: "Stopped", cancelled: true }));
    args.onController?.(controller);
  });
}
