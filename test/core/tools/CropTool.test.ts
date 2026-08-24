import { describe, it, expect, vi, beforeEach } from "vitest";
import { CropTool } from "@/core/tools/CropTool";
import { createMockToolContext } from "../../mocks";

describe("CropTool", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.width = 1000;
    context.project.height = 1000;
    context.project.zoom = 1;
    context.project.selection = { hasSelection: false, bounds: null };
  });

  it("should reset to project bounds on activate", () => {
    const tool = new CropTool();
    tool.onActivate(context);
    const state = (tool as any).cropState;
    expect(state.width).toBe(1000);
    expect(state.height).toBe(1000);
  });

  it("should apply a fixed ratio when activated", () => {
    context.settings.crop = {
      mode: "Fixed Ratio",
      ratioW: 16,
      ratioH: 9,
      deleteCropped: true,
      isDirty: false,
    };

    const tool = new CropTool();
    tool.onActivate(context);

    const state = (tool as any).cropState;
    expect(state.width).toBe(1000);
    expect(state.height * state.scaleY).toBe(562.5);
    expect(state.x).toBe(500);
    expect(state.y).toBe(500);
  });

  it("should apply fixed ratio changes while active", () => {
    const tool = new CropTool();
    tool.onActivate(context);

    const onSettingsChange = context.subscribe.mock.calls[0][0];
    const fixedCropSettings = {
      mode: "Fixed Ratio",
      ratioW: 16,
      ratioH: 9,
      deleteCropped: true,
      isDirty: false,
    };
    onSettingsChange({ ...context.settings, crop: fixedCropSettings });

    let state = (tool as any).cropState;
    expect(state.width * state.scaleX).toBe(1000);
    expect(state.height * state.scaleY).toBe(562.5);
    expect(state.x).toBe(500);
    expect(state.y).toBe(500);

    onSettingsChange({
      ...context.settings,
      crop: { ...fixedCropSettings, ratioW: 4, ratioH: 3 },
    });

    state = (tool as any).cropState;
    expect(state.width * state.scaleX).toBe(1000);
    expect(state.height * state.scaleY).toBe(750);
    expect(state.x).toBe(500);
    expect(state.y).toBe(500);
  });

  it("should recalculate ratio changes from project bounds", () => {
    context.settings.crop = {
      mode: "Fixed Ratio",
      ratioW: 16,
      ratioH: 9,
      deleteCropped: true,
      isDirty: false,
    };

    const tool = new CropTool();
    tool.onActivate(context);

    const onSettingsChange = context.subscribe.mock.calls[0][0];
    onSettingsChange({
      ...context.settings,
      crop: { ...context.settings.crop, ratioW: 4, ratioH: 3 },
    });
    onSettingsChange({
      ...context.settings,
      crop: { ...context.settings.crop, ratioW: 16, ratioH: 9 },
    });

    const state = (tool as any).cropState;
    expect(state.width * state.scaleX).toBe(1000);
    expect(state.height * state.scaleY).toBe(562.5);
    expect(state.x).toBe(500);
    expect(state.y).toBe(500);
  });

  it("should use the project ratio for Original Ratio mode", () => {
    context.project.width = 1600;
    context.project.height = 900;
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 100, y: 100, width: 600, height: 600 },
    };
    context.settings.crop = {
      mode: "Original Ratio",
      ratioW: 1,
      ratioH: 1,
      deleteCropped: true,
      isDirty: false,
    };

    const tool = new CropTool();
    tool.onActivate(context);

    const state = (tool as any).cropState;
    expect(state.width * state.scaleX).toBe(600);
    expect(state.height * state.scaleY).toBe(337.5);
    expect(state.x).toBe(400);
    expect(state.y).toBe(400);
  });

  it("should ignore invalid ratios and zero-sized crops", () => {
    context.settings.crop = {
      mode: "Fixed Ratio",
      ratioW: 0,
      ratioH: 9,
      deleteCropped: true,
      isDirty: false,
    };

    const tool = new CropTool();
    tool.onActivate(context);

    let state = (tool as any).cropState;
    expect(state.width).toBe(1000);
    expect(state.height).toBe(1000);

    state.width = 0;
    state.height = 0;
    const onSettingsChange = context.subscribe.mock.calls[0][0];
    onSettingsChange({
      ...context.settings,
      crop: { ...context.settings.crop, ratioW: 16, ratioH: 9 },
    });

    state = (tool as any).cropState;
    expect(state.width).toBe(0);
    expect(state.height).toBe(0);
    expect(Number.isFinite(state.scaleX)).toBe(true);
    expect(Number.isFinite(state.scaleY)).toBe(true);
  });

  it("should snap new crop start to pixels", () => {
    const tool = new CropTool();
    tool.onActivate(context);

    // Simulate click at sub-pixel coordinate way outside
    context.screenToProject = vi.fn(() => ({ x: -100.4, y: -200.6 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    const state = (tool as any).cropState;
    expect(state.x).toBe(-100);
    expect(state.y).toBe(-201);
    expect(state.width).toBe(0);
  });

  it("should enforce minimum 1px size during small drag", () => {
    const tool = new CropTool();
    tool.onActivate(context);

    // Start way outside
    context.screenToProject = vi.fn(() => ({ x: -100, y: -100 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    // Move slightly (0.2px)
    context.screenToProject = vi.fn(() => ({ x: -100.2, y: -100.2 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    const state = (tool as any).cropState;
    const w = state.width * state.scaleX;
    const h = state.height * state.scaleY;

    // Should have snapped to 1px (absolute value)
    expect(Math.abs(w)).toBe(1);
    expect(Math.abs(h)).toBe(1);
  });

  it("should reset crop if mouse up happens with zero size", () => {
    const tool = new CropTool();
    tool.onActivate(context);

    // Click outside and release without moving
    context.screenToProject = vi.fn(() => ({ x: -50, y: -50 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    let state = (tool as any).cropState;
    expect(state.width).toBe(0);

    tool.onMouseUp({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    state = (tool as any).cropState;
    // Should have reset to project bounds (1000x1000)
    expect(state.width).toBe(1000);
    expect(state.height).toBe(1000);
  });

  it("should prevent 0x0 project in apply", async () => {
    const tool = new CropTool();
    tool.onActivate(context);

    // Force a 0x0 state (simulating invalid state)
    (tool as any).cropState = {
      x: 50,
      y: 50,
      width: 0,
      height: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    };

    await tool.apply(context);

    // Check context.updateProject calls
    const applyCall = context.updateProject.mock.calls.find((c: any) => c[0].width !== undefined);
    expect(applyCall).toBeDefined();
    expect(applyCall[0].width).toBeGreaterThanOrEqual(1);
    expect(applyCall[0].height).toBeGreaterThanOrEqual(1);
  });
});
