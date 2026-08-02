import { useEffect, useRef } from "react";
import { buildGalaxy, drawGalaxyFrame, type GalaxyScene } from "@/modules/home/utils/galaxy";

/**
 * The home screen's spiral galaxy. Fills its positioned parent and paints nothing but background —
 * both layers are rendered once per size change and the frame loop only re-projects them, so an
 * idle home screen stays cheap. Honours `prefers-reduced-motion` by painting a single still frame.
 */
const GalaxyBackdrop = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scene: GalaxyScene | null = null;
    let raf: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;

    const build = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height || (width === lastWidth && height === lastHeight)) return;
      lastWidth = width;
      lastHeight = height;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      scene = buildGalaxy(width, height, dpr);
      if (still) drawGalaxyFrame(ctx, scene, 0);
    };

    const render = (time: number) => {
      if (scene) drawGalaxyFrame(ctx, scene, time);
      raf = requestAnimationFrame(render);
    };

    build();
    if (!still) raf = requestAnimationFrame(render);

    const observer = new ResizeObserver(build);
    observer.observe(canvas);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
};

export default GalaxyBackdrop;
