import { describe, expect, it } from "vitest";
import {
  applyTextSpanStyle,
  getTextLineIndex,
  getTextWordRangeAt,
  isBoldTextFontWeight,
  normalizeTextSpans,
  normalizeTextFontWeight,
  promoteTextStyleToLayer,
  replaceTextWithSpans,
  scaleTextSpanFontSizes,
  updateTextLineAlignments,
  updateTextLineHeights,
} from "@/core/utils/textSpans";

describe("text span helpers", () => {
  it("normalizes named font weights for layer and select values", () => {
    expect(normalizeTextFontWeight("bold")).toBe("700");
    expect(normalizeTextFontWeight("normal")).toBe("400");
    expect(normalizeTextFontWeight(600)).toBe("600");
  });

  it.each([
    ["normal", false],
    ["400", false],
    ["499", false],
    ["500", true],
    [500, true],
    ["bold", true],
    ["900", true],
  ])("identifies bold weights at or above 500: %s", (weight, expected) => {
    expect(isBoldTextFontWeight(weight)).toBe(expected);
  });

  it("promotes a style across the whole text while preserving unrelated span styles", () => {
    expect(
      promoteTextStyleToLayer(
        "abcd",
        [
          { text: "ab", color: "red" },
          { text: "cd", italic: true },
        ],
        { fontSize: 32, fontWeight: "bold" },
      ),
    ).toEqual({
      layerStyle: { fontSize: 32, fontWeight: "700" },
      textSpans: [
        { text: "ab", color: "red" },
        { text: "cd", italic: true },
      ],
    });
  });

  it("removes text spans when a global style is the only formatting", () => {
    expect(promoteTextStyleToLayer("abcd", undefined, { fontWeight: "bold" })).toEqual({
      layerStyle: { fontWeight: "700" },
      textSpans: undefined,
    });
  });

  it("normalizes adjacent spans with equal styles and clips stale content", () => {
    expect(
      normalizeTextSpans("abcd", [
        { text: "ab", italic: true },
        { text: "c", italic: true },
        { text: "d", underline: true },
        { text: "stale", color: "red" },
      ]),
    ).toEqual([
      { text: "abc", italic: true },
      { text: "d", underline: true },
    ]);
  });

  it("applies a style across a mixed selection", () => {
    expect(
      applyTextSpanStyle("abcd", [{ text: "ab", italic: true }, { text: "cd" }], 1, 3, {
        underline: true,
      }),
    ).toEqual([
      { text: "a", italic: true },
      { text: "b", italic: true, underline: true },
      { text: "c", underline: true },
      { text: "d" },
    ]);
  });

  it("treats missing spans as the layer's default style", () => {
    expect(applyTextSpanStyle("abcd", undefined, 1, 3, { underline: true })).toEqual([
      { text: "a" },
      { text: "bc", underline: true },
      { text: "d" },
    ]);
    expect(replaceTextWithSpans("abcd", undefined, "aXbcd", 1, 1, { italic: true })).toEqual([
      { text: "a" },
      { text: "X", italic: true },
      { text: "bcd" },
    ]);
  });

  it("preserves surrounding styles when inserting and deleting", () => {
    const spans = [
      { text: "ab", italic: true },
      { text: "cd", underline: true },
    ];
    expect(replaceTextWithSpans("abcd", spans, "aXbcd", 1, 1, { color: "red" })).toEqual([
      { text: "a", italic: true },
      { text: "X", color: "red" },
      { text: "b", italic: true },
      { text: "cd", underline: true },
    ]);
    expect(replaceTextWithSpans("abcd", spans, "ad", 1, 3)).toEqual([
      { text: "a", italic: true },
      { text: "d", underline: true },
    ]);
  });

  it("scales only explicit font sizes in a selected range", () => {
    expect(
      scaleTextSpanFontSizes(
        "abcd",
        [
          { text: "ab", fontSize: 10 },
          { text: "cd", fontSize: 20 },
        ],
        1,
        3,
        1.5,
      ),
    ).toEqual([
      { text: "a", fontSize: 10 },
      { text: "b", fontSize: 15 },
      { text: "c", fontSize: 30 },
      { text: "d", fontSize: 20 },
    ]);
  });

  it("materializes the layer font size only inside a selected range", () => {
    expect(scaleTextSpanFontSizes("abcd", undefined, 1, 3, 2, 10)).toEqual([
      { text: "a" },
      { text: "bc", fontSize: 20 },
      { text: "d" },
    ]);
  });

  it("preserves proportional span sizes when the global size changes", () => {
    expect(
      scaleTextSpanFontSizes("abcd", [{ text: "ab", fontSize: 10 }, { text: "cd" }], 0, 4, 2, 10),
    ).toEqual([{ text: "abcd", fontSize: 20 }]);
  });

  it("tracks logical line alignment through text edits", () => {
    expect(getTextLineIndex("one\ntwo\nthree", 5)).toBe(1);
    expect(
      updateTextLineAlignments(
        "one\ntwo\nthree",
        "one\ntwo\nnew\nthree",
        { 1: "center", 2: "right" },
        7,
        7,
      ),
    ).toEqual({ 1: "center", 3: "right" });
    expect(
      updateTextLineHeights("one\ntwo\nthree", "one\ntwo\nnew\nthree", { 1: 1.4, 2: 1.8 }, 7, 7),
    ).toEqual({ 1: 1.4, 3: 1.8 });
  });

  it("finds the word around a caret without including surrounding whitespace", () => {
    expect(getTextWordRangeAt("The quick brown fox", 5)).toEqual({ start: 4, end: 9 });
    expect(getTextWordRangeAt("The quick brown fox", 9)).toEqual({ start: 4, end: 9 });
    expect(getTextWordRangeAt("The  quick brown fox", 4)).toBeUndefined();
    expect(getTextWordRangeAt("ação teste", 2)).toEqual({ start: 0, end: 4 });
  });
});
