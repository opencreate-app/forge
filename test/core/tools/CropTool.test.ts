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
