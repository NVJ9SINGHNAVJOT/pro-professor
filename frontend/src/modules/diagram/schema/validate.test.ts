import { describe, expect, it } from "vitest";
import { validateBundle } from "@/modules/diagram/schema/validate";
import { makeSampleBundle } from "@/modules/diagram/schema/sampleBundle";

describe("validateBundle", () => {
  it("accepts a well-formed bundle", () => {
    const result = validateBundle(makeSampleBundle());
    expect(result.ok).toBe(true);
  });

  it("rejects a structurally invalid document with a clear error", () => {
    const result = validateBundle({ schemaVersion: "1.0.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("; ")).toMatch(/semantic/);
  });

  it("rejects an edge whose target is not a semantic node", () => {
    const bundle = makeSampleBundle();
    bundle.semantic.edges[0].target = "ghost";
    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("; ")).toContain('target "ghost" is not a semantic node');
  });

  it("rejects a layout entry keyed by a node that does not exist", () => {
    const bundle = makeSampleBundle();
    bundle.layout.orphan = { x: 1, y: 2, w: 10, h: 10 };
    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("; ")).toContain('layout entry "orphan" has no semantic node');
  });

  it("rejects duplicate node ids", () => {
    const bundle = makeSampleBundle();
    bundle.semantic.nodes.push({ id: "gateway", type: "service", label: "Duplicate" });
    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("; ")).toContain('duplicate node id "gateway"');
  });

  it("rejects unregistered node and edge types", () => {
    const bundle = makeSampleBundle();
    bundle.semantic.nodes[0].type = "spaceship";
    bundle.semantic.edges[1].type = "wavy";
    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("; ")).toContain('unregistered type "spaceship"');
      expect(result.errors.join("; ")).toContain('unregistered type "wavy"');
    }
  });
});
