import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForgeEngine } from "@/core/engine/ForgeEngine";
import { createMockProject } from "../../mocks";
import { useToolStore } from "@/renderer/store/toolStore";

describe("ForgeEngine - Layer Styles", () => {
  let canvas: HTMLCanvasElement;
  let onViewportChange: any;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    onViewportChange = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("should use renderLayerWithStyles when InnerShadow is enabled", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject();

    // Create a layer with only innerShadow enabled
    const layerWithInnerShadow = {
      ...project.layers[0],
      styles: {
        innerShadow: {
          enabled: true,
          color: "#000000",
          opacity: 75,
          angle: 90,
          distance: 5,
          spread: 0,
          size: 5,
          noise: 0,
        },
      },
    };

    project.layers = [layerWithInnerShadow];
    engine.setProject(project);

    // Spy on renderLayerToContext
    const renderLayerToContextSpy = vi.spyOn(engine as any, "renderLayerToContext");

    // Trigger render
    (engine as any).render();

    // Check if it was called with { skipStyles: true } which means it went through renderLayerWithStyles
    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find((call) => (call[1] as any).id === layerWithInnerShadow.id);

    expect(layerCall).toBeDefined();
    expect(layerCall![3]).toEqual({ skipStyles: true });
  });

  it("should use renderLayerWithStyles when DropShadow is enabled (baseline)", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject();

    const layerWithDropShadow = {
      ...project.layers[0],
      styles: {
        dropShadow: {
          enabled: true,
          color: "#000000",
          opacity: 75,
          angle: 90,
          distance: 5,
          spread: 0,
          size: 5,
          noise: 0,
        },
      },
    };

    project.layers = [layerWithDropShadow];
    engine.setProject(project);

    const renderLayerToContextSpy = vi.spyOn(engine as any, "renderLayerToContext");

    (engine as any).render();

    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find((call) => (call[1] as any).id === layerWithDropShadow.id);

    expect(layerCall).toBeDefined();
    expect(layerCall![3]).toEqual({ skipStyles: true });
  });

  it("should use renderLayerWithStyles when Stroke is enabled", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject();

    const layerWithStroke = {
      ...project.layers[0],
      styles: {
        stroke: {
          enabled: true,
          color: "#000000",
          size: 5,
          position: "center",
          opacity: 100,
          rounded: true,
          antiAlias: true,
        },
      },
    } as any;

    project.layers = [layerWithStroke];
    engine.setProject(project);

    const renderLayerToContextSpy = vi.spyOn(engine as any, "renderLayerToContext");

    (engine as any).render();

    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find((call) => (call[1] as any).id === layerWithStroke.id);

    expect(layerCall).toBeDefined();
    expect(layerCall![3]).toEqual({ skipStyles: true });
  });

  it("should handle dynamic styles (any property with enabled: true)", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject();

    const layerWithCustomStyle = {
      ...project.layers[0],
      styles: {
        someNewStyle: {
          enabled: true,
        },
      } as any,
    };

    project.layers = [layerWithCustomStyle];
    engine.setProject(project);

    const renderLayerToContextSpy = vi.spyOn(engine as any, "renderLayerToContext");

    (engine as any).render();

    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find((call) => (call[1] as any).id === layerWithCustomStyle.id);

    expect(layerCall).toBeDefined();
    expect(layerCall![3]).toEqual({ skipStyles: true });
  });

  it("should apply LayerMask BEFORE rendering styles so styles adapt to the mask", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject();

    const layerWithMaskAndStroke = {
      ...project.layers[0],
      styles: {
        stroke: {
          enabled: true,
          color: "#000000",
          size: 5,
          position: "outside",
          opacity: 100,
          rounded: true,
          antiAlias: true,
        },
      },
      mask: {
        enabled: true,
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    } as any;

    project.layers = [layerWithMaskAndStroke];
    engine.setProject(project);

    // Spy on the key methods
    const applyLayerMaskSpy = vi.spyOn(engine as any, "applyLayerMask");
    const renderStrokeSpy = vi.spyOn(engine as any, "renderStroke");
    const renderLayerToContextSpy = vi.spyOn(engine as any, "renderLayerToContext");

    (engine as any).render();

    // Verify call order
    const layerToContextCallIndex = renderLayerToContextSpy.mock.invocationCallOrder[0];
    const applyMaskCallIndex = applyLayerMaskSpy.mock.invocationCallOrder[0];
    const renderStrokeCallIndex = renderStrokeSpy.mock.invocationCallOrder[0];

    expect(applyMaskCallIndex).toBeDefined();
    expect(renderStrokeCallIndex).toBeDefined();

    // 1. Content is rendered
    // 2. Mask is applied
    // 3. Style (Stroke) is rendered
    expect(layerToContextCallIndex).toBeLessThan(applyMaskCallIndex);
    expect(applyMaskCallIndex).toBeLessThan(renderStrokeCallIndex);

    // Also verify that applyLayerMask was NOT called on the final composition context
    // In our implementation, the first call is the one we care about.
    expect(applyLayerMaskSpy).toHaveBeenCalledTimes(1);
  });

  it("should size styled group bounds from a child's transform preview", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject();
    const child = {
      ...project.layers[0],
      id: "child",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    const group = {
      ...project.layers[0],
      id: "group",
      type: "group" as const,
      parentId: undefined,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      styles: {
        stroke: {
          enabled: true,
          color: "#000000",
          size: 5,
          position: "outside" as const,
          opacity: 100,
          rounded: true,
          antiAlias: true,
        },
      },
    };

    project.layers = [group, { ...child, parentId: group.id }];
    engine.setProject(project);

    useToolStore.getState().setActiveTool("transform");
    useToolStore.getState().updateToolSettings("transform", {
      x: 250,
      y: 150,
      width: child.width,
      height: child.height,
      scaleX: 2,
      scaleY: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    });

    vi.spyOn(engine as any, "getActiveTool").mockReturnValue({
      id: "transform",
      getEditingLayerId: () => child.id,
    });

    const previewBounds = (engine as any).getCurrentRenderBoundsLayer({
      ...child,
      parentId: group.id,
    });

    expect(previewBounds).toMatchObject({
      x: 150,
      y: 100,
      width: 200,
      height: 100,
    });
  });
});
