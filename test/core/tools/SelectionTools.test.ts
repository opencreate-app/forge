import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectTool } from "@/core/tools/SelectTool";
import { useProjectStore } from "@/renderer/store/projectStore";
import { createMockToolContext } from "../../mocks";

describe("Selection and Transform Tools", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
  });

  describe("SelectTool", () => {
    it("should create a rectangle selection", () => {
      const tool = new SelectTool();
      tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 50 } as MouseEvent, context);
      context.screenToProject = vi.fn(() => ({ x: 150, y: 150 }));
      tool.onMouseMove({ offsetX: 150, offsetY: 150 } as MouseEvent, context);
      tool.onMouseUp({ offsetX: 150, offsetY: 150 } as MouseEvent, context);

      expect(context.updateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: expect.objectContaining({
            hasSelection: true,
            bounds: { x: 50, y: 50, width: 100, height: 100 },
          }),
        }),
      );
    });

    it.each(["Delete", "Backspace"])(
      "deletes the selection instead of the layer when pressing %s",
      (key) => {
        const tool = new SelectTool();
        const deleteSelectionContents = vi.fn().mockResolvedValue(true);
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        context.deleteSelectionContents = deleteSelectionContents;
        context.project.selection = {
          hasSelection: true,
          bounds: { x: 10, y: 10, width: 20, height: 20 },
          mask: "data:image/png;base64,selection",
        };

        const handled = tool.onKeyDown(
          { key, preventDefault, stopPropagation } as unknown as KeyboardEvent,
          context,
        );

        expect(handled).toBe(true);
        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
        expect(deleteSelectionContents).toHaveBeenCalledOnce();
      },
    );

    it("removes selected layers with Delete when there is no selection", () => {
      const tool = new SelectTool();
      const removeLayers = vi.fn();
      const originalRemoveLayers = useProjectStore.getState().removeLayers;
      useProjectStore.setState({ removeLayers } as never);
      context.project.selectedLayerIds = ["layer-1"];

      try {
        const handled = tool.onKeyDown(
          {
            key: "Delete",
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          } as unknown as KeyboardEvent,
          context,
        );

        expect(handled).toBe(true);
        expect(removeLayers).toHaveBeenCalledWith("test-project", ["layer-1"]);
      } finally {
        useProjectStore.setState({ removeLayers: originalRemoveLayers } as never);
      }
    });

    it.each([
      ["ArrowLeft", -1, 0],
      ["ArrowRight", 1, 0],
      ["ArrowUp", 0, -1],
      ["ArrowDown", 0, 1],
    ])("moves the selection one pixel with %s", (key, dx, dy) => {
      const tool = new SelectTool();
      const selectionCanvas = document.createElement("canvas");
      selectionCanvas.width = 20;
      selectionCanvas.height = 20;
      context.project.selection = {
        hasSelection: true,
        bounds: { x: 10, y: 15, width: 20, height: 25 },
        mask: "data:image/png;base64,selection",
      };
      context.getSelectionCanvas = vi.fn(() => ({
        canvas: selectionCanvas,
        ctx: selectionCanvas.getContext("2d")!,
      }));

      const handled = tool.onKeyDown(
        { key, shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent,
        context,
      );

      expect(handled).toBe(true);
      expect(context.updateProject).toHaveBeenCalledWith({
        selection: expect.objectContaining({
          bounds: { x: 10 + dx, y: 15 + dy, width: 20, height: 25 },
        }),
        isDirty: true,
      });
      expect(context.addHistoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Move Selection" }),
      );
      expect(context.updateSelectionEdges).toHaveBeenCalledOnce();
    });

    it("moves the selection ten pixels with Shift and an arrow", () => {
      const tool = new SelectTool();
      context.project.selection = {
        hasSelection: true,
        bounds: { x: 10, y: 15, width: 20, height: 25 },
        mask: "data:image/png;base64,selection",
      };

      const handled = tool.onKeyDown(
        { key: "ArrowRight", shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent,
        context,
      );

      expect(handled).toBe(true);
      expect(context.updateProject).toHaveBeenCalledWith({
        selection: expect.objectContaining({
          bounds: { x: 20, y: 15, width: 20, height: 25 },
        }),
        isDirty: true,
      });
    });

    it("auto-scrolls continuously while the pointer is near a viewport edge", () => {
      const tool = new SelectTool();
      context.viewportWidth = 100;
      context.viewportHeight = 100;
      context.screenToProject = vi.fn((x: number, y: number) => ({
        x: x - context.project.panX,
        y: y - context.project.panY,
      }));
      context.updateViewport = vi.fn((_zoom: number, panX: number, panY: number) => {
        context.project.panX = panX;
        context.project.panY = panY;
      });

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 50 } as MouseEvent, context);
      tool.onMouseMove({ offsetX: 99, offsetY: 50, shiftKey: false } as MouseEvent, context);

      tool.onRender(context.ctx, context);
      tool.onRender(context.ctx, context);

      expect(context.updateViewport).toHaveBeenCalledTimes(2);
      expect(context.updateViewport.mock.calls[0][1]).toBeCloseTo(-19.583, 2);
      expect(context.updateViewport.mock.calls[1][1]).toBeLessThan(
        context.updateViewport.mock.calls[0][1],
      );
    });

    it("stops auto-scrolling after the selection ends", () => {
      const tool = new SelectTool();
      context.viewportWidth = 100;
      context.updateViewport = vi.fn();

      tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
      tool.onMouseMove({ offsetX: 99, offsetY: 99, shiftKey: false } as MouseEvent, context);
      tool.onMouseUp({ offsetX: 99, offsetY: 99 } as MouseEvent, context);
      tool.onRender(context.ctx, context);

      expect(context.updateViewport).not.toHaveBeenCalled();
    });
  });
});
