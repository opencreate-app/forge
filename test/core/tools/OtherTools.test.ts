import { describe, it, expect, vi, beforeEach } from "vitest";
import { TextTool } from "@/core/tools/TextTool";
import { CropTool } from "@/core/tools/CropTool";
import { createMockToolContext } from "../../mocks";

describe("Other Tools", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.layers = [];
  });

  describe("TextTool", () => {
    it("should initialize correctly", () => {
      const tool = new TextTool();
      tool.onActivate(context);
      expect(document.getElementById("forge-text-input")).toBeDefined();
      tool.onDeactivate(context);
    });

    it("starts editing a requested layer when the TextTool is activated", () => {
      const textLayer = {
        id: "text-layer",
        name: "Text",
        type: "text",
        visible: true,
        locked: false,
        opacity: 100,
        fill: 100,
        x: 0,
        y: 0,
        width: 120,
        height: 30,
        blendMode: "source-over",
        text: "Editable",
        textType: "point",
        fontSize: 24,
        fontFamily: "Arial",
        fontWeight: "400",
      } as const;
      context.project.layers = [textLayer as any];
      context.isLayerVisible = vi.fn(() => true);
      context.isLayerLocked = vi.fn(() => false);

      const tool = new TextTool();
      tool.requestEditLayer(textLayer.id);
      tool.onActivate(context);

      expect(tool.getEditingLayerId()).toBe(textLayer.id);
      tool.onDeactivate(context);
    });
  });

  describe("CropTool", () => {
    it("should update tool settings on drag", () => {
      const tool = new CropTool();
      tool.onActivate(context);
      tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);
      context.screenToProject = vi.fn(() => ({ x: 50, y: 50 }));
      tool.onMouseMove({ offsetX: 50, offsetY: 50 } as MouseEvent, context);
      expect(context.updateToolSettings).toHaveBeenCalled();
    });
  });
});
