import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForgeEngine } from "@/core/engine/ForgeEngine";
import { createMockProject } from "../../mocks";

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
          noise: 0
        }
      }
    };
    
    project.layers = [layerWithInnerShadow];
    engine.setProject(project);

    // Spy on renderLayerToContext
    const renderLayerToContextSpy = vi.spyOn(engine as any, 'renderLayerToContext');
    
    // Trigger render
    (engine as any).render();

    // Check if it was called with { skipStyles: true } which means it went through renderLayerWithStyles
    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find(call => (call[1] as any).id === layerWithInnerShadow.id);
    
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
          noise: 0
        }
      }
    };
    
    project.layers = [layerWithDropShadow];
    engine.setProject(project);

    const renderLayerToContextSpy = vi.spyOn(engine as any, 'renderLayerToContext');
    
    (engine as any).render();
    
    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find(call => (call[1] as any).id === layerWithDropShadow.id);
    
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
          antiAlias: true
        }
      }
    } as any;
    
    project.layers = [layerWithStroke];
    engine.setProject(project);

    const renderLayerToContextSpy = vi.spyOn(engine as any, 'renderLayerToContext');
    
    (engine as any).render();
    
    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find(call => (call[1] as any).id === layerWithStroke.id);
    
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
          enabled: true
        }
      } as any
    };
    
    project.layers = [layerWithCustomStyle];
    engine.setProject(project);

    const renderLayerToContextSpy = vi.spyOn(engine as any, 'renderLayerToContext');
    
    (engine as any).render();
    
    const calls = renderLayerToContextSpy.mock.calls;
    const layerCall = calls.find(call => (call[1] as any).id === layerWithCustomStyle.id);
    
    expect(layerCall).toBeDefined();
    expect(layerCall![3]).toEqual({ skipStyles: true });
  });
});
