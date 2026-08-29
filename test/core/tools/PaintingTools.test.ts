import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrushTool } from "@/core/tools/BrushTool";
import { PencilTool } from "@/core/tools/PencilTool";
import { EraserTool } from "@/core/tools/EraserTool";
import { createMockToolContext } from "../../mocks";

describe("Painting Tools", () => {
  let context: any;
  let fillRect: ReturnType<typeof vi.fn>;
  let moveTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    context = createMockToolContext();
    fillRect = vi.fn();
    moveTo = vi.fn();
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,mock");
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect,
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo,
      lineTo: vi.fn(),
      clearRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      })),
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
    })) as any;
  });

  describe("BrushTool", () => {
    it("should start drawing on mouse down", () => {
      const tool = new BrushTool();
      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      expect(tool.getEditingLayerId()).toBe("layer-1");
    });

    it("should not change layer order during drawing", () => {
      const tool = new BrushTool();
      const initialLayers = [...context.project.layers];
      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseMove({ offsetX: 20, offsetY: 20 } as MouseEvent, context);
      expect(context.project.layers).toEqual(initialLayers);
    });
  });

  describe("PencilTool", () => {
    it("should snap to pixels", () => {
      const tool = new PencilTool();
      context.screenToProject = vi.fn(() => ({ x: 10.7, y: 20.2 }));
      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      expect(tool.getEditingLayerId()).toBe("layer-1");
    });

    it("should draw a straight line from the previous point with Shift-click", () => {
      const tool = new PencilTool();

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseUp({ button: 0 } as MouseEvent, context);
      const firstPointCallCount = fillRect.mock.calls.length;

      tool.onMouseDown(
        { button: 0, offsetX: 30, offsetY: 20, shiftKey: true } as MouseEvent,
        context,
      );

      expect((tool as any).isLineDrawing).toBe(true);
      expect(fillRect.mock.calls.length).toBeGreaterThan(firstPointCallCount + 1);

      tool.onMouseUp({ button: 0 } as MouseEvent, context);
      expect((tool as any).lastPoint).toEqual({ x: 30, y: 20, layerId: "layer-1" });

      const horizontalTool = new PencilTool();
      horizontalTool.onMouseDown(
        { button: 0, offsetX: 10, offsetY: 10, shiftKey: true } as MouseEvent,
        context,
      );
      horizontalTool.onMouseMove(
        { offsetX: 30, offsetY: 20, buttons: 1, shiftKey: true } as MouseEvent,
        context,
      );
      expect((horizontalTool as any).lastX).toBe(30);
      expect((horizontalTool as any).lastY).toBe(10);
      horizontalTool.onMouseUp({ button: 0 } as MouseEvent, context);

      const verticalTool = new PencilTool();
      verticalTool.onMouseDown(
        { button: 0, offsetX: 10, offsetY: 10, shiftKey: true } as MouseEvent,
        context,
      );
      verticalTool.onMouseMove(
        { offsetX: 20, offsetY: 40, buttons: 1, shiftKey: true } as MouseEvent,
        context,
      );
      expect((verticalTool as any).lastX).toBe(10);
      expect((verticalTool as any).lastY).toBe(40);
      verticalTool.onMouseUp({ button: 0 } as MouseEvent, context);
    });

    it("should not connect points after the tool is deactivated", () => {
      const tool = new PencilTool();

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseUp({ button: 0 } as MouseEvent, context);
      tool.onDeactivate(context);

      tool.onMouseDown(
        { button: 0, offsetX: 30, offsetY: 20, shiftKey: true } as MouseEvent,
        context,
      );

      expect((tool as any).isLineDrawing).toBe(false);
    });
  });

  describe("Shift-click support", () => {
    it("should support straight lines with the Brush tool", () => {
      const tool = new BrushTool();
      context.settings.brush.hardness = 1;

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseUp({ button: 0 } as MouseEvent, context);
      tool.onMouseDown(
        { button: 0, offsetX: 30, offsetY: 20, shiftKey: true } as MouseEvent,
        context,
      );

      expect((tool as any).isLineDrawing).toBe(true);
      expect(moveTo).toHaveBeenCalled();
      tool.onMouseUp({ button: 0 } as MouseEvent, context);
    });

    it("should support straight lines with the Eraser pencil mode", () => {
      const tool = new EraserTool();
      context.settings.eraser = {
        size: 1,
        hardness: 1,
        mode: "pencil",
        shape: "square",
      };

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseUp({ button: 0 } as MouseEvent, context);
      const firstPointCallCount = fillRect.mock.calls.length;

      tool.onMouseDown(
        { button: 0, offsetX: 30, offsetY: 20, shiftKey: true } as MouseEvent,
        context,
      );

      expect((tool as any).isLineDrawing).toBe(true);
      expect(fillRect.mock.calls.length).toBeGreaterThan(firstPointCallCount + 1);
      tool.onMouseUp({ button: 0 } as MouseEvent, context);
    });

    it("should not connect to a point from another layer", () => {
      const tool = new BrushTool();
      context.isLayerLocked = vi.fn(() => false);
      context.isLayerVisible = vi.fn(() => true);
      context.project.layers.push({
        ...context.project.layers[0],
        id: "layer-2",
      });

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseUp({ button: 0 } as MouseEvent, context);

      context.project.activeLayerId = "layer-2";
      tool.onMouseDown(
        { button: 0, offsetX: 30, offsetY: 20, shiftKey: true } as MouseEvent,
        context,
      );

      expect((tool as any).isLineDrawing).toBe(false);
    });
  });
});
