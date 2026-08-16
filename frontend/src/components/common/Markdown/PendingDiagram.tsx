import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface PendingDiagramProps {
  /** The diagram body written so far — everything after the opening fence line. */
  source: string;
  /** True while more is still arriving, which is the difference between "writing" and "stopped". */
  streaming?: boolean;
}

/**
 * Stands in for a ```mermaid fence that hasn't closed yet.
 *
 * Mermaid can only draw a finished diagram, and an unclosed fence is a valid code block as far as
 * CommonMark is concerned — so without this the renderer is handed a half-written diagram on every
 * token and shows a parse error for the whole time one is being written. `Markdown` withholds the
 * open fence and renders this instead, which also means no failed parse ever runs.
 */
const PendingDiagram = ({ source, streaming }: PendingDiagramProps) => {
  const sourceRef = useRef<HTMLPreElement | null>(null);

  // Follow the writing. `scrollTop` on this container only — `scrollIntoView` walks every scrollable
  // ancestor, and App's `<main>` is one, which drags the whole page.
  useEffect(() => {
    const container = sourceRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [source]);

  return (
    <span className="mermaid-block block overflow-hidden rounded-xl border border-neutral-800">
      <span className="flex items-center gap-x-2 px-3 py-2">
        <span
          className={cn(
            "size-3.5 shrink-0 rounded-full border-2 border-neutral-700 border-t-neutral-400",
            streaming && "animate-spin",
          )}
        />
        <span className="caption-small-regular text-neutral-500">
          {streaming ? "Creating diagram…" : "Unclosed diagram fence"}
        </span>
      </span>
      {source.trim() !== "" && (
        <pre
          ref={sourceRef}
          className="chat-scroll max-h-56 overflow-y-auto border-t border-neutral-800 px-3 py-2 caption-small-regular whitespace-pre-wrap text-neutral-500"
        >
          {source}
        </pre>
      )}
    </span>
  );
};

export default PendingDiagram;
