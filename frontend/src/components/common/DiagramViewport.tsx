import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaximizeIcon, MinimizeIcon, RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* Mermaid emits its SVG with `width: 100%` (useMaxWidth), so a large diagram shrinks to the width of
 * whatever pane it sits in — a dependency graph with 30 nodes arrives unreadable. The whole diagram
 * staying visible by default is the right first view; this adds the zoom/pan needed to then read it,
 * plus a fullscreen mode for the ones that are hopeless in a split pane.
 *
 * Everything inline is a <span className="block">: MermaidBlock renders inside markdown's <pre>, so
 * a <div> here would be invalid nesting. The fullscreen overlay portals to <body> to escape both
 * that <pre> and the preview pane's overflow. */

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.25;

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

const DiagramViewport = ({ svg }: { svg: string }) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /* Fullscreen moves this subtree into a portal, so the inline block would collapse and jump the
   * note's scroll position. Hold its height open until we're back. */
  const [placeholderHeight, setPlaceholderHeight] = useState<number>();
  const viewportRef = useRef<HTMLSpanElement>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  /* Each mode has its own usable size, so both open at their own natural fit. */
  const enterFullscreen = () => {
    setPlaceholderHeight(viewportRef.current?.getBoundingClientRect().height);
    resetView();
    setFullscreen(true);
  };

  const exitFullscreen = () => {
    resetView();
    setFullscreen(false);
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  /* React attaches `wheel` passively at the root, so preventDefault has to come from a native
   * listener. Only ctrl/cmd+wheel zooms — a plain wheel still scrolls the note. */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((prev) => clampScale(prev * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fullscreen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    dragOriginRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    setOffset({ x: e.clientX - origin.x, y: e.clientY - origin.y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    dragOriginRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const buttonClass = "cursor-pointer rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-800";

  const viewport = (
    <span
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        "relative block overflow-hidden",
        dragging ? "cursor-grabbing select-none" : "cursor-grab",
        fullscreen ? "flex h-full w-full items-center justify-center" : "rounded-xl",
      )}
    >
      <span
        className="block origin-center"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <span
        // the toolbar sits inside the pannable surface — don't let its clicks start a drag
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "absolute top-2 right-2 flex items-center gap-x-0.5 rounded-lg border border-neutral-700 bg-neutral-900/90 p-0.5 backdrop-blur transition-opacity",
          // inline the controls stay out of the way until you reach for the diagram
          fullscreen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        )}
      >
        <button
          type="button"
          onClick={() => setScale((prev) => clampScale(prev / ZOOM_STEP))}
          aria-label="Zoom out"
          className={buttonClass}
        >
          <ZoomOutIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setScale((prev) => clampScale(prev * ZOOM_STEP))}
          aria-label="Zoom in"
          className={buttonClass}
        >
          <ZoomInIcon className="size-4" />
        </button>
        <button type="button" onClick={resetView} aria-label="Reset zoom" className={buttonClass}>
          <RotateCcwIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={fullscreen ? exitFullscreen : enterFullscreen}
          aria-label={fullscreen ? "Exit fullscreen" : "View fullscreen"}
          className={buttonClass}
        >
          {fullscreen ? <MinimizeIcon className="size-4" /> : <MaximizeIcon className="size-4" />}
        </button>
      </span>
    </span>
  );

  if (!fullscreen) return viewport;

  return (
    <>
      <span className="block" style={{ height: placeholderHeight }} />
      {createPortal(<div className="fixed inset-0 z-50 bg-neutral-950">{viewport}</div>, document.body)}
    </>
  );
};

export default DiagramViewport;
