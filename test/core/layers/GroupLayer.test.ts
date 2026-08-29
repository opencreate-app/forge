import { describe, it, expect, vi } from "vitest";
import { GroupLayer } from "@/core/layers/GroupLayer";
import { Layer } from "@/renderer/store/projectStore";

describe("GroupLayer", () => {
  it("should render children recursively and use an offscreen buffer", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const projectWidth = 100;
    const projectHeight = 100;

    const group: Layer = {
      id: "g1",
      name: "Group",
      type: "group",
      visible: true,
      locked: false,
      opacity: 50,
      fill: 100,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      blendMode: "source-over",
    };

    const child: Layer = {
      id: "l1",
      parentId: "g1",
      name: "Child",
      type: "raster",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      blendMode: "source-over",
    };

    const allLayers = [group, child];
    const renderLayer = vi.fn();

    // Mock drawImage to verify buffer rendering
    const drawImageSpy = vi.spyOn(ctx, "drawImage");

    GroupLayer.render(ctx, group, allLayers, renderLayer, projectWidth, projectHeight);

    // Should have called renderLayer for the child
    expect(renderLayer).toHaveBeenCalledWith(expect.anything(), child);

    // Should have drawn the offscreen buffer back to the main context
    expect(drawImageSpy).toHaveBeenCalled();

    // Verify the buffer dimensions (first call to drawImage)
    const [buffer] = drawImageSpy.mock.calls[0] as unknown as [HTMLCanvasElement];
    expect(buffer.width).toBe(projectWidth);
    expect(buffer.height).toBe(projectHeight);
  });

  it("should skip invisible children", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const group: Layer = {
      id: "g1",
      type: "group",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      name: "G",
      blendMode: "source-over",
    };
    const child: Layer = {
      id: "l1",
      parentId: "g1",
      visible: false,
      type: "raster",
      locked: false,
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      name: "C",
      blendMode: "source-over",
    };

    const renderLayer = vi.fn();
    GroupLayer.render(ctx, group, [group, child], renderLayer, 100, 100);

    expect(renderLayer).not.toHaveBeenCalled();
  });

  it("should apply one transform to the complete child composition", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const group: Layer = {
      id: "g1",
      type: "group",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      name: "G",
      blendMode: "source-over",
    };
    const child: Layer = {
      ...group,
      id: "l1",
      parentId: group.id,
      type: "raster",
      x: 10,
      y: 20,
      width: 20,
      height: 20,
    };
    const renderLayer = vi.fn();
    const translateSpy = vi.spyOn(CanvasRenderingContext2D.prototype, "translate");
    const scaleSpy = vi.spyOn(CanvasRenderingContext2D.prototype, "scale");

    GroupLayer.render(ctx, group, [group, child], renderLayer, 100, 100, {
      x: 50,
      y: 60,
      width: 40,
      height: 40,
      scaleX: 2,
      scaleY: 2,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
      baseX: 0,
      baseY: 0,
      originX: 0,
      originY: 0,
    });

    expect(translateSpy).toHaveBeenCalledWith(50, 60);
    expect(scaleSpy).toHaveBeenCalledWith(2, 2);
    expect(renderLayer).toHaveBeenCalledWith(expect.anything(), child);

    translateSpy.mockRestore();
    scaleSpy.mockRestore();
  });
});
