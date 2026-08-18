import { describe, expect, it, vi } from "vitest";
import { TextLayer } from "@/core/layers/TextLayer";
import { Layer } from "@/renderer/store/projectStore";

describe("TextLayer", () => {
  it("clips overflow at the layer bounds after rendering the complete cached content", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const clipSpy = vi.spyOn(ctx, "clip");
    const layer: Layer = {
      id: "text-layer",
      name: "Text",
      type: "text",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 10,
      y: 20,
      width: 240,
      height: 32,
      blendMode: "source-over",
      text: "First line\nSecond line",
      textType: "point",
      textOverflow: false,
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      lineHeight: 1.2,
    };
    const cache = new Map<string, HTMLCanvasElement>();
    const readyCache = new Map<string, boolean>();

    TextLayer.render(ctx, layer, cache, readyCache);

    const cachedCanvas = cache.get(layer.id);
    expect(cachedCanvas).toBeDefined();
    expect(cachedCanvas!.height).toBeGreaterThan(layer.height);
    expect(clipSpy).toHaveBeenCalled();
  });

  it("keeps the line advance based on the layer font size", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const layer: Layer = {
      id: "text-layer",
      name: "Text",
      type: "text",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: 240,
      height: 100,
      blendMode: "source-over",
      text: "First line\nSecond line",
      textType: "point",
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      lineHeight: 1.2,
    };

    const baseMetrics = TextLayer.calculateMetrics(ctx, layer);
    const selectedMetrics = TextLayer.calculateMetrics(ctx, {
      ...layer,
      textSpans: [{ text: "First line", fontSize: 80 }, { text: "\nSecond line" }],
    });

    expect(selectedMetrics.height).toBe(baseMetrics.height);
  });

  it("returns bounds for a selected word and a multi-line range", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const layer: Layer = {
      id: "text-layer",
      name: "Text",
      type: "text",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 20,
      y: 30,
      width: 240,
      height: 100,
      blendMode: "source-over",
      text: "First line\nSecond line",
      textType: "point",
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      lineHeight: 1.2,
    };

    const wordBounds = TextLayer.getTextRangeBounds(ctx, layer, 0, 5);
    const multiLineBounds = TextLayer.getTextRangeBounds(ctx, layer, 0, layer.text!.length);

    expect(wordBounds.width).toBeGreaterThan(0);
    expect(wordBounds.x).toBeGreaterThanOrEqual(layer.x);
    expect(wordBounds.y).toBe(layer.y);
    expect(multiLineBounds.height).toBeGreaterThan(wordBounds.height);
  });
});
