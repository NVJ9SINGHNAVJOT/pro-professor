import { useEffect, useRef, useState } from "react";
import DiagramViewport from "@/components/common/DiagramViewport";
import { MERMAID_RERENDER_DEBOUNCE_MS } from "@/constants/ui";
import { quoteMermaidLabels } from "@/components/common/mermaidLabels";
import { cn } from "@/lib/utils";

/* Mermaid is the one heavy diagram dependency — loaded lazily on first use so it
 * stays out of the main bundle. Initialized once with the app's dark theme. */
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
const loadMermaid = () => {
  mermaidPromise ??= import("mermaid").then((module) => {
    module.default.initialize({ startOnLoad: false, theme: "dark", fontFamily: "Inter, sans-serif" });
    return module.default;
  });
  return mermaidPromise;
};

let renderSeq = 0;

/* mermaid.render() blanks the container it is given and resets mermaid's module-global config, then
 * awaits the diagram type's lazy import — so two overlapping renders wreck each other's DOM and
 * only one survives. A note with several ```mermaid fences mounts them all in the same tick, so
 * renders queue up and go through one at a time. */
let renderQueue: Promise<unknown> = Promise.resolve();
const queueRender = <T,>(task: () => Promise<T>) => {
  const run = renderQueue.then(task);
  renderQueue = run.catch(() => {}); // a failed render must not wedge the queue
  return run;
};

/* Without a container, mermaid.render appends its measuring element to
 * document.body — a wide/tall diagram then momentarily stretches the page and
 * flashes both scrollbars on every keystroke while editing. A position:fixed
 * off-screen scratch box never contributes to page scroll size, so rendering
 * inside it can't jolt the app's layout. */
let scratchBox: HTMLDivElement | null = null;
const getScratchBox = () => {
  if (!scratchBox) {
    scratchBox = document.createElement("div");
    scratchBox.setAttribute("aria-hidden", "true");
    scratchBox.style.position = "fixed";
    scratchBox.style.left = "-10000px";
    scratchBox.style.top = "0";
    document.body.appendChild(scratchBox);
  }
  return scratchBox;
};

/**
 * Mermaid's parse errors name the offending line and token, which is the whole value of
 * showing a failure at all — so pull the text out rather than only reporting *that* it broke.
 * Older builds carry it on `str` instead of the Error's `message`.
 */
const parseErrorOf = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "object" && error !== null && "str" in error) {
    const str = String((error as { str: unknown }).str).trim();
    if (str) return str;
  }
  return "This diagram didn't parse.";
};

/**
 * Renders a Mermaid definition (a ```mermaid fence, or the graph view's generated
 * definition) to inline SVG. While the definition doesn't parse — e.g. mid-stream
 * or mid-edit — the previous diagram stays and the parse error plus the raw source
 * show underneath.
 */
const MermaidBlock = ({
  code,
  fill = false,
  maxScale,
}: {
  code: string;
  fill?: boolean;
  /** Raise the viewport's zoom ceiling — see `GRAPH_VIEW_MAX_SCALE`. */
  maxScale?: number;
}) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** True when what's on screen came from the repaired source rather than the source as written. */
  const [repaired, setRepaired] = useState(false);
  const idRef = useRef(`mermaid-${++renderSeq}`);

  useEffect(() => {
    let cancelled = false;
    const renderId = `${idRef.current}-${++renderSeq}`;
    const render = () =>
      queueRender(async () => {
        if (cancelled) return; // unmounted or superseded while waiting its turn
        try {
          const mermaid = await loadMermaid();
          const { svg: rendered } = await mermaid.render(renderId, code, getScratchBox());
          if (!cancelled) {
            setSvg(rendered);
            setError(null);
            setRepaired(false);
          }
        } catch (failure) {
          /* One unquoted bracket in a label fails the whole diagram, and models produce them
           * constantly — so before giving up, try again with labels quoted. Reached ONLY after a
           * real failure and the result is re-rendered before it is shown, which is what makes a
           * regex over mermaid's own delimiters safe: a repair that doesn't parse changes nothing,
           * and a diagram that already renders never gets here at all. */
          const fixed = quoteMermaidLabels(code);
          if (fixed !== code) {
            try {
              const mermaid = await loadMermaid();
              const { svg: rendered } = await mermaid.render(`${renderId}-fixed`, fixed, getScratchBox());
              if (!cancelled) {
                setSvg(rendered);
                setError(null);
                setRepaired(true);
              }
              return;
            } catch {
              // The repair didn't parse either — fall through and report the original failure.
            }
          }
          if (!cancelled) {
            setError(parseErrorOf(failure));
            setRepaired(false);
          }
        } finally {
          // drop measuring leftovers (incl. mermaid's orphaned error element on parse failure)
          scratchBox?.replaceChildren();
        }
      });
    // First render immediately (no blank flash); re-renders wait for typing to settle. `error` is
    // in the condition because a source that has never parsed still counts as settled work: keyed
    // on `svg` alone, every keystroke into a not-yet-valid diagram re-parsed at 0ms, and each
    // attempt queues behind the others through the module-level chain above.
    const timer =
      svg === null && error === null ? setTimeout(render, 0) : setTimeout(render, MERMAID_RERENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /* Renders are serialized through a module-level queue and mermaid is imported lazily, so a
   * diagram can sit for a moment before anything appears — several fences in one note render one
   * after another. Without a marker that reads as an empty gap. Only shown before the *first*
   * result: a re-render keeps the last good diagram on screen rather than flashing back to a
   * spinner. */
  const awaitingFirstRender = svg === null && error === null;

  return (
    <span className={cn("mermaid-block group block", fill && "h-full")}>
      {awaitingFirstRender && (
        <span
          className={cn(
            "flex items-center justify-center gap-x-2 rounded-xl border border-neutral-800",
            fill ? "h-full" : "py-10",
          )}
        >
          <span className="size-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
          <span className="caption-small-regular text-neutral-500">Rendering diagram…</span>
        </span>
      )}
      {svg && <DiagramViewport svg={svg} fill={fill} maxScale={maxScale} />}
      {/* Said out loud rather than silently: what's rendered isn't byte-for-byte what the source
          says, and the note still holds the version that doesn't parse on its own. */}
      {repaired && (
        <span
          title="A label contained an unquoted bracket, which mermaid can't parse. It was quoted to render this — the note itself is unchanged."
          className="block pt-1 caption-small-regular text-neutral-600"
        >
          Diagram syntax auto-corrected to render
        </span>
      )}
      {error && (
        <span className="block rounded-xl border border-dashed border-neutral-700 p-3">
          <span className="block whitespace-pre-wrap pb-2 caption-small-regular text-amber-400">{error}</span>
          <code className="block whitespace-pre-wrap caption-small-regular text-neutral-500">{code}</code>
        </span>
      )}
    </span>
  );
};

export default MermaidBlock;
