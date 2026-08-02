import {
  GRAPH_ACCENT_COLOR,
  GRAPH_EDGE_COLOR,
  GRAPH_LABEL_COLOR,
  GRAPH_LABEL_FONT,
  GRAPH_LABEL_MAX_CHARS,
  GRAPH_LABEL_MIN_ZOOM,
  GRAPH_MISSING_COLOR,
  GRAPH_NODE_COLOR,
} from "@/modules/notes/constants";
import { nodeRadius, tagColor } from "@/modules/notes/utils/graph";
import type { GraphCamera, GraphNodeId, GraphSimEdge, GraphSimNode } from "@/modules/notes/types";

/**
 * The interactive graph's painter. Pure: it takes a scene and draws it, holding no state of its own,
 * which keeps `ForceGraph` to the plumbing (canvas, pointer events, the frame loop) and makes the
 * drawing readable on its own. Same split as `home/utils/galaxy.ts` and `GalaxyBackdrop`.
 */

export interface GraphScene {
  nodes: GraphSimNode[];
  edges: GraphSimEdge[];
  camera: GraphCamera;
  /** CSS pixels, not backing-store pixels — the transform below re-applies `dpr` itself. */
  width: number;
  height: number;
  dpr: number;
  hoverId: GraphNodeId | null;
  /** The note currently open, ringed so you can find yourself in the network. */
  rootId: GraphNodeId | null;
  pinnedIds: Set<GraphNodeId>;
  colorByTag: boolean;
}

/** How visible a node is right now: its filter fade times its hover dim. */
const opacityOf = (node: GraphSimNode) => node.alpha01 * node.lit01;

export function nodeColor(node: GraphSimNode, colorByTag: boolean): string {
  if (node.noteId === null) return GRAPH_MISSING_COLOR;
  if (colorByTag && node.tags.length > 0) return tagColor(node.tags[0]);
  return GRAPH_NODE_COLOR;
}

const truncate = (text: string) =>
  text.length <= GRAPH_LABEL_MAX_CHARS ? text : `${text.slice(0, GRAPH_LABEL_MAX_CHARS - 1)}…`;

export function drawGraphFrame(ctx: CanvasRenderingContext2D, scene: GraphScene): void {
  const { camera, width, height, dpr } = scene;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // World space: everything below is in graph coordinates, so line widths and radii have to be
  // divided by `k` when they should stay a constant number of screen pixels.
  ctx.setTransform(dpr * camera.k, 0, 0, dpr * camera.k, dpr * camera.tx, dpr * camera.ty);

  const highlighted = scene.hoverId;
  ctx.lineCap = "round";

  for (const edge of scene.edges) {
    const opacity = Math.min(opacityOf(edge.source), opacityOf(edge.target));
    if (opacity < 0.02) continue;

    const touchesHover = highlighted !== null && (edge.source.id === highlighted || edge.target.id === highlighted);
    ctx.globalAlpha = opacity * (touchesHover ? 0.9 : 0.55);
    ctx.strokeStyle = touchesHover ? GRAPH_ACCENT_COLOR : GRAPH_EDGE_COLOR;
    ctx.lineWidth = (touchesHover ? 1.6 : 1) / camera.k;
    // An `![[embed]]` is a different relationship from a `[[link]]`, and the Mermaid renderer draws
    // it dashed too — the two views should read the same way.
    ctx.setLineDash(edge.linkType === "embed" ? [4 / camera.k, 4 / camera.k] : []);

    ctx.beginPath();
    ctx.moveTo(edge.source.x, edge.source.y);
    ctx.lineTo(edge.target.x, edge.target.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const node of scene.nodes) {
    const opacity = opacityOf(node);
    if (opacity < 0.02) continue;
    const radius = nodeRadius(node.degree);

    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

    if (node.noteId === null) {
      // An unresolved `[[target]]` is a note that doesn't exist yet — hollow and dashed, matching
      // the Mermaid renderer's `classDef missing`.
      ctx.strokeStyle = GRAPH_MISSING_COLOR;
      ctx.lineWidth = 1.5 / camera.k;
      ctx.setLineDash([3 / camera.k, 3 / camera.k]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = nodeColor(node, scene.colorByTag);
      ctx.fill();
    }

    if (node.id === scene.rootId) {
      /* The note you have open. This is "you are here" in a network of a few hundred dots, so it is
       * the one thing drawn in the accent colour outright — a ring alone reads the same as a hover
       * and disappears the moment the graph gets busy. */
      ctx.fillStyle = GRAPH_ACCENT_COLOR;
      ctx.fill();
      ctx.strokeStyle = GRAPH_ACCENT_COLOR;
      ctx.lineWidth = 1.5 / camera.k;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 5 / camera.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = opacity * 0.35;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 9 / camera.k, 0, Math.PI * 2);
      ctx.stroke();
    } else if (node.id === highlighted) {
      ctx.strokeStyle = GRAPH_ACCENT_COLOR;
      ctx.lineWidth = 2 / camera.k;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 3 / camera.k, 0, Math.PI * 2);
      ctx.stroke();
    } else if (scene.pinnedIds.has(node.id)) {
      // Pinning is invisible otherwise — you'd have no way to tell why a node ignores the layout.
      ctx.globalAlpha = opacity * 0.6;
      ctx.strokeStyle = GRAPH_LABEL_COLOR;
      ctx.lineWidth = 1 / camera.k;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 2.5 / camera.k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* Labels go back to screen space. Drawn in world space they would scale with the camera — 3px tall
   * when zoomed out, billboards when zoomed in — so they are projected by hand and drawn at a fixed
   * size instead. */
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = GRAPH_LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = GRAPH_LABEL_COLOR;

  const zoomedOut = camera.k < GRAPH_LABEL_MIN_ZOOM;
  /* Labels are placed like a map's: a label is drawn only where there is room for it. Without this
   * a dense cluster — a hub with forty children — renders every title on top of every other and the
   * whole neighbourhood becomes a grey smear. Zooming in spreads the nodes, which frees space, and
   * more labels appear. Called-out nodes are laid out first so they always win their spot. */
  const claimed: { left: number; right: number; top: number; bottom: number }[] = [];
  const overlaps = (box: (typeof claimed)[number]) =>
    claimed.some(
      (other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
    );

  const isCalledOut = (id: GraphNodeId) => id === highlighted || id === scene.rootId || scene.pinnedIds.has(id);
  const ordered = [...scene.nodes].sort((a, b) => {
    const priority = Number(isCalledOut(b.id)) - Number(isCalledOut(a.id));
    // Then by degree: in a crowd, the note everything points at is the useful one to name.
    return priority !== 0 ? priority : b.degree - a.degree;
  });

  for (const node of ordered) {
    const opacity = opacityOf(node);
    // Below full-ish opacity a label is noise rather than information.
    if (opacity < 0.3) continue;
    const calledOut = isCalledOut(node.id);
    if (zoomedOut && !calledOut) continue;

    const screenX = node.x * camera.k + camera.tx;
    const screenY = node.y * camera.k + camera.ty;
    if (screenX < -80 || screenX > width + 80 || screenY < -20 || screenY > height + 20) continue; // off-screen

    const text = truncate(node.title);
    const top = screenY + nodeRadius(node.degree) * camera.k + 4;
    const halfWidth = ctx.measureText(text).width / 2;
    const box = { left: screenX - halfWidth - 2, right: screenX + halfWidth + 2, top: top - 1, bottom: top + 13 };
    // A called-out label is drawn regardless — it is the answer to what the user just pointed at.
    if (!calledOut && overlaps(box)) continue;
    claimed.push(box);

    ctx.globalAlpha = opacity * (calledOut ? 1 : 0.75);
    ctx.fillText(text, screenX, top);
  }

  ctx.globalAlpha = 1;
}
