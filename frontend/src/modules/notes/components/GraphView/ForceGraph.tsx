import { useEffect, useRef } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
} from "d3-force";
import { FilterIcon, ScanIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import {
  pinGraphNode,
  pruneGraphPositions,
  saveGraphLayout,
  setGraphCamera,
  toggleGraphPanel,
  unpinGraphNode,
} from "@/redux/slices/notesGraphSlice";
import {
  GRAPH_CHARGE,
  GRAPH_CHARGE_MAX,
  GRAPH_CLICK_SLOP_PX,
  GRAPH_COLLIDE_PADDING,
  GRAPH_DIM_ALPHA,
  GRAPH_DIM_STEP,
  GRAPH_DRAG_ALPHA,
  GRAPH_FADE_STEP,
  GRAPH_GRAVITY,
  GRAPH_HOVER_SLOP,
  GRAPH_LINK_DISTANCE,
  GRAPH_LINK_DISTANCE_PER_DEGREE,
  GRAPH_SEED_JITTER,
  GRAPH_TWEEN_FRAMES,
  GRAPH_WARM_ALPHA,
  GRAPH_ZOOM_SENSITIVITY,
  GRAPH_ZOOM_STEP,
} from "@/modules/notes/constants";
import {
  IDENTITY_CAMERA,
  fitCamera,
  nodeRadius,
  toWorld,
  visibleNodeIds,
  zoomAbout,
} from "@/modules/notes/utils/graph";
import { drawGraphFrame, type GraphScene } from "@/modules/notes/utils/graphPaint";
import GraphFilterPanel from "@/modules/notes/components/GraphView/GraphFilterPanel";
import type {
  GraphCamera,
  GraphModel,
  GraphNode,
  GraphNodeId,
  GraphSimEdge,
  GraphSimNode,
} from "@/modules/notes/types";

/**
 * The note network as an interactive force-directed graph.
 *
 * Canvas rather than SVG: a settling layout moves every node every frame, and at a few hundred
 * notes that is thousands of SVG attribute writes per tick — style recalc and layout over the whole
 * subtree, sixty times a second. Canvas is one element, and more importantly it lets the entire
 * animation run with **zero React re-renders**: camera, hover, drag and simulation all live in refs,
 * and the painter reads them inside the frame loop.
 *
 * The simulation always holds the *whole* graph. Filters are a visibility mask that the painter and
 * the hit-tester consult, never a re-layout — typing in the search box fades nodes out rather than
 * sliding the one you are hunting for out from under the cursor.
 *
 * Everything that mutates a simulation node lives at module scope, below. Those objects are
 * deliberately outside React's world: they are rewritten sixty times a second, and the React
 * Compiler (rightly) refuses to let a component mutate anything it can trace back to props.
 */

type SimLink = SimulationLinkDatum<GraphSimNode> & { linkType: "link" | "embed" };

interface ForceGraphProps {
  model: GraphModel;
  /** Content fingerprint — the layout re-syncs on this, not on `model`'s identity. See `graphSignature`. */
  signature: string;
  /** The open note, ringed in the graph and the root of local-graph mode. */
  rootId: GraphNodeId | null;
  onOpenNode: (node: GraphNode) => void;
  onClose: () => void;
}

const ForceGraph = ({ model, signature, rootId, onOpenNode, onClose }: ForceGraphProps) => {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.notesGraph.filters);
  const pinnedIds = useAppSelector((state) => state.notesGraph.pinnedIds);
  const panelOpen = useAppSelector((state) => state.notesGraph.panelOpen);
  const savedCamera = useAppSelector((state) => state.notesGraph.camera);
  const savedPositions = useAppSelector((state) => state.notesGraph.positions);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const simRef = useRef<Simulation<GraphSimNode, SimLink> | null>(null);
  const linkForceRef = useRef<ForceLink<GraphSimNode, SimLink> | null>(null);

  const nodesRef = useRef<GraphSimNode[]>([]);
  const edgesRef = useRef<SimLink[]>([]);
  const byIdRef = useRef(new Map<GraphNodeId, GraphSimNode>());
  const visibleRef = useRef(new Set<GraphNodeId>());
  const pinnedRef = useRef(new Set<GraphNodeId>());

  const cameraRef = useRef<GraphCamera>(savedCamera ?? IDENTITY_CAMERA);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const tweenRef = useRef<{ from: GraphCamera; to: GraphCamera; frame: number } | null>(null);
  const cameraCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hoverIdRef = useRef<GraphNodeId | null>(null);
  const dragRef = useRef<{ id: GraphNodeId; wasPinned: boolean; sx: number; sy: number; moved: number } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);

  const rafRef = useRef<number | null>(null);
  /** Last local-graph depth the camera was framed for — see the filters effect. */
  const lastDepthRef = useRef(filters.localDepth);
  /** Pending "show me the open note" check, run by the first frame that has a sized canvas. */
  const revealRootRef = useRef(true);
  const dirtyRef = useRef(true);
  const tickingRef = useRef(false);
  const fittedRef = useRef(savedCamera !== null);

  /* The frame loop, the pointer handlers and the sync effect all need the *current* props and store
   * values, but none of them may re-subscribe when those change — restarting the loop or the
   * simulation on a prop change is exactly what would make this stutter. They read through here. */
  const latestRef = useRef({ model, rootId, onOpenNode, onClose, filters, savedPositions, panelOpen });
  useEffect(() => {
    latestRef.current = { model, rootId, onOpenNode, onClose, filters, savedPositions, panelOpen };
  });

  /* ── Helpers the effects and handlers below share ───────────────────────────────────────── */

  /** Re-energise the layout without starting d3's internal timer. */
  const wake = (alpha: number) => {
    const sim = simRef.current;
    if (sim && sim.alpha() < alpha) sim.alpha(alpha);
    dirtyRef.current = true;
  };

  const stepTween = () => {
    const tween = tweenRef.current;
    if (!tween) return false;
    tween.frame += 1;
    const progress = Math.min(1, tween.frame / GRAPH_TWEEN_FRAMES);
    const eased = 1 - (1 - progress) ** 3;
    cameraRef.current = {
      k: tween.from.k + (tween.to.k - tween.from.k) * eased,
      tx: tween.from.tx + (tween.to.tx - tween.from.tx) * eased,
      ty: tween.from.ty + (tween.to.ty - tween.from.ty) * eased,
    };
    if (progress >= 1) {
      tweenRef.current = null;
      dispatch(setGraphCamera(cameraRef.current));
    }
    return true;
  };

  const buildScene = (): GraphScene => ({
    nodes: nodesRef.current,
    // forceLink rewrote each `source`/`target` id into the node object it names when the links were
    // supplied, which is exactly the shape the painter wants.
    edges: edgesRef.current as unknown as GraphSimEdge[],
    camera: cameraRef.current,
    width: sizeRef.current.width,
    height: sizeRef.current.height,
    dpr: sizeRef.current.dpr,
    hoverId: hoverIdRef.current,
    rootId: latestRef.current.rootId,
    pinnedIds: pinnedRef.current,
    colorByTag: latestRef.current.filters.colorByTag,
  });

  /** The camera moves on every wheel tick; Redux — and localStorage behind it — sees it once it stops. */
  const commitCameraSoon = () => {
    if (cameraCommitRef.current !== null) clearTimeout(cameraCommitRef.current);
    cameraCommitRef.current = setTimeout(() => {
      cameraCommitRef.current = null;
      dispatch(setGraphCamera(cameraRef.current));
    }, 200);
  };

  const setCursor = (value: string) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.style.cursor !== value) canvas.style.cursor = value;
  };

  /**
   * The zoom readout, written straight to the DOM from the frame loop. Routing it through state
   * would re-render the pane on every wheel tick — the exact cost the ref-held camera exists to
   * avoid. Seeded from a **callback ref** rather than rendered as JSX children: React must not own
   * this text, or the next unrelated re-render would reset it to the mount-time value.
   */
  const seedZoomLabel = (element: HTMLSpanElement | null) => {
    zoomLabelRef.current = element;
    if (element) element.textContent = zoomText(cameraRef.current.k);
  };

  const updateZoomLabel = () => {
    const element = zoomLabelRef.current;
    if (!element) return;
    const text = zoomText(cameraRef.current.k);
    if (element.textContent !== text) element.textContent = text;
  };

  /** Nearest visible node under a screen point. Linear — a few hundred squared-distance compares. */
  const nodeAt = (screenX: number, screenY: number): GraphSimNode | null => {
    const camera = cameraRef.current;
    const world = toWorld(camera, screenX, screenY);
    // Divided by k, so the grab area stays the same number of *screen* pixels at any zoom.
    const slop = GRAPH_HOVER_SLOP / camera.k;
    let best: GraphSimNode | null = null;
    let bestDistance = Infinity;
    for (const node of nodesRef.current) {
      if (!visibleRef.current.has(node.id) || node.alpha01 < 0.5) continue;
      const reach = nodeRadius(node.degree) + slop;
      const dx = world.x - node.x;
      const dy = world.y - node.y;
      const distance = dx * dx + dy * dy;
      if (distance <= reach * reach && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };

  /**
   * Brings the open note into view when the graph is opened on a *restored* camera that happens not
   * to include it. Highlighting "you are here" is no use if it is off-screen — but a camera the user
   * parked deliberately shouldn't be yanked either, so this only moves when the node is actually out
   * of frame, and it pans at the current zoom rather than refitting.
   */
  const revealRoot = () => {
    const root = latestRef.current.rootId;
    const { width, height } = sizeRef.current;
    if (root === null || width === 0) return;
    const node = byIdRef.current.get(root);
    if (!node || !visibleRef.current.has(root)) return;

    const camera = cameraRef.current;
    const screenX = node.x * camera.k + camera.tx;
    const screenY = node.y * camera.k + camera.ty;
    const margin = 80;
    const onScreen = screenX >= margin && screenX <= width - margin && screenY >= margin && screenY <= height - margin;
    if (onScreen) return;

    tweenRef.current = {
      from: camera,
      to: { k: camera.k, tx: width / 2 - node.x * camera.k, ty: height / 2 - node.y * camera.k },
      frame: 0,
    };
  };

  const fitToView = () => {
    const { width, height } = sizeRef.current;
    const shown = nodesRef.current.filter((node) => visibleRef.current.has(node.id));
    if (shown.length === 0 || width === 0) return;
    tweenRef.current = { from: cameraRef.current, to: fitCamera(shown, width, height), frame: 0 };
    dirtyRef.current = true;
  };

  const zoomBy = (factor: number) => {
    const { width, height } = sizeRef.current;
    cameraRef.current = zoomAbout(cameraRef.current, width / 2, height / 2, factor);
    tweenRef.current = null;
    dirtyRef.current = true;
    commitCameraSoon();
  };

  /* ── The simulation ─────────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const linkForce = forceLink<GraphSimNode, SimLink>([])
      .id((node) => node.id)
      // Strength stays at d3's default (1/min(degree)): it is degree-aware, so a hub isn't torn
      // apart by its own links, and no hand-picked constant beats it. Distance has to be
      // degree-aware too, or a forty-spoke hub packs its children into an unreadable ball —
      // the ring needs to grow with the number of things standing on it.
      .distance((link) => {
        const busiest = Math.max((link.source as GraphSimNode).degree, (link.target as GraphSimNode).degree);
        return GRAPH_LINK_DISTANCE + Math.sqrt(busiest) * GRAPH_LINK_DISTANCE_PER_DEGREE;
      });
    linkForceRef.current = linkForce;

    simRef.current = forceSimulation<GraphSimNode, SimLink>()
      .force("link", linkForce)
      .force("charge", forceManyBody<GraphSimNode>().strength(GRAPH_CHARGE).distanceMax(GRAPH_CHARGE_MAX))
      .force(
        "collide",
        forceCollide<GraphSimNode>()
          .radius((node) => nodeRadius(node.degree) + GRAPH_COLLIDE_PADDING)
          .iterations(1),
      )
      // Gravity toward the world origin rather than forceCenter — see GRAPH_GRAVITY.
      .force("x", forceX<GraphSimNode>(0).strength(GRAPH_GRAVITY))
      .force("y", forceY<GraphSimNode>(0).strength(GRAPH_GRAVITY))
      // Stopped on purpose: the frame loop below drives it. `restart()` must never be called here —
      // it would start d3's own timer racing ours, and d3-timer catches up after a stall by firing
      // several times in one frame.
      .stop();

    return () => {
      simRef.current?.stop();
      simRef.current = null;
      linkForceRef.current = null;
    };
  }, []);

  /**
   * Rebuilds the node/edge arrays for a new signature, **carrying the live layout across**: a node
   * that still exists keeps its exact position, velocity and pin. A rename, a new note or a new link
   * therefore nudges the graph instead of reshuffling everything the user arranged by hand.
   */
  useEffect(() => {
    const sim = simRef.current;
    const linkForce = linkForceRef.current;
    if (!sim || !linkForce) return;

    const { model: current, savedPositions: positions } = latestRef.current;
    const hadNodes = byIdRef.current.size > 0;

    const nodes = createSimNodes(current, byIdRef.current, positions);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    seedPositions(nodes, byId, current);
    pinNodes(nodes, pinnedRef.current);

    const edges: SimLink[] = current.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      linkType: edge.linkType,
    }));

    /* Order matters: `sim.nodes()` re-initializes every force, and forceLink resolving edges that
     * still name removed nodes throws `missing: <id>`. Empty it, swap the nodes, refill it. */
    linkForce.links([]);
    sim.nodes(nodes);
    linkForce.links(edges);

    nodesRef.current = nodes;
    edgesRef.current = edges;
    byIdRef.current = byId;

    // A first layout has to find its shape; one that carried over is only absorbing an edit.
    sim.alpha(hadNodes ? GRAPH_WARM_ALPHA : 1);
    if (!hadNodes) {
      // Pre-roll, so the first painted frame is a graph rather than a knot at the origin. It still
      // animates on from here — watching it breathe into place is how you tell the view is live.
      for (let i = 0; i < 60; i++) sim.tick();
    }
    dirtyRef.current = true;

    // Positions for notes that no longer exist would otherwise accumulate forever. The reducer
    // no-ops when nothing is stale, so this can't loop into a write on every mount.
    dispatch(pruneGraphPositions(current.nodes.map((node) => node.id)));
  }, [signature, dispatch]);

  useEffect(() => {
    const pinned = new Set(pinnedIds);
    pinnedRef.current = pinned;
    // "Unpin all" and "Reset view" only empty the store — the simulation's nodes are still nailed
    // down by their fx/fy, and would sit there ignoring the layout forever.
    if (releaseUnpinned(nodesRef.current, pinned)) wake(GRAPH_WARM_ALPHA);
    dirtyRef.current = true;
  }, [pinnedIds]);

  /** `resetGraphView` clears the camera; that is the signal to frame the graph afresh. */
  useEffect(() => {
    if (savedCamera !== null) return;
    const { width, height } = sizeRef.current;
    if (width === 0 || nodesRef.current.length === 0) {
      fittedRef.current = false; // the canvas isn't sized yet — the resize handler will fit it
      return;
    }
    fittedRef.current = true;
    cameraRef.current = fitCamera(nodesRef.current, width, height);
    dirtyRef.current = true;
  }, [savedCamera]);

  /* ── Filters: a mask, never a re-layout ─────────────────────────────────────────────────── */

  useEffect(() => {
    const { model: current, rootId: root } = latestRef.current;
    visibleRef.current = visibleNodeIds(current, filters, root);
    dirtyRef.current = true;
    // Opening a different note while the graph is up should move to it, same as opening the graph on one.
    revealRootRef.current = true;

    /* The depth slider is a deliberate change of scope, so the camera follows it — a depth-1
     * neighbourhood of four nodes would otherwise sit marooned somewhere off-screen inside the full
     * layout, and switching back *off* would leave you zoomed into that neighbourhood with the rest
     * of the network out of frame. Typing in the search box deliberately does **not** move the
     * camera: yanking the view on every keystroke is unusable. */
    const depthChanged = lastDepthRef.current !== filters.localDepth;
    lastDepthRef.current = filters.localDepth;
    if (depthChanged && sizeRef.current.width > 0) {
      const shown = nodesRef.current.filter((node) => visibleRef.current.has(node.id));
      if (shown.length > 0) {
        tweenRef.current = {
          from: cameraRef.current,
          to: fitCamera(shown, sizeRef.current.width, sizeRef.current.height),
          frame: 0,
        };
      }
    }
  }, [filters, signature, rootId]);

  /* ── Canvas, frame loop, wheel and keys ─────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctxRef.current = ctx;

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      // The observer fires at 0×0 while the pane is hidden; a zero-size backing store blanks the canvas.
      if (!width || !height) return;
      // Re-read every time, so dragging the window onto a different monitor re-crisps it.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      sizeRef.current = { width, height, dpr };

      // Only the first real size fits the graph, and only when no camera was restored. A later
      // resize — collapsing the explorer — must leave the view exactly where the user put it.
      if (!fittedRef.current && nodesRef.current.length > 0) {
        fittedRef.current = true;
        cameraRef.current = fitCamera(nodesRef.current, width, height);
      }
      dirtyRef.current = true;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onWheel = (event: WheelEvent) => {
      // React attaches `wheel` passively at the root, so preventDefault has to come from a native
      // listener — without it a trackpad gesture triggers Chrome's back-swipe.
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      cameraRef.current = zoomAbout(
        cameraRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        Math.exp(-delta * GRAPH_ZOOM_SENSITIVITY),
      );
      tweenRef.current = null;
      dirtyRef.current = true;
      commitCameraSoon();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const onKeyDown = (event: KeyboardEvent) => {
      // Read through latestRef, never from the closure: depending on `panelOpen` here would put it
      // in this effect's deps, and toggling the panel would then tear down and rebuild the whole
      // canvas pipeline — cancelling the frame loop and reallocating the backing store, which
      // blanks the canvas for a frame and reads as a jerk.
      if (event.key === "Escape") {
        if (latestRef.current.panelOpen) dispatch(toggleGraphPanel());
        else latestRef.current.onClose();
        return;
      }
      if (event.key === "f" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (!latestRef.current.panelOpen) dispatch(toggleGraphPanel());
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const sim = simRef.current;
      if (!sim) return;

      // Deferred to the loop rather than run from an effect: on mount the canvas has no size yet,
      // and this needs both a measured viewport and a placed graph.
      if (revealRootRef.current && sizeRef.current.width > 0 && nodesRef.current.length > 0) {
        revealRootRef.current = false;
        revealRoot();
      }

      const ticking = sim.alpha() > sim.alphaMin();
      if (ticking) {
        sim.tick();
        guardPositions(nodesRef.current);
      }

      const fading = stepFades(nodesRef.current, visibleRef.current);
      const dimming = stepDim(nodesRef.current, latestRef.current.model, hoverIdRef.current);
      const tweening = stepTween();

      // The settle edge: one snapshot of the finished layout, not one per frame.
      if (tickingRef.current && !ticking) dispatch(saveGraphLayout(snapshotOf(nodesRef.current)));
      tickingRef.current = ticking;

      if (!ticking && !fading && !dimming && !tweening && !dirtyRef.current) return; // nothing moved
      dirtyRef.current = false;
      drawGraphFrame(ctx, buildScene());
      updateZoomLabel();
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (cameraCommitRef.current !== null) clearTimeout(cameraCommitRef.current);
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      // Closing the graph mid-settle must not lose where everything ended up.
      if (nodesRef.current.length > 0) dispatch(saveGraphLayout(snapshotOf(nodesRef.current)));
      dispatch(setGraphCamera(cameraRef.current));
    };
    // Deliberately mount-only (`dispatch` is stable). Everything time-varying is read through
    // `latestRef` — the canvas, its backing store, the ResizeObserver and the frame loop are created
    // once and live for as long as the component does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  /* ── Pointer input ──────────────────────────────────────────────────────────────────────── */

  const pointerPosition = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const { x, y } = pointerPosition(event);
    const node = nodeAt(x, y);

    if (node && event.altKey) {
      // Unpin. Not double-click: a dblclick fires two clicks first, so it would open the note.
      unpinNode(node);
      dispatch(unpinGraphNode(node.id));
      wake(GRAPH_WARM_ALPHA);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    if (node) {
      // No movement threshold here: the node tracks the cursor from the first pixel. Whether it was
      // a drag or a click is decided on release, so a click that jittered still opens the note.
      dragRef.current = { id: node.id, wasPinned: node.fx !== null, sx: event.clientX, sy: event.clientY, moved: 0 };
      holdNodeAt(node, node.x, node.y);
      simRef.current?.alphaTarget(GRAPH_DRAG_ALPHA);
      wake(GRAPH_DRAG_ALPHA);
      setCursor("grabbing");
      return;
    }
    panRef.current = { x: event.clientX, y: event.clientY };
    tweenRef.current = null;
    setCursor("grabbing");
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPosition(event);

    const drag = dragRef.current;
    if (drag) {
      const node = byIdRef.current.get(drag.id);
      if (node) {
        const world = toWorld(cameraRef.current, x, y);
        holdNodeAt(node, world.x, world.y);
      }
      drag.moved = Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy);
      dirtyRef.current = true;
      return;
    }

    const pan = panRef.current;
    if (pan) {
      const camera = cameraRef.current;
      cameraRef.current = {
        ...camera,
        tx: camera.tx + (event.clientX - pan.x),
        ty: camera.ty + (event.clientY - pan.y),
      };
      panRef.current = { x: event.clientX, y: event.clientY };
      dirtyRef.current = true;
      return;
    }

    // Hover goes to a ref, never state: a setState here would re-render the pane on every one of a
    // trackpad's ~120 moves a second, for something only the painter needs.
    const hovered = nodeAt(x, y);
    const id = hovered?.id ?? null;
    if (id !== hoverIdRef.current) {
      hoverIdRef.current = id;
      dirtyRef.current = true;
    }
    setCursor(hovered ? "pointer" : "grab");
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCursor("grab");

    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      simRef.current?.alphaTarget(0); // without this the layout never settles again
      const node = byIdRef.current.get(drag.id);
      if (node) {
        if (drag.moved <= GRAPH_CLICK_SLOP_PX) {
          // A click, not a drag. Don't leave behind a pin the user never asked for.
          if (!drag.wasPinned) unpinNode(node);
          dirtyRef.current = true;
          // Capture is already released above — this unmounts the canvas mid-gesture.
          latestRef.current.onOpenNode(node);
          return;
        }
        dispatch(pinGraphNode({ id: node.id, x: round1(node.x), y: round1(node.y) }));
      }
      return;
    }

    if (panRef.current) {
      panRef.current = null;
      dispatch(setGraphCamera(cameraRef.current));
    }
  };

  const handlePointerCancel = () => {
    if (dragRef.current) {
      dragRef.current = null;
      simRef.current?.alphaTarget(0);
    }
    panRef.current = null;
    setCursor("grab");
  };

  const buttonClass =
    "cursor-pointer rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent";

  const tagsInGraph = [...new Set(model.nodes.flatMap((node) => node.tags))].sort();

  return (
    <div className="relative size-full overflow-hidden rounded-xl border border-neutral-800">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="size-full cursor-grab touch-none select-none"
      />

      {/* The same floating toolbar as DiagramViewport's, including the stopPropagation that keeps a
          button press from starting a pan on the surface underneath it. */}
      <div
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute top-2 right-2 flex items-center gap-x-0.5 rounded-lg border border-neutral-700 bg-neutral-900/90 p-0.5 backdrop-blur"
      >
        <button type="button" onClick={() => zoomBy(1 / GRAPH_ZOOM_STEP)} aria-label="Zoom out" className={buttonClass}>
          <ZoomOutIcon className="size-4" />
        </button>
        {/* Zoom is otherwise invisible — at a glance you can't tell 2× from 8×, or that you've hit
            the ceiling. Clicking the readout snaps back to fitted, as in DiagramViewport.
            The text is written by the frame loop, never by React: the camera lives in a ref
            precisely so a wheel gesture doesn't re-render the pane sixty times a second. */}
        <button
          type="button"
          onClick={fitToView}
          aria-label="Reset zoom to fit"
          title="Reset zoom to fit"
          className="w-12 shrink-0 cursor-pointer rounded-lg px-1 py-1.5 text-center tabular-nums caption-small-regular text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <span ref={seedZoomLabel} />
        </button>
        <button type="button" onClick={() => zoomBy(GRAPH_ZOOM_STEP)} aria-label="Zoom in" className={buttonClass}>
          <ZoomInIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={fitToView}
          aria-label="Fit graph to view"
          title="Fit to view"
          className={buttonClass}
        >
          <ScanIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => dispatch(toggleGraphPanel())}
          aria-label="Filters"
          title="Filters (⌘F)"
          className={panelOpen ? `${buttonClass} bg-neutral-800 text-white` : buttonClass}
        >
          <FilterIcon className="size-4" />
        </button>
      </div>

      {panelOpen && <GraphFilterPanel tags={tagsInGraph} hasOpenNote={rootId !== null} />}
    </div>
  );
};

/* ── Simulation-node mutation, at module scope ──────────────────────────────────────────────
 *
 * These own every write to a `GraphSimNode`. Keeping them out of the component is not style: the
 * React Compiler traces the nodes back to the `model` prop and freezes them, so a component-level
 * mutation is a lint error — correctly, since these objects are rewritten sixty times a second and
 * are the one thing in this feature React must not be asked to track.
 */

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The toolbar's zoom readout. Matches DiagramViewport's, so both renderers report zoom the same way. */
const zoomText = (k: number) => `${Math.round(k * 100)}%`;

/** Eases `current` toward `target`, snapping once it is close enough to stop animating. */
const ease = (current: number, target: number, step: number) =>
  Math.abs(target - current) < 0.01 ? target : current + (target - current) * step;

/** A node d3 is holding at a fixed point — dragged, or restored to where it was dropped. */
function holdNodeAt(node: GraphSimNode, x: number, y: number) {
  node.fx = x;
  node.fy = y;
}

function unpinNode(node: GraphSimNode) {
  node.fx = null;
  node.fy = null;
}

function pinNodes(nodes: GraphSimNode[], pinned: Set<GraphNodeId>) {
  for (const node of nodes) {
    if (pinned.has(node.id)) holdNodeAt(node, node.x, node.y);
  }
}

/** Frees nodes the store no longer lists as pinned. Returns whether anything was actually released. */
function releaseUnpinned(nodes: GraphSimNode[], pinned: Set<GraphNodeId>): boolean {
  let released = false;
  for (const node of nodes) {
    if (node.fx === null || pinned.has(node.id)) continue;
    unpinNode(node);
    released = true;
  }
  return released;
}

/**
 * The simulation's nodes for a new model, carrying over every node that survived. `NaN` marks one
 * that still needs a position — `seedPositions` fills those in.
 */
function createSimNodes(
  model: GraphModel,
  previous: Map<GraphNodeId, GraphSimNode>,
  positions: Record<string, [number, number]>,
): GraphSimNode[] {
  return model.nodes.map((node) => {
    const carried = previous.get(node.id);
    if (carried) {
      return {
        ...node,
        x: carried.x,
        y: carried.y,
        vx: carried.vx,
        vy: carried.vy,
        fx: carried.fx,
        fy: carried.fy,
        alpha01: carried.alpha01,
        lit01: carried.lit01,
      };
    }
    const saved = positions[node.id];
    return {
      ...node,
      x: saved ? saved[0] : Number.NaN,
      y: saved ? saved[1] : Number.NaN,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      alpha01: 1,
      lit01: 1,
    };
  });
}

/**
 * Gives every unplaced node a position near its neighbours, before d3 sees the array. d3 would
 * otherwise seed it on a phyllotaxis spiral around the origin — which, with a restored layout
 * sitting at (2000, -900), drops a new note a screenful away and lets charge yank everything after it.
 */
function seedPositions(nodes: GraphSimNode[], byId: Map<GraphNodeId, GraphSimNode>, model: GraphModel) {
  const placed = nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
  const fallback =
    placed.length > 0
      ? {
          x: placed.reduce((sum, node) => sum + node.x, 0) / placed.length,
          y: placed.reduce((sum, node) => sum + node.y, 0) / placed.length,
        }
      : { x: 0, y: 0 };

  for (const node of nodes) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) continue;
    const anchors = (model.adjacency.get(node.id) ?? [])
      .map((id) => byId.get(id))
      .filter((neighbour): neighbour is GraphSimNode => !!neighbour && Number.isFinite(neighbour.x));
    const base =
      anchors.length > 0
        ? {
            x: anchors.reduce((sum, n) => sum + n.x, 0) / anchors.length,
            y: anchors.reduce((sum, n) => sum + n.y, 0) / anchors.length,
          }
        : fallback;
    node.x = base.x + (Math.random() - 0.5) * GRAPH_SEED_JITTER;
    node.y = base.y + (Math.random() - 0.5) * GRAPH_SEED_JITTER;
  }
}

/** Two nodes pinned at the same point make forceCollide divide by zero, and a NaN there is permanent. */
function guardPositions(nodes: GraphSimNode[]) {
  for (const node of nodes) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) continue;
    node.x = (Math.random() - 0.5) * GRAPH_SEED_JITTER;
    node.y = (Math.random() - 0.5) * GRAPH_SEED_JITTER;
    node.vx = 0;
    node.vy = 0;
    if (node.fx !== null) unpinNode(node);
  }
}

/** Eases each node toward shown or hidden. Returns whether anything is still fading. */
function stepFades(nodes: GraphSimNode[], visible: Set<GraphNodeId>): boolean {
  let moving = false;
  for (const node of nodes) {
    const target = visible.has(node.id) ? 1 : 0;
    if (node.alpha01 === target) continue;
    node.alpha01 = ease(node.alpha01, target, GRAPH_FADE_STEP);
    moving = true;
  }
  return moving;
}

/** The hover spotlight: the hovered node and its neighbours stay lit, everything else dims. */
function stepDim(nodes: GraphSimNode[], model: GraphModel, hoverId: GraphNodeId | null): boolean {
  const lit = hoverId === null ? null : new Set([hoverId, ...(model.adjacency.get(hoverId) ?? [])]);
  let moving = false;
  for (const node of nodes) {
    const target = lit === null || lit.has(node.id) ? 1 : GRAPH_DIM_ALPHA;
    if (node.lit01 === target) continue;
    node.lit01 = ease(node.lit01, target, GRAPH_DIM_STEP);
    moving = true;
  }
  return moving;
}

function snapshotOf(nodes: GraphSimNode[]): Record<string, [number, number]> {
  const positions: Record<string, [number, number]> = {};
  for (const node of nodes) positions[node.id] = [round1(node.x), round1(node.y)];
  return positions;
}

export default ForceGraph;
