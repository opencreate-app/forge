import { describe, it, expect, vi } from "vitest";
import { SmartObjectLayer } from "@/core/layers/SmartObjectLayer";
import { Layer } from "@/renderer/store/projectStore";

describe("SmartObjectLayer", () => {
  it("should draw from canvas cache if available and ready", () => {
    const ctx = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const layer = {
      id: "smart1",
      type: "smart_object",
      x: 50,
      y: 60,
      width: 200,
      height: 150,
    } as Layer;

    const mockCanvas = { width: 200, height: 150 } as HTMLCanvasElement;
    const layerCanvasCache = new Map([["smart1", mockCanvas]]);
    const layerReadyCache = new Map([["smart1", true]]);
    const imageCache = new Map();
    const onReady = vi.fn();

    SmartObjectLayer.render(ctx, layer, layerCanvasCache, layerReadyCache, imageCache, onReady);

    expect(ctx.drawImage).toHaveBeenCalledWith(mockCanvas, 50, 60);
  });
});
