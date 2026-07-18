import { useEffect, useRef, useState } from "react";

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

/** Re-parsing on every keystroke is wasted work — settle briefly before rendering. */
const RERENDER_DEBOUNCE_MS = 200;

/**
 * Renders a Mermaid definition (a ```mermaid fence, or the graph view's generated
 * definition) to inline SVG. While the definition doesn't parse — e.g. mid-stream
 * or mid-edit — the previous diagram stays and the raw source shows underneath.
 */
const MermaidBlock = ({ code }: { code: string }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mermaid-${++renderSeq}`);

  useEffect(() => {
    let cancelled = false;
    const renderId = `${idRef.current}-${++renderSeq}`;
    const render = async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg: rendered } = await mermaid.render(renderId, code, getScratchBox());
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        // drop measuring leftovers (incl. mermaid's orphaned error element on parse failure)
        scratchBox?.replaceChildren();
      }
    };
    // first render immediately (no blank flash); re-renders wait for typing to settle
    const timer = setTimeout(render, svg === null ? 0 : RERENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <span className="mermaid-block block">
      {svg && <span className="block overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />}
      {failed && (
        <code className="block whitespace-pre-wrap rounded-xl border border-dashed border-neutral-700 p-3 caption-small-regular text-neutral-500">
          {code}
        </code>
      )}
    </span>
  );
};

export default MermaidBlock;
