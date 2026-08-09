import { describe, expect, it } from "vitest";
import {
  buildGraphModel,
  fitCamera,
  graphSignature,
  localGraphIds,
  noteNodeId,
  refNodeId,
  sanitizePositions,
  tagColor,
  toWorld,
  visibleNodeIds,
  zoomAbout,
} from "@/modules/notes/utils/graph";
import { GRAPH_FIT_MAX_ZOOM, GRAPH_MAX_ZOOM, GRAPH_MIN_ZOOM } from "@/modules/notes/constants";
import type { GraphFilters } from "@/modules/notes/types";
import type { NoteLink, NoteSummary } from "@/services/operations/notes/notes.route";

const note = (id: number, title: string, tags: string[] = []): NoteSummary => ({
  id,
  title,
  tags,
  folderId: null,
  updatedAt: "2026-08-02T00:00:00Z",
});

const link = (sourceNoteId: number, targetRef: string, linkType: NoteLink["linkType"] = "link"): NoteLink => ({
  sourceNoteId,
  targetRef,
  linkType,
});

const filters = (overrides: Partial<GraphFilters> = {}): GraphFilters => ({
  query: "",
  hideOrphans: false,
  colorByTag: false,
  localDepth: 0,
  ...overrides,
});

describe("buildGraphModel", () => {
  it("resolves a link target to a note by title, case-insensitively", () => {
    const model = buildGraphModel([note(1, "Alpha"), note(2, "Beta")], [link(1, "beta")]);
    expect(model.nodes).toHaveLength(2);
    expect(model.edges).toEqual([{ source: noteNodeId(1), target: noteNodeId(2), linkType: "link" }]);
  });

  it("keys note nodes on the id, so a rename cannot split a node", () => {
    const model = buildGraphModel([note(7, "Renamed Later")], []);
    expect(model.nodes[0].id).toBe("note:7");
    expect(model.nodes[0].noteId).toBe(7);
  });

  it("collapses a repeated pair into one edge, whatever the link type", () => {
    const model = buildGraphModel(
      [note(1, "Alpha"), note(2, "Beta")],
      [link(1, "Beta"), link(1, "beta"), link(1, "Beta", "embed")],
    );
    expect(model.edges).toHaveLength(1);
    expect(model.nodes.find((n) => n.id === noteNodeId(1))!.degree).toBe(1);
  });

  it("keeps both directions of a mutual link as two edges", () => {
    const model = buildGraphModel([note(1, "Alpha"), note(2, "Beta")], [link(1, "Beta"), link(2, "Alpha")]);
    expect(model.edges).toHaveLength(2);
  });

  it("drops a self-link", () => {
    const model = buildGraphModel([note(1, "Alpha")], [link(1, "alpha")]);
    expect(model.edges).toEqual([]);
    expect(model.nodes[0].degree).toBe(0);
  });

  it("excludes a [[Title.diagram]] target — that is a diagram, not an unwritten note", () => {
    const model = buildGraphModel([note(1, "Alpha")], [link(1, "Flowchart.diagram")]);
    expect(model.nodes).toHaveLength(1);
    expect(model.edges).toEqual([]);
  });

  it("creates one placeholder node per distinct unresolved target, case-folded", () => {
    const model = buildGraphModel([note(1, "Alpha"), note(2, "Beta")], [link(1, "Ghost"), link(2, "ghost")]);
    const placeholders = model.nodes.filter((n) => n.noteId === null);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].id).toBe(refNodeId("Ghost"));
    expect(placeholders[0].title).toBe("Ghost"); // labelled as first written, not lowercased
    expect(placeholders[0].degree).toBe(2);
  });

  it("preserves the embed link type on the edge", () => {
    const model = buildGraphModel([note(1, "Alpha"), note(2, "Beta")], [link(1, "Beta", "embed")]);
    expect(model.edges[0].linkType).toBe("embed");
  });

  it("counts degree in both directions and builds symmetric adjacency", () => {
    const model = buildGraphModel([note(1, "Alpha"), note(2, "Beta")], [link(1, "Beta")]);
    expect(model.nodes.find((n) => n.id === noteNodeId(1))!.degree).toBe(1);
    expect(model.nodes.find((n) => n.id === noteNodeId(2))!.degree).toBe(1);
    expect(model.adjacency.get(noteNodeId(1))).toEqual([noteNodeId(2)]);
    expect(model.adjacency.get(noteNodeId(2))).toEqual([noteNodeId(1)]);
  });

  it("ignores a link from a note the explorer does not have", () => {
    const model = buildGraphModel([note(1, "Alpha")], [link(99, "Alpha")]);
    expect(model.edges).toEqual([]);
  });

  it("ignores a blank target", () => {
    expect(buildGraphModel([note(1, "Alpha")], [link(1, "   ")]).edges).toEqual([]);
  });

  it("returns an empty model for no notes", () => {
    const model = buildGraphModel([], []);
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });
});

describe("graphSignature", () => {
  it("is stable across a new array identity with the same content", () => {
    const a = graphSignature([note(1, "Alpha")], [link(1, "Beta")]);
    const b = graphSignature([note(1, "Alpha")], [link(1, "Beta")]);
    expect(a).toBe(b);
  });

  it("changes on a rename, a new note, and a new link", () => {
    const base = graphSignature([note(1, "Alpha")], []);
    expect(graphSignature([note(1, "Renamed")], [])).not.toBe(base);
    expect(graphSignature([note(1, "Alpha"), note(2, "Beta")], [])).not.toBe(base);
    expect(graphSignature([note(1, "Alpha")], [link(1, "Beta")])).not.toBe(base);
  });

  it("changes when a tag changes, since tags colour the nodes", () => {
    expect(graphSignature([note(1, "Alpha", ["x"])], [])).not.toBe(graphSignature([note(1, "Alpha")], []));
  });
});

describe("localGraphIds", () => {
  //  1 — 2 — 3 — 4 — 5   (a chain), plus 6 attached to 1
  const chain = buildGraphModel(
    [1, 2, 3, 4, 5, 6].map((id) => note(id, `N${id}`)),
    [link(1, "N2"), link(2, "N3"), link(3, "N4"), link(4, "N5"), link(1, "N6")],
  );
  const known = new Set(chain.nodes.map((n) => n.id));

  it("returns the root plus its immediate neighbours at depth 1", () => {
    const ids = localGraphIds(chain.adjacency, noteNodeId(1), 1, known);
    expect(ids).toEqual(new Set([noteNodeId(1), noteNodeId(2), noteNodeId(6)]));
  });

  it("widens by one hop per depth step", () => {
    expect(localGraphIds(chain.adjacency, noteNodeId(1), 2, known).size).toBe(4);
    expect(localGraphIds(chain.adjacency, noteNodeId(1), 3, known).size).toBe(5);
  });

  it("walks edges undirected — a link's target reaches its source", () => {
    expect(localGraphIds(chain.adjacency, noteNodeId(5), 1, known)).toEqual(new Set([noteNodeId(5), noteNodeId(4)]));
  });

  it("terminates on a cycle", () => {
    const cycle = buildGraphModel(
      [1, 2, 3].map((id) => note(id, `N${id}`)),
      [link(1, "N2"), link(2, "N3"), link(3, "N1")],
    );
    const ids = localGraphIds(cycle.adjacency, noteNodeId(1), 9, new Set(cycle.nodes.map((n) => n.id)));
    expect(ids.size).toBe(3);
  });

  it("returns nothing for a null root, a zero depth, or a root outside the graph", () => {
    expect(localGraphIds(chain.adjacency, null, 2, known).size).toBe(0);
    expect(localGraphIds(chain.adjacency, noteNodeId(1), 0, known).size).toBe(0);
    expect(localGraphIds(chain.adjacency, noteNodeId(404), 2, known).size).toBe(0);
  });

  it("returns just the root when it has no links", () => {
    const lonely = buildGraphModel([note(1, "Alpha")], []);
    expect(localGraphIds(lonely.adjacency, noteNodeId(1), 3, new Set([noteNodeId(1)]))).toEqual(
      new Set([noteNodeId(1)]),
    );
  });
});

describe("visibleNodeIds", () => {
  const model = buildGraphModel(
    [note(1, "Alpha"), note(2, "Beta"), note(3, "Orphan")],
    [link(1, "Beta"), link(1, "Ghost")],
  );

  it("shows everything with default filters", () => {
    expect(visibleNodeIds(model, filters(), null).size).toBe(4); // 3 notes + the Ghost placeholder
  });

  it("matches the query as a case-insensitive substring of the title", () => {
    expect(visibleNodeIds(model, filters({ query: "et" }), null)).toEqual(new Set([noteNodeId(2)]));
    expect(visibleNodeIds(model, filters({ query: "ALPHA" }), null)).toEqual(new Set([noteNodeId(1)]));
  });

  it("matches an unresolved reference on its text", () => {
    expect(visibleNodeIds(model, filters({ query: "ghost" }), null)).toEqual(new Set([refNodeId("Ghost")]));
  });

  it("hideOrphans removes only degree-zero nodes", () => {
    const visible = visibleNodeIds(model, filters({ hideOrphans: true }), null);
    expect(visible.has(noteNodeId(3))).toBe(false);
    expect(visible.size).toBe(3);
  });

  it("intersects query, hideOrphans and localDepth", () => {
    const visible = visibleNodeIds(model, filters({ query: "a", hideOrphans: true, localDepth: 1 }), noteNodeId(1));
    // depth 1 from Alpha = {Alpha, Beta, Ghost}; hideOrphans keeps all three; "a" keeps Alpha and Beta
    expect(visible).toEqual(new Set([noteNodeId(1), noteNodeId(2)]));
  });

  it("ignores localDepth when no note is open", () => {
    expect(visibleNodeIds(model, filters({ localDepth: 1 }), null).size).toBe(4);
  });
});

describe("camera", () => {
  it("keeps the world point under the cursor fixed while zooming", () => {
    const camera = { k: 1.3, tx: 40, ty: -25 };
    const before = toWorld(camera, 300, 180);
    const after = toWorld(zoomAbout(camera, 300, 180, 2.5), 300, 180);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("clamps zoom at both bounds", () => {
    expect(zoomAbout({ k: 1, tx: 0, ty: 0 }, 0, 0, 1e6).k).toBe(GRAPH_MAX_ZOOM);
    expect(zoomAbout({ k: 1, tx: 0, ty: 0 }, 0, 0, 1e-6).k).toBe(GRAPH_MIN_ZOOM);
  });

  it("still holds the cursor point when the zoom clamps", () => {
    const camera = { k: 1, tx: 10, ty: 10 };
    const before = toWorld(camera, 200, 120);
    const after = toWorld(zoomAbout(camera, 200, 120, 1e6), 200, 120);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("fits a bounding box and centres it in the viewport", () => {
    // 1000×200 of content in an 800×600 viewport with 60px padding → limited by x: 680/1000 = 0.68
    const camera = fitCamera(
      [
        { x: -500, y: -100 },
        { x: 500, y: 100 },
      ],
      800,
      600,
    );
    expect(camera.k).toBeCloseTo(0.68, 6);
    expect(camera.tx).toBeCloseTo(400, 6); // the box is centred on the origin, so t is the viewport centre
    expect(camera.ty).toBeCloseTo(300, 6);
  });

  it("never zooms past the fit ceiling, however small the content", () => {
    // 400×200 would fit at 1.7×, but blowing a handful of nodes up that far reads as broken.
    const camera = fitCamera(
      [
        { x: -200, y: -100 },
        { x: 200, y: 100 },
      ],
      800,
      600,
    );
    expect(camera.k).toBe(GRAPH_FIT_MAX_ZOOM);
    expect(camera.tx).toBeCloseTo(400, 6);
  });

  it("centres a single point without dividing by zero", () => {
    const camera = fitCamera([{ x: 50, y: 50 }], 800, 600);
    expect(Number.isFinite(camera.k)).toBe(true);
    expect(camera.k).toBe(GRAPH_FIT_MAX_ZOOM);
    expect(50 * camera.k + camera.tx).toBeCloseTo(400, 6);
    expect(50 * camera.k + camera.ty).toBeCloseTo(300, 6);
  });

  it("returns the identity camera for no points or a zero-size viewport", () => {
    expect(fitCamera([], 800, 600)).toEqual({ k: 1, tx: 0, ty: 0 });
    expect(fitCamera([{ x: 0, y: 0 }], 0, 0)).toEqual({ k: 1, tx: 0, ty: 0 });
  });
});

describe("tagColor", () => {
  it("is stable for the same tag and in range", () => {
    expect(tagColor("project")).toBe(tagColor("project"));
    expect(tagColor("project")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("distinguishes at least a few common tags", () => {
    const colors = new Set(["work", "idea", "reading", "todo"].map(tagColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("sanitizePositions", () => {
  it("keeps well-formed entries and drops everything else", () => {
    expect(
      sanitizePositions({
        "note:1": [10, -20],
        "note:2": [Number.NaN, 5],
        "note:3": [Number.POSITIVE_INFINITY, 0],
        "note:4": [1],
        "note:5": "nope",
        "note:6": ["1", "2"],
      }),
    ).toEqual({ "note:1": [10, -20] });
  });

  it("returns an empty map for a non-object", () => {
    expect(sanitizePositions(null)).toEqual({});
    expect(sanitizePositions("{}")).toEqual({});
    expect(sanitizePositions(undefined)).toEqual({});
  });
});
