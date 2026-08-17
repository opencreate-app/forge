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
  });
});
