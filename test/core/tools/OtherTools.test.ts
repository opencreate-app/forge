import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TextTool } from "@/core/tools/TextTool";
import { CropTool } from "@/core/tools/CropTool";
import { useTextEditorStore } from "@/renderer/store/textEditorStore";
import { createMockToolContext } from "../../mocks";

describe("Other Tools", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.layers = [];
  });

  afterEach(() => {
    useTextEditorStore.getState().reset();
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

    it.each([
      ["b", false, { fontWeight: "700" }],
      ["i", false, { italic: true }],
      ["u", false, { underline: true }],
      ["u", true, { strikethrough: true }],
    ])("formats the selected text with Ctrl+%s%s", (key, shiftKey, style) => {
      context.project.layers = [
        {
          id: "text-layer",
          type: "text",
          text: "Editable",
          width: 120,
          height: 30,
          fontSize: 24,
          fontWeight: "400",
        } as any,
      ];
      const tool = new TextTool();
      (tool as any).isEditing = true;
      (tool as any).editingLayerId = "text-layer";
      (tool as any).caretIndex = 8;
      (tool as any).selectionStart = 0;
      useTextEditorStore.setState({ style: { fontWeight: "400" }, mixedStyles: {} });
      const applyFormat = vi.spyOn(tool as any, "applyFormat");
      const event = {
        key,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey,
        target: null,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent;

      expect(tool.onKeyDown(event, context)).toBe(true);
      expect(applyFormat).toHaveBeenCalledWith(
        { type: "setStyle", style, scope: "formatRange" },
        context,
      );
    });

    it("supports Meta shortcuts and does not consume formatting shortcuts without a selection", () => {
      context.project.layers = [
        {
          id: "text-layer",
          type: "text",
          text: "Editable",
          width: 120,
          height: 30,
          fontSize: 24,
          fontWeight: "700",
        } as any,
      ];
      const tool = new TextTool();
      (tool as any).isEditing = true;
      (tool as any).editingLayerId = "text-layer";
      (tool as any).caretIndex = 8;
      (tool as any).selectionStart = 0;
      useTextEditorStore.setState({ style: { fontWeight: "700" }, mixedStyles: {} });
      const applyFormat = vi.spyOn(tool as any, "applyFormat");
      const metaEvent = {
        key: "b",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent;

      expect(tool.onKeyDown(metaEvent, context)).toBe(true);
      expect(applyFormat).toHaveBeenCalledWith(
        { type: "setStyle", style: { fontWeight: "400" }, scope: "formatRange" },
        context,
      );

      (tool as any).caretIndex = 0;
      (tool as any).selectionStart = 0;
      const noSelectionEvent = { ...metaEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() };

      expect(tool.onKeyDown(noSelectionEvent as KeyboardEvent, context)).toBe(false);
      expect(applyFormat).toHaveBeenCalledTimes(1);
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
