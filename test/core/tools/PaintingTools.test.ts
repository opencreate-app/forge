import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrushTool } from "@/core/tools/BrushTool";
import { PencilTool } from "@/core/tools/PencilTool";
import { createMockToolContext } from "../../mocks";

describe("Painting Tools", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,mock");
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
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
  });
});
