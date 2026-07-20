import { describe, expect, it } from "vitest";
import {
  continueListOnEnter,
  indent,
  insertCodeBlock,
  outdent,
  replaceRange,
  setHeading,
  toggleBulletList,
  toggleNumberedList,
  toggleQuote,
  wrapInline,
  type TextState,
} from "@/modules/notes/editor/textActions";

/** Builds a TextState from a string with `[` `]` marking the selection (both = caret). */
const state = (marked: string): TextState => {
  const start = marked.indexOf("[");
  const end = marked.indexOf("]", start) - 1;
  return { value: marked.replace("[", "").replace("]", ""), selectionStart: start, selectionEnd: end };
};

const caret = (marked: string): TextState => {
  const at = marked.indexOf("|");
  return { value: marked.replace("|", ""), selectionStart: at, selectionEnd: at };
};

describe("setHeading", () => {
  it("adds the marker to the current line", () => {
    const result = setHeading(caret("Title|"), 2);
    expect(result.value).toBe("## Title");
    expect(result.selectionStart).toBe("## Title".length);
  });

  it("replaces a different heading level", () => {
    expect(setHeading(caret("# Tit|le"), 3).value).toBe("### Title");
  });

  it("toggles off when already at that level", () => {
    expect(setHeading(caret("## Tit|le"), 2).value).toBe("Title");
  });

  it("applies to every selected line, skipping blanks", () => {
    expect(setHeading(state("[a\n\nb]"), 1).value).toBe("# a\n\n# b");
  });
});

describe("toggleBulletList", () => {
  it("prefixes selected lines", () => {
    expect(toggleBulletList(state("[one\ntwo]")).value).toBe("- one\n- two");
  });

  it("removes bullets when every line is already bulleted", () => {
    expect(toggleBulletList(state("[- one\n- two]")).value).toBe("one\ntwo");
  });

  it("keeps the indent when toggling off a nested item", () => {
    expect(toggleBulletList(caret("  - su|b")).value).toBe("  sub");
  });

  it("converts an ordered list to bullets", () => {
    expect(toggleBulletList(state("[1. one\n2. two]")).value).toBe("- one\n- two");
  });
});

describe("toggleNumberedList", () => {
  it("numbers selected lines from 1, skipping blanks", () => {
    expect(toggleNumberedList(state("[a\n\nb]")).value).toBe("1. a\n\n2. b");
  });

  it("removes numbering when every line is already ordered", () => {
    expect(toggleNumberedList(state("[1. a\n2. b]")).value).toBe("a\nb");
  });

  it("converts bullets to numbers", () => {
    expect(toggleNumberedList(state("[- a\n- b]")).value).toBe("1. a\n2. b");
  });
});

describe("indent / outdent", () => {
  it("indents every selected line two spaces", () => {
    expect(indent(state("[- a\n- b]")).value).toBe("  - a\n  - b");
  });

  it("outdent removes one level and stops at column zero", () => {
    expect(outdent(state("[  - a\n- b]")).value).toBe("- a\n- b");
  });

  it("round-trips", () => {
    const original = "- a\n- b";
    expect(outdent(indent(state(`[${original}]`))).value).toBe(original);
  });

  it("keeps the caret inside the line after indenting", () => {
    const result = indent(caret("- a|"));
    expect(result.value).toBe("  - a");
    expect(result.selectionStart).toBe("  - a".length);
  });
});

describe("toggleQuote", () => {
  it("quotes and unquotes", () => {
    const quoted = toggleQuote(state("[a\nb]"));
    expect(quoted.value).toBe("> a\n> b");
    expect(toggleQuote({ ...quoted, selectionStart: 0, selectionEnd: quoted.value.length }).value).toBe("a\nb");
  });
});

describe("insertCodeBlock", () => {
  it("wraps the selection in a fence on its own lines", () => {
    const result = insertCodeBlock(state("before\n[code]\nafter"));
    expect(result.value).toBe("before\n```\ncode\n```\nafter");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("code");
  });

  it("inserts an empty fence with the caret inside", () => {
    const result = insertCodeBlock(caret("|"));
    expect(result.value).toBe("```\n\n```");
    expect(result.selectionStart).toBe("```\n".length);
  });

  it("breaks the line when inserted mid-line", () => {
    expect(insertCodeBlock(caret("text|")).value).toBe("text\n```\n\n```");
  });
});

describe("wrapInline", () => {
  it("wraps a selection in bold markers", () => {
    const result = wrapInline(state("make [this] bold"), "**");
    expect(result.value).toBe("make **this** bold");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("this");
  });

  it("unwraps when the selection includes the markers", () => {
    expect(wrapInline(state("make [**this**] bold"), "**").value).toBe("make this bold");
  });

  it("unwraps when the markers sit just outside the selection", () => {
    expect(wrapInline(state("make **[this]** bold"), "**").value).toBe("make this bold");
  });

  it("inserts a marker pair around an empty caret", () => {
    const result = wrapInline(caret("say |"), "*");
    expect(result.value).toBe("say **");
    expect(result.selectionStart).toBe("say *".length);
  });
});

describe("continueListOnEnter", () => {
  it("returns null outside a list", () => {
    expect(continueListOnEnter(caret("plain text|"))).toBeNull();
  });

  it("continues a bullet at the same indent", () => {
    const result = continueListOnEnter(caret("  - item|"));
    expect(result?.value).toBe("  - item\n  - ");
    expect(result?.selectionStart).toBe(result?.value.length);
  });

  it("continues an ordered list with the next number", () => {
    expect(continueListOnEnter(caret("2. two|"))?.value).toBe("2. two\n3. ");
  });

  it("outdents an empty nested item", () => {
    expect(continueListOnEnter(caret("  - |"))?.value).toBe("- ");
  });

  it("exits the list on an empty top-level item", () => {
    const result = continueListOnEnter(caret("- one\n- |"));
    expect(result?.value).toBe("- one\n");
    expect(result?.selectionStart).toBe("- one\n".length);
  });

  it("returns null when a range is selected", () => {
    expect(continueListOnEnter(state("- [one]"))).toBeNull();
  });
});

describe("replaceRange", () => {
  it("replaces the slash range and honors the ‸ caret marker", () => {
    const result = replaceRange(caret("/he|"), 0, 3, "## ‸");
    expect(result.value).toBe("## ");
    expect(result.selectionStart).toBe(3);
  });

  it("places the caret at the end without a marker", () => {
    const result = replaceRange(caret("x /q|"), 2, 4, "> ");
    expect(result.value).toBe("x > ");
    expect(result.selectionStart).toBe(4);
  });

  it("pipes in the snippet are content, not caret markers (table)", () => {
    const result = replaceRange(caret("/ta|"), 0, 3, "| A |\n| --- |\n| ‸ |\n");
    expect(result.value).toBe("| A |\n| --- |\n|  |\n");
    expect(result.selectionStart).toBe("| A |\n| --- |\n| ".length);
  });
});
