import { useRef, useState, type ReactNode } from "react";

/**
 * Horizontal split with a draggable divider (the editor⟷preview split).
 * Plain flexbox — the left pane gets a percentage width, the right pane fills the rest.
 */
const SplitPane = ({ left, right }: { left: ReactNode; right: ReactNode }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(0.5);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const next = (event.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.8, Math.max(0.2, next)));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <div style={{ width: `${ratio * 100}%` }} className="h-full min-w-0 shrink-0">
        {left}
      </div>
      <div
        onMouseDown={handleDividerMouseDown}
        role="separator"
        aria-orientation="vertical"
        className="w-1 shrink-0 cursor-col-resize bg-neutral-800 transition-colors hover:bg-neutral-500"
      />
      <div className="h-full min-w-0 flex-1">{right}</div>
    </div>
  );
};

export default SplitPane;
