import { useEffect, useRef, useState } from "react";
import DiagramViewport from "@/components/common/DiagramViewport";
import { MERMAID_RERENDER_DEBOUNCE_MS } from "@/constants/ui";
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
const MermaidBlock = ({ code, fill = false }: { code: string; fill?: boolean }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          }
        } catch (failure) {
          if (!cancelled) setError(parseErrorOf(failure));
        } finally {
          // drop measuring leftovers (incl. mermaid's orphaned error element on parse failure)
          scratchBox?.replaceChildren();
        }
      });
    // first render immediately (no blank flash); re-renders wait for typing to settle
    const timer = setTimeout(render, svg === null ? 0 : MERMAID_RERENDER_DEBOUNCE_MS);
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
      {svg && <DiagramViewport svg={svg} fill={fill} />}
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
