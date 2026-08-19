import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaintBucketTool } from "@/core/tools/PaintBucketTool";
import { createMockToolContext } from "../../mocks";

describe("PaintBucketTool", () => {
  let context: any;
  let mockImageData: ImageData;

  beforeEach(() => {
    context = createMockToolContext();
    // Setup mock tool settings for paintBucket
    context.settings.paintBucket = {
      tolerance: 40,
      antiAliasing: true,
      contiguous: true,
      fillTarget: "raster",
    };
    context.foregroundColor = "#FF0000";

    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,mock");

    // Mock for canvas context used in performFill
    mockImageData = {
      data: new Uint8ClampedArray(100 * 100 * 4),
      width: 100,
      height: 100,
    } as ImageData;
    for (let index = 3; index < mockImageData.data.length; index += 4) {
      mockImageData.data[index] = 255;
    }

    const mockCtx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn(() => mockImageData),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn((type) => {
      if (type === "2d") return mockCtx;
      return null;
    }) as any;

    context.ensureLayerCanvas = vi.fn(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      return canvas;
    });

    context.isLayerLocked = vi.fn(() => false);
    context.isLayerVisible = vi.fn(() => true);
  });

  it("should initialize with correct ID", () => {
    const tool = new PaintBucketTool();
    expect(tool.id).toBe("paintBucket");
  });

  it("should trigger fill on mouse down", async () => {
    const tool = new PaintBucketTool();
    const mouseEvent = { button: 0, offsetX: 50, offsetY: 50 } as MouseEvent;

    // Mock project state
    context.project.activeLayerId = "layer-1";
    context.project.layers = [
      {
        id: "layer-1",
        type: "raster",
        visible: true,
        locked: false,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: "data:image/png;base64,existing",
      },
    ];
    context.screenToProject = vi.fn(() => ({ x: 50, y: 50 }));

    tool.onMouseDown(mouseEvent, context);

    // Wait for async performFill
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(context.updateProject).toHaveBeenCalled();
    expect(context.addHistoryEntry).toHaveBeenCalled();
  });

  it("should not fill on locked layer", () => {
    const tool = new PaintBucketTool();
    context.project.activeLayerId = "layer-1";
    context.project.layers = [
      {
        id: "layer-1",
        type: "raster",
        visible: true,
        locked: true,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    ];
    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 50 } as MouseEvent, context);
    expect(context.updateProject).not.toHaveBeenCalled();
  });

  it("converts an empty raster layer into a color fill layer", async () => {
    const tool = new PaintBucketTool();
    context.foregroundColor = "#12ab34";
    mockImageData.data.fill(0);
    context.project.activeLayerId = "layer-1";

    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 50 } as MouseEvent, context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updates = context.updateProject.mock.calls[0][0];
    const updatedLayer = updates.layers.find((layer: any) => layer.id === "layer-1");

    expect(updatedLayer).toMatchObject({
      id: "layer-1",
      type: "color_fill",
      colorFill: { color: "#12ab34" },
    });
    expect(updatedLayer.data).toBeUndefined();
    expect(context.addHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Paint Bucket" }),
    );
  });

  it("converts a fully transparent raster with data into a color fill layer", async () => {
    const tool = new PaintBucketTool();
    mockImageData.data.fill(0);
    context.project.activeLayerId = "layer-1";
    context.project.layers[0].data = "data:image/png;base64,transparent";

    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 50 } as MouseEvent, context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updates = context.updateProject.mock.calls[0][0];
    expect(updates.layers[0].type).toBe("color_fill");
  });

  it("limits a raster flood fill to the active selection", async () => {
    const tool = new PaintBucketTool();
    const selectionWidth = 20;
    const selectionHeight = 20;
    const selectionData = new Uint8ClampedArray(selectionWidth * selectionHeight * 4);
    for (let index = 3; index < selectionData.length; index += 4) {
      selectionData[index] = 255;
    }

    context.project.activeLayerId = "layer-1";
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 25, y: 25, width: selectionWidth, height: selectionHeight },
      mask: "data:image/png;base64,selection",
    };
    context.getSelectionCanvas = vi.fn(() => ({
      canvas: { width: selectionWidth, height: selectionHeight } as HTMLCanvasElement,
      ctx: {
        getImageData: vi.fn(() => ({ data: selectionData })),
      } as unknown as CanvasRenderingContext2D,
    }));

    tool.onMouseDown({ button: 0, offsetX: 30, offsetY: 30 } as MouseEvent, context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const selectedPixel = (30 * 100 + 30) * 4;
    const outsidePixel = 0;
    expect(mockImageData.data[selectedPixel]).toBe(255);
    expect(mockImageData.data[selectedPixel + 1]).toBe(0);
    expect(mockImageData.data[outsidePixel]).toBe(0);
    expect(context.updateProject).toHaveBeenCalled();
  });

  it("keeps the selection as a mask when converting an empty raster", async () => {
    const tool = new PaintBucketTool();
    const selectionWidth = 30;
    const selectionHeight = 20;
    const selectionData = new Uint8ClampedArray(selectionWidth * selectionHeight * 4);
    for (let index = 3; index < selectionData.length; index += 4) {
      selectionData[index] = 255;
    }

    mockImageData.data.fill(0);
    context.project.activeLayerId = "layer-1";
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 40, y: 50, width: selectionWidth, height: selectionHeight },
      mask: "data:image/png;base64,selection",
    };
    context.getSelectionCanvas = vi.fn(() => ({
      canvas: { width: selectionWidth, height: selectionHeight } as HTMLCanvasElement,
      ctx: {
        getImageData: vi.fn(() => ({ data: selectionData })),
      } as unknown as CanvasRenderingContext2D,
    }));

    tool.onMouseDown({ button: 0, offsetX: 45, offsetY: 55 } as MouseEvent, context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updates = context.updateProject.mock.calls[0][0];
    expect(updates.layers[0]).toMatchObject({
      type: "color_fill",
      mask: {
        data: "data:image/png;base64,selection",
        x: 40,
        y: 50,
        width: selectionWidth,
        height: selectionHeight,
      },
    });
  });
});
