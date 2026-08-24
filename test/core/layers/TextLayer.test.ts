import { describe, expect, it, vi } from "vitest";
import { TextLayer } from "@/core/layers/TextLayer";
import { Layer } from "@/renderer/store/projectStore";

describe("TextLayer", () => {
  it("keeps the editing pivot fixed-size under non-uniform text scaling", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const scaleSpy = vi.spyOn(ctx, "scale");
    const getTransformSpy = vi.spyOn(ctx, "getTransform");
    const layer: Layer = {
      id: "scaled-ui-text",
      name: "Text",
      type: "text",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 10,
      y: 20,
      width: 180,
      height: 40,
      blendMode: "source-over",
      text: "Vector",
      textType: "point",
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      scaleX: 2,
      scaleY: 0.5,
    };

    TextLayer.renderUI(
      ctx,
      layer,
      { caretIndex: 0, selectionStart: 0, isFocused: true, isCtrlPressed: false },
      1,
    );

    expect(scaleSpy).toHaveBeenCalledWith(2, 0.5);
    expect(scaleSpy).toHaveBeenCalledWith(0.5, 2);
    expect(getTransformSpy).not.toHaveBeenCalled();
  });

  it("renders transformed text directly instead of scaling a cached bitmap", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const drawImageSpy = vi.spyOn(ctx, "drawImage");
    const fillTextSpy = vi.spyOn(ctx, "fillText");
    const layer: Layer = {
      id: "transformed-text",
      name: "Text",
      type: "text",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 10,
      y: 20,
      width: 180,
      height: 40,
      blendMode: "source-over",
      text: "Vector",
      textType: "point",
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      scaleX: 2,
      scaleY: -1,
      rotation: 27,
    };

    TextLayer.render(ctx, layer, new Map(), new Map());

    expect(fillTextSpy).toHaveBeenCalled();
    expect(drawImageSpy).not.toHaveBeenCalled();
  });

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

  it.each(["left", "center", "right"] as const)(
    "preserves the %s point-text pivot when changing font size",
    (textAlign) => {
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
        x: 100,
        y: 50,
        width: 160,
        height: 32,
        blendMode: "source-over",
        text: "Pivot",
        textType: "point",
        textAlign,
        fontSize: 24,
        fontFamily: "Arial",
        fontWeight: "normal",
        color: "#000000",
        lineHeight: 1.2,
      };

      const oldPivotX =
        textAlign === "center"
          ? layer.x + layer.width / 2
          : textAlign === "right"
            ? layer.x + layer.width
            : layer.x;
      const oldPivotY = layer.y + layer.fontSize!;
      const metrics = TextLayer.calculateMetrics(ctx, layer, { fontSize: 36 });

      const newPivotX =
        textAlign === "center"
          ? metrics.x! + metrics.width / 2
          : textAlign === "right"
            ? metrics.x! + metrics.width
            : metrics.x;
      expect(newPivotX).toBeCloseTo(oldPivotX);
      expect(metrics.y! + 36).toBeCloseTo(oldPivotY);
    },
  );

  it("returns to the original position after increasing and decreasing point-text size", () => {
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
      x: 100,
      y: 50,
      width: 160,
      height: 32,
      blendMode: "source-over",
      text: "Pivot",
      textType: "point",
      textAlign: "center",
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      lineHeight: 1.2,
    };

    const baseMetrics = TextLayer.calculateMetrics(ctx, layer);
    const measuredLayer = { ...layer, width: baseMetrics.width, height: baseMetrics.height };
    const increased = TextLayer.calculateMetrics(ctx, measuredLayer, { fontSize: 36 });
    const restored = TextLayer.calculateMetrics(
      ctx,
      {
        ...measuredLayer,
        x: increased.x,
        y: increased.y,
        width: increased.width,
        height: increased.height,
        fontSize: 36,
      },
      { fontSize: 24 },
    );

    expect(restored.x).toBeCloseTo(measuredLayer.x);
    expect(restored.y).toBeCloseTo(measuredLayer.y);
  });

  it("does not reposition area text when calculating new font metrics", () => {
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
      x: 100,
      y: 50,
      width: 160,
      height: 80,
      blendMode: "source-over",
      text: "Area",
      textType: "area",
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "normal",
      color: "#000000",
      lineHeight: 1.2,
    };

    const metrics = TextLayer.calculateMetrics(ctx, layer, { fontSize: 36 });

    expect(metrics.x).toBeUndefined();
    expect(metrics.y).toBeUndefined();
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
