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

  it("applies immediate zoom requests without animation", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject({ zoom: 1, panX: 0, panY: 0 });
    engine.setProject(project);

    window.dispatchEvent(
      new CustomEvent("forge:zoom-to", {
        detail: { zoom: 2, immediate: true },
      }),
    );

    expect(project.zoom).toBe(2);
    expect(project.panX).toBe(-400);
    expect(project.panY).toBe(-300);
    expect(onViewportChange).toHaveBeenCalledWith(2, -400, -300);
  });

  it("preserves previous transparent areas when composing a deletion mask", async () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    const project = createMockProject({
      width: 100,
      height: 80,
      selection: {
        hasSelection: true,
        bounds: { x: 40, y: 20, width: 15, height: 10 },
        mask: "data:image/png;base64,selection",
      },
    });
    const selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = 15;
    selectionCanvas.height = 10;
    (engine as any).project = project;
    (engine as any).selectionCanvas = selectionCanvas;

    const existingImage = document.createElement("canvas");
    const loadImage = vi.spyOn(engine as any, "loadImage").mockResolvedValue(existingImage);
    const fillRectCalls: unknown[][] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
        const element = originalCreateElement(tagName, options);
        if (tagName === "canvas") {
          const context = (element as HTMLCanvasElement).getContext("2d")!;
          vi.spyOn(context, "fillRect").mockImplementation((...args: [number, number, number, number]) => {
            fillRectCalls.push(args);
          });
        }
        return element;
      }) as typeof document.createElement);

    try {
      await (engine as any).createSelectionDeletionMask({
        data: "data:image/png;base64,existing-mask",
        x: 10,
        y: 12,
        width: 30,
        height: 25,
        enabled: true,
        linked: true,
      });

      expect(fillRectCalls).toContainEqual([10, 12, 30, 25]);
    } finally {
      createElement.mockRestore();
      loadImage.mockRestore();
    }
  });
});
