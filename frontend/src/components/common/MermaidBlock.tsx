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
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg: rendered } = await mermaid.render(renderId, code);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
        // mermaid.render leaves an orphaned error element behind on parse failure
        document.getElementById(`d${renderId}`)?.remove();
      }
    })();
    return () => {
      cancelled = true;
    };
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
