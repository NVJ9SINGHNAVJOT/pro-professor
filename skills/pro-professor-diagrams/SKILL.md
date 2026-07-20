---
name: pro-professor-diagrams
description: Author or edit a Pro Professor diagram (an Excalidraw scene) for the Diagrams → Import paste path. Use when asked to produce a diagram file the user will import into Pro Professor, or to modify a pasted Excalidraw scene.
---

# Writing a Pro Professor diagram (Excalidraw scene)

Pro Professor diagrams are **Excalidraw scenes**. The user imports your output via
**Diagrams → Import** (it must be an object with an `elements` array; the app normalises
the rest with Excalidraw's `restore`, so you may omit boilerplate fields like `seed`,
`version`, `versionNonce`, `updated`, `groupIds`).

> For a graph the user is building interactively, the in-app **AI bar** (which generates via
> Mermaid) is usually better than hand-authoring a scene. Use this skill when a scene *file*
> is specifically wanted.

## Output contract

Respond with **ONLY one JSON object** — no prose, no code fence:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "pro-professor",
  "appState": { "viewBackgroundColor": "#ffffff", "currentItemRoughness": 0, "currentItemFontFamily": 6 },
  "elements": [ ... ],
  "files": {}
}
```

## Professional look (required)

Pro Professor diagrams are **clean, not hand-drawn**. On every element you author:

- `"roughness": 0` (architect / straight lines — never 1 or 2).
- On text elements set `"fontFamily": 6` (Nunito, a normal sans). **Do not** use `5`
  (Excalifont — the sketchy default) or `1` (Virgil). `3` is monospace (code).
- Keep `"strokeStyle": "solid"` unless a dashed edge is intended.

## Elements

A **node** is a shape (`rectangle`, `ellipse`, or `diamond`) with a **bound text label**:

```json
{ "id": "api", "type": "rectangle", "x": 120, "y": 120, "width": 180, "height": 70,
  "roughness": 0, "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
  "customData": { "nodeId": "api" }, "boundElements": [{ "type": "text", "id": "api-t" }] }
```
```json
{ "id": "api-t", "type": "text", "x": 130, "y": 145, "width": 160, "height": 25,
  "text": "API Gateway", "fontFamily": 6, "fontSize": 20, "textAlign": "center",
  "roughness": 0, "containerId": "api" }
```

An **edge** is an `arrow` bound to two shapes. The arrow carries `startBinding`/`endBinding`
(by the shape `id`), and **each connected shape must also list the arrow in its
`boundElements`** — all three references must agree:

```json
{ "id": "e1", "type": "arrow", "x": 300, "y": 155, "width": 160, "height": 0,
  "points": [[0, 0], [160, 0]], "roughness": 0,
  "startBinding": { "elementId": "api", "focus": 0, "gap": 6 },
  "endBinding": { "elementId": "db", "focus": 0, "gap": 6 },
  "customData": { "edgeId": "e1" } }
```

## Styling (optional)

- Node fill / stroke: element `"backgroundColor"` and `"strokeColor"` (CSS colors, e.g.
  `"#0ea5e9"`; `"transparent"` for no fill).
- Dashed edge: arrow `"strokeStyle": "dashed"`. Arrowheads: `"endArrowhead": "arrow"` (default)
  or `null`; `"startArrowhead": "arrow"` for a double-headed edge.

## Identity for later AI edits (recommended)

Tag each shape with `"customData": { "nodeId": "<kebab-id>" }` and each arrow with
`"customData": { "edgeId": "<kebab-id>" }`. This lets Pro Professor's AI bar resolve
"connect X to Y" / "delete X" against the diagram after import. Ids are your own short
kebab-case strings and must be unique.

## Guidance

- Use `diamond` for decisions, `rectangle` for components/services, `ellipse` for
  start/end or datastores. Give arrows a bound text label for the relationship if useful
  (a text element with `containerId` set to the arrow's id, `fontFamily: 6`).
- The diagram's **title** is not part of this JSON — the user names it at import. To embed
  it in a note afterwards, that note references it as `![[Title.diagram]]`.
