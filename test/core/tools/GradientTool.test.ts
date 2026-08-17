import { beforeEach, describe, expect, it, vi } from "vitest";
import { GradientTool } from "@/core/tools/GradientTool";
import { GradientFillLayer } from "@/core/layers/GradientFillLayer";
import { useToolStore } from "@/renderer/store/toolStore";
import { useUIStore } from "@/renderer/store/uiStore";
import { createMockToolContext } from "../../mocks";

describe("GradientTool", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.foregroundColor = "#ff0000";
    context.backgroundColor = "#0000ff";
    useToolStore.setState({
      toolSettings: {
        ...useToolStore.getState().toolSettings,
        gradient: { presetId: "foreground-background" },
      },
    });
  });

  it("converts an empty raster into a gradient fill layer after a drag", async () => {
    const tool = new GradientTool();

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 20 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, offsetX: 90, offsetY: 80 } as MouseEvent, context);
    tool.onRender(context.ctx, context);
    expect(context.updateProject).not.toHaveBeenCalled();
    tool.onMouseUp({ button: 0, offsetX: 90, offsetY: 80 } as MouseEvent, context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updates = context.updateProject.mock.calls[0][0];
    expect(updates.layers[0]).toMatchObject({
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 10, y: 20 },
        end: { x: 90, y: 80 },
      },
    });
    expect(context.addHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Gradient Tool" }),
    );
  });

  it("uses the full project bounds while creating a gradient on a group", () => {
    const renderSpy = vi.spyOn(GradientFillLayer, "render").mockImplementation(() => undefined);
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "group",
      width: 0,
      height: 0,
    };

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 20 } as MouseEvent, context);
    tool.onMouseMove({ offsetX: 100, offsetY: 200 } as MouseEvent, context);
    tool.onRender(context.ctx, context);

    expect(renderSpy).toHaveBeenCalledWith(
      context.ctx,
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        gradientFill: expect.objectContaining({
          start: { x: 10, y: 20 },
          end: { x: 100, y: 200 },
        }),
      }),
    );
    renderSpy.mockRestore();
  });

  it("moves an existing gradient endpoint", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      },
    };
    tool.onActivate(context);
    tool.onMouseMove({ offsetX: 100, offsetY: 100 } as MouseEvent, context);
    expect(context.canvas.style.cursor).toBe("move");
    tool.onMouseDown({ button: 0, offsetX: 100, offsetY: 100 } as MouseEvent, context);
    expect(context.canvas.style.cursor).toBe("move");
    tool.onMouseMove({ button: 0, offsetX: 100, offsetY: 0 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 100, offsetY: 0 } as MouseEvent, context);

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.gradientFill.end).toEqual({ x: 100, y: 0 });
  });

  it("moves the entire gradient when dragging inside the layer", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 100, y: 100 },
        end: { x: 300, y: 200 },
      },
    };
    tool.onActivate(context);
    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 300 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, offsetX: 70, offsetY: 320 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 70, offsetY: 320 } as MouseEvent, context);

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.gradientFill.start).toEqual({ x: 120, y: 120 });
    expect(updatedLayer.gradientFill.end).toEqual({ x: 320, y: 220 });
  });

  it("allows editing an invisible gradient fill", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      visible: false,
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      },
    };
    tool.onActivate(context);
    tool.onMouseDown({ button: 0, offsetX: 100, offsetY: 100 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, offsetX: 120, offsetY: 100 } as MouseEvent, context);

    expect(context.updateProject).toHaveBeenCalled();
    expect(context.canvas.style.cursor).toBe("move");
  });

  it("shows a warning when editing a locked layer", () => {
    const showToast = vi.spyOn(useUIStore.getState(), "showToast");
    context.isLayerLocked = vi.fn(() => true);
    const tool = new GradientTool();

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(showToast).toHaveBeenCalledWith("Unlock the layer to edit its gradient.", "warning");
    showToast.mockRestore();
  });

  it("snaps gradient endpoints to project edges", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      },
    };
    tool.onActivate(context);
    tool.onMouseDown({ button: 0, offsetX: 100, offsetY: 0 } as MouseEvent, context);
    tool.onMouseMove({ offsetX: 798, offsetY: 0 } as MouseEvent, context);

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.gradientFill.end.x).toBe(800);
  });

  it("snaps a color stop to five percent increments while Shift is held", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#00ff00", position: 0.5 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      },
    };
    tool.onActivate(context);
    tool.onMouseMove({ offsetX: 50, offsetY: 0 } as MouseEvent, context);
    expect(context.canvas.style.cursor).toBe("grab");
    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 0 } as MouseEvent, context);
    expect(context.canvas.style.cursor).toBe("grabbing");
    tool.onMouseMove({ offsetX: 63, offsetY: 0, shiftKey: true } as MouseEvent, context);

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.gradientFill.colors).toContainEqual({
      color: "#00ff00",
      position: 0.65,
    });
  });

  it("does not redefine an existing gradient when clicking away from its controls", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      },
    };
    tool.onActivate(context);

    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 50 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 50, offsetY: 50 } as MouseEvent, context);

    expect(context.updateProject).not.toHaveBeenCalled();
    expect(context.canvas.style.cursor).toBe("default");
  });

  it("adds a midpoint stop on a single line click and removes it with the context menu", () => {
    const tool = new GradientTool();
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      },
    };
    tool.onActivate(context);

    tool.onMouseDown({ button: 0, offsetX: 50, offsetY: 0 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 50, offsetY: 0 } as MouseEvent, context);
    let updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.gradientFill.colors).toHaveLength(3);
    expect(updatedLayer.gradientFill.colors[1]).toMatchObject({ position: 0.5 });
    context.project.layers[0] = updatedLayer;

    const consumed = tool.onContextMenu({ offsetX: 50, offsetY: 0 } as MouseEvent, context);
    updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(consumed).toBe(true);
    expect(updatedLayer.gradientFill.colors).toHaveLength(2);
  });

  it("updates the active layer overlay when the selected layer changes", () => {
    const tool = new GradientTool();
    const secondLayer = {
      ...context.project.layers[0],
      id: "layer-2",
      type: "gradient_fill" as const,
      gradientFill: {
        type: "linear" as const,
        colors: [
          { color: "#00ff00", position: 0 },
          { color: "#000000", position: 1 },
        ],
        start: { x: 20, y: 20 },
        end: { x: 120, y: 20 },
      },
    };
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      },
    };
    context.project.layers.push(secondLayer);
    tool.onActivate(context);

    context.project.activeLayerId = "layer-2";
    tool.onRender(context.ctx, context);

    expect(tool.getEditingLayerId()).toBe("layer-2");
  });

  it("applies a fixed black and white gradient to an active raster mask", () => {
    const tool = new GradientTool();
    context.project.activeMaskId = "layer-1";
    context.project.layers[0].mask = {
      data: "data:image/png;base64,mask",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      enabled: true,
      linked: true,
    };
    tool.onActivate(context);
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, offsetX: 200, offsetY: 0 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 200, offsetY: 0 } as MouseEvent, context);

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.type).toBe("raster");
    expect(updatedLayer.mask.gradient).toBeUndefined();
  });

  it("prioritizes a gradient fill mask over the layer gradient controls", () => {
    const tool = new GradientTool();
    context.project.activeMaskId = "layer-1";
    context.project.layers[0] = {
      ...context.project.layers[0],
      type: "gradient_fill",
      gradientFill: {
        type: "linear",
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
        start: { x: 0, y: 0 },
        end: { x: 800, y: 600 },
      },
      mask: {
        data: "data:image/png;base64,mask",
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        enabled: true,
        linked: true,
      },
    };

    tool.onActivate(context);
    expect(tool.getEditingLayerId()).toBeNull();
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, offsetX: 200, offsetY: 0 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 200, offsetY: 0 } as MouseEvent, context);

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.type).toBe("gradient_fill");
    expect(updatedLayer.mask.data).not.toBe("data:image/png;base64,mask");
    expect(updatedLayer.mask.gradient).toBeUndefined();
    expect(tool.getEditingLayerId()).toBeNull();
  });

  it("creates an editable gradient fill masked to an active selection", async () => {
    const selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = 100;
    selectionCanvas.height = 100;
    const selectionContext = selectionCanvas.getContext("2d")!;
    selectionContext.fillStyle = "white";
    selectionContext.fillRect(0, 0, 100, 100);
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 10, y: 20, width: 100, height: 100 },
      mask: "data:image/png;base64,selection",
    };
    context.getSelectionCanvas = vi.fn(() => ({ canvas: selectionCanvas, ctx: selectionContext }));

    const tool = new GradientTool();
    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 20 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, offsetX: 110, offsetY: 20 } as MouseEvent, context);
    tool.onMouseUp({ button: 0, offsetX: 110, offsetY: 20 } as MouseEvent, context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updatedLayer = context.updateProject.mock.calls.at(-1)?.[0].layers[0];
    expect(updatedLayer.type).toBe("gradient_fill");
    expect(updatedLayer.gradientFill).toMatchObject({
      start: { x: 10, y: 20 },
      end: { x: 110, y: 20 },
    });
    expect(updatedLayer.mask).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      enabled: true,
      linked: true,
    });
  });
});
