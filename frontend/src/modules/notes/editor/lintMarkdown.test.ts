import { describe, expect, it } from "vitest";
import { lintMarkdown } from "@/modules/notes/editor/lintMarkdown";

/** Nothing exists, so every wiki-link is unresolved. */
const noNotes = () => false;

describe("code fences", () => {
  it("reports a fence that is never closed, at its opening line", () => {
    const problems = lintMarkdown("intro\n\n```js\nconst a = 1;\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(3);
    expect(problems[0].severity).toBe("error");
  });

  it("accepts a closed fence", () => {
    expect(lintMarkdown("```js\nconst a = 1;\n```\n")).toEqual([]);
  });

  it("accepts a longer closing fence and tilde fences", () => {
    expect(lintMarkdown("```\na\n````\n")).toEqual([]);
    expect(lintMarkdown("~~~\na\n~~~\n")).toEqual([]);
  });

  it("does not close a backtick fence with tildes", () => {
    expect(lintMarkdown("```\na\n~~~\n")).toHaveLength(1);
  });

  it("ignores problems inside a fence", () => {
    expect(lintMarkdown("```\n#NotAHeading here\n| a | b |\n```\n")).toEqual([]);
  });
});

describe("tables", () => {
  it("reports a header with no separator row", () => {
    const problems = lintMarkdown("| Name | Age |\n| Ada | 36 |\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(1);
    expect(problems[0].severity).toBe("error");
  });

  it("accepts a well-formed table", () => {
    expect(lintMarkdown("| Name | Age |\n| --- | --- |\n| Ada | 36 |\n")).toEqual([]);
  });

  it("accepts alignment markers", () => {
    expect(lintMarkdown("| a | b |\n| :-- | --: |\n")).toEqual([]);
  });

  it("reports a column count mismatch", () => {
    const problems = lintMarkdown("| a | b | c |\n| --- | --- |\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warning");
  });

  it("ignores prose that merely contains pipes", () => {
    expect(lintMarkdown("use a | b to pipe\n")).toEqual([]);
  });
});

describe("headings", () => {
  it("reports a missing space after the marker", () => {
    const problems = lintMarkdown("#My Heading\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warning");
  });

  it("reports any multi-hash marker with no space", () => {
    expect(lintMarkdown("##Sub\n")).toHaveLength(1);
  });

  it("leaves a single-word #tag alone", () => {
    expect(lintMarkdown("#project\n")).toEqual([]);
    expect(lintMarkdown("#area/sub\n")).toEqual([]);
  });

  it("accepts a real heading", () => {
    expect(lintMarkdown("### Real heading\n")).toEqual([]);
  });
});

describe("frontmatter", () => {
  it("accepts a well-formed block", () => {
    expect(lintMarkdown("---\ntitle: Notes\ntags:\n  - a\n  - b\n---\n\nbody\n")).toEqual([]);
  });

  it("reports a block that never closes", () => {
    const problems = lintMarkdown("---\ntitle: Notes\n\nbody\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(1);
    expect(problems[0].severity).toBe("error");
  });

  it("reports a block that does not start on line 1", () => {
    const problems = lintMarkdown("\n---\ntitle: Notes\n---\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(2);
    expect(problems[0].severity).toBe("warning");
  });

  it("reports tab indentation", () => {
    const problems = lintMarkdown("---\ntags:\n\t- a\n---\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(3);
    expect(problems[0].severity).toBe("error");
  });

  it("reports a top-level line that is not a key: value pair", () => {
    const problems = lintMarkdown("---\ntitle Notes\n---\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(2);
    expect(problems[0].severity).toBe("warning");
  });

  it("requires the space after the colon, as YAML does", () => {
    expect(lintMarkdown("---\ntitle:Notes\n---\n")).toHaveLength(1);
  });

  it("allows comments and a colon inside a value", () => {
    expect(lintMarkdown("---\n# a comment\ntitle: Notes: part two\n---\n")).toEqual([]);
  });

  it("does not lint the frontmatter block as body", () => {
    expect(lintMarkdown("---\ntitle: A | B\n---\n")).toEqual([]);
  });
});

describe("callouts", () => {
  it("reports an unknown type", () => {
    const problems = lintMarkdown("> [!nte] Oops\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("info");
    expect(problems[0].message).toContain("nte");
  });

  it("accepts known types regardless of case", () => {
    expect(lintMarkdown("> [!WARNING] Careful\n")).toEqual([]);
    expect(lintMarkdown("> [!tip]\n> body\n")).toEqual([]);
  });
});

describe("math", () => {
  it("reports an unclosed $$ block", () => {
    const problems = lintMarkdown("$$\nx = 1\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(1);
    expect(problems[0].severity).toBe("error");
  });

  it("accepts a closed $$ block", () => {
    expect(lintMarkdown("$$\nx = 1\n$$\n")).toEqual([]);
    expect(lintMarkdown("$$x = 1$$\n")).toEqual([]);
  });

  it("reports an unbalanced inline delimiter", () => {
    const problems = lintMarkdown("the value $x + y is large\n");
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warning");
  });

  it("accepts balanced inline math", () => {
    expect(lintMarkdown("the value $x + y$ is large\n")).toEqual([]);
  });

  it("leaves prices alone", () => {
    expect(lintMarkdown("it costs $5 today\n")).toEqual([]);
    expect(lintMarkdown("$5 or $10\n")).toEqual([]);
  });

  it("ignores a lone $ inside a $$ block", () => {
    expect(lintMarkdown("$$\na $ b\n$$\n")).toEqual([]);
  });
});

describe("wiki links", () => {
  it("reports an unresolved target once, at its first line", () => {
    const problems = lintMarkdown("see [[Roadmap]]\nand [[Roadmap]] again\n", noNotes);
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(1);
    expect(problems[0].severity).toBe("info");
  });

  it("resolves through the heading and alias forms", () => {
    expect(lintMarkdown("[[Roadmap#Q3|later]]\n", (target) => target === "Roadmap")).toEqual([]);
  });

  it("skips image and diagram embeds", () => {
    expect(lintMarkdown("![[shot.png]] and ![[flow.diagram]]\n", noNotes)).toEqual([]);
  });

  it("skips links inside inline code", () => {
    expect(lintMarkdown("write `[[Roadmap]]` to link\n", noNotes)).toEqual([]);
  });

  it("skips the link checks entirely without a resolver", () => {
    expect(lintMarkdown("see [[Roadmap]]\n")).toEqual([]);
  });
});

describe("lintMarkdown", () => {
  it("returns nothing for a clean note", () => {
    const note = [
      "---",
      "title: Clean",
      "tags: [a, b]",
      "---",
      "",
      "# Heading",
      "",
      "> [!note] Fine",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "Inline $x^2$ and a link to [[Other]].",
      "",
    ].join("\n");
    expect(lintMarkdown(note, (target) => target === "Other")).toEqual([]);
  });

  it("returns nothing for an empty note", () => {
    expect(lintMarkdown("")).toEqual([]);
  });

  it("orders problems by line", () => {
    const problems = lintMarkdown("| a | b |\n\n##Bad\n\n```\nunclosed\n");
    expect(problems.map((problem) => problem.line)).toEqual([1, 3, 5]);
  });
});
