import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaintBucketTool } from "@/core/tools/PaintBucketTool";
import { createMockToolContext } from "../../mocks";

describe("PaintBucketTool", () => {
  let context: any;

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
    const mockCtx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(100 * 100 * 4).fill(0), // All black
        width: 100,
        height: 100,
      })),
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
});
