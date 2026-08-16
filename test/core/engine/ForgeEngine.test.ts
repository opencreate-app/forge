import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForgeEngine } from "@/core/engine/ForgeEngine";
import { createMockProject } from "../../mocks";

describe("ForgeEngine", () => {
  let canvas: HTMLCanvasElement;
  let onViewportChange: any;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    Object.defineProperty(canvas, "parentElement", {
      value: { clientWidth: 1000, clientHeight: 800 },
      configurable: true,
      writable: true,
    });
    onViewportChange = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("should initialize with tools", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    expect(engine).toBeDefined();
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it("should convert screen coordinates to project coordinates", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject({ zoom: 2, panX: 100, panY: 50 });
    engine.setProject(project);
    const coords = engine.screenToProject(200, 150);
    expect(coords).toEqual({ x: 50, y: 50 });
  });

  it("should sample a rendered pixel using viewport coordinates", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const context = canvas.getContext("2d")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320 }),
    });
    vi.spyOn(context, "getImageData").mockReturnValue({
      data: new Uint8ClampedArray([12, 34, 56, 255]),
    } as ImageData);

    expect(engine.sampleColorAtScreen(110, 170)).toEqual({ r: 12, g: 34, b: 56, a: 255 });
    expect(context.getImageData).toHaveBeenCalledWith(200, 300, 1, 1);
    expect(engine.sampleColorAtScreen(500, 500)).toBeNull();
  });
});
