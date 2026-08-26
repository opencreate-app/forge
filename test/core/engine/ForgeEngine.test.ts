import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForgeEngine } from "@/core/engine/ForgeEngine";
import { createMockProject } from "../../mocks";
import { useToolStore } from "@store/toolStore";
import { createHistoryState, useProjectStore } from "@store/projectStore";

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

  it("switches from MoveTool to text editing on a text layer double click", () => {
    const textLayer = {
      id: "text-layer",
      name: "Text",
      type: "text" as const,
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: 120,
      height: 30,
      blendMode: "source-over" as const,
      text: "Editable text",
      textType: "point" as const,
      fontSize: 24,
      fontFamily: "Arial",
      fontWeight: "400",
    };
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    engine.setProject(
      createMockProject({
        layers: [textLayer],
        activeLayerId: textLayer.id,
        selectedLayerIds: [textLayer.id],
      }),
    );
    useToolStore.getState().setActiveTool("move");

    (engine as any).handleDoubleClick({ offsetX: 10, offsetY: 10 } as MouseEvent);

    expect(useToolStore.getState().activeToolId).toBe("text");
    engine.render();
    expect((engine as any).tools.text.getEditingLayerId()).toBe(textLayer.id);

    useToolStore.getState().setActiveTool("move");
    engine.stopRenderLoop();
  });

  it("keeps the logical viewport size while scaling the backing store for HiDPI", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });

    engine.resizeViewport(400, 300, 2);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("maps CSS coordinates to HiDPI backing-store pixels when sampling", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    engine.resizeViewport(400, 300, 2);
    const context = canvas.getContext("2d")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 400, height: 300, right: 410, bottom: 320 }),
      configurable: true,
    });
    vi.spyOn(context, "getImageData").mockReturnValue({
      data: new Uint8ClampedArray([12, 34, 56, 255]),
    } as ImageData);

    engine.sampleColorAtScreen(210, 170);

    expect(context.getImageData).toHaveBeenCalledWith(400, 300, 1, 1);
  });

  it("commits a floating selection into the source layer and records one history entry", async () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const project = createMockProject({
      layers: [
        {
          ...createMockProject().layers[0],
          data: "data:image/png;base64,source",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      ],
      selection: {
        hasSelection: true,
        bounds: { x: 8, y: 8, width: 5, height: 5 },
        floatingLayer: {
          id: "floating-selection",
          name: "Floating Selection",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 8,
          y: 8,
          width: 5,
          height: 5,
          data: "data:image/png;base64,floating",
          blendMode: "source-over",
        },
      },
    });
    const historyState = createHistoryState(createMockProject());
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 10;
    sourceCanvas.height = 10;
    const floatingCanvas = document.createElement("canvas");
    floatingCanvas.width = 5;
    floatingCanvas.height = 5;

    const store = useProjectStore.getState();
    const originalActions = {
      updateLayer: store.updateLayer,
      updateProject: store.updateProject,
      addHistoryEntry: store.addHistoryEntry,
    };
    const updateLayer = vi.fn();
    const updateProject = vi.fn();
    const addHistoryEntry = vi.fn();
    useProjectStore.setState({ updateLayer, updateProject, addHistoryEntry } as never);

    try {
      engine.setProject(project);
      const engineState = engine as any;
      engineState.layerCanvasCache.set("layer-1", sourceCanvas);
      engineState.layerReadyCache.set("layer-1", true);
      engineState.layerCanvasCache.set("floating-selection", floatingCanvas);
      engineState.layerReadyCache.set("floating-selection", true);
      engineState.floatingSelectionHistory = historyState;

      await engineState.commitFloatingLayer();

      expect(project.selection.floatingLayer).toBeNull();
      expect(updateLayer).toHaveBeenCalledWith(
        project.id,
        "layer-1",
        expect.objectContaining({ x: 0, y: 0, width: 13, height: 13 }),
      );
      expect(addHistoryEntry).toHaveBeenCalledWith(
        project.id,
        expect.objectContaining({ description: "Move Selection", state: historyState }),
      );
    } finally {
      useProjectStore.setState(originalActions);
      engine.stopRenderLoop();
    }
  });

  it("waits for the floating selection commit before changing tools", async () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const project = createMockProject({
      selection: {
        hasSelection: true,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        floatingLayer: {
          id: "floating-selection",
          name: "Floating Selection",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          blendMode: "source-over",
        },
      },
    });
    engine.setProject(project);
    const engineState = engine as any;
    engineState.currentToolId = "move";
    engineState.commitFloatingLayer = vi.fn(async () => {
      project.selection.floatingLayer = null;
      return true;
    });
    useToolStore.getState().setActiveTool("select");

    engine.render();
    expect(engineState.currentToolId).toBe("move");

    await Promise.resolve();
    await Promise.resolve();
    expect(engineState.currentToolId).toBe("select");

    useToolStore.getState().setActiveTool("move");
    engine.stopRenderLoop();
  });

  it("samples the scene snapshot after rendering and ignores tool overlays", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    engine.setProject(createMockProject({ layers: [] }));
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 1000, height: 800, right: 1010, bottom: 820 }),
      configurable: true,
    });

    const sceneContext = (engine as any).sceneCtx as CanvasRenderingContext2D;
    vi.spyOn(sceneContext, "getImageData").mockReturnValue({
      data: new Uint8ClampedArray([200, 30, 40, 255]),
    } as ImageData);

    engine.render();

    expect(engine.sampleColorAtScreen(110, 120)).toEqual({ r: 200, g: 30, b: 40, a: 255 });
    expect(sceneContext.getImageData).toHaveBeenCalledWith(80, 75, 1, 1);
  });

  it("applies immediate zoom requests without animation", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    engine.resizeViewport(800, 600, 1);
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

  it("applies logarithmic keyboard zoom steps and respects zoom limits", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    engine.resizeViewport(800, 600, 1);
    const project = createMockProject({ zoom: 1, panX: 0, panY: 0 });
    engine.setProject(project);
    const targetZooms: number[] = [];
    vi.spyOn(engine, "animateZoom").mockImplementation((targetZoom) => {
      targetZooms.push(targetZoom);
    });

    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: 1 } }));
    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: -1 } }));

    expect(targetZooms[0]).toBeCloseTo(1.1);
    expect(targetZooms[1]).toBeCloseTo(1 / 1.1);

    project.zoom = 10;
    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: 1 } }));
    expect(targetZooms[2]).toBeCloseTo(11);

    project.zoom = 50;
    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: 1 } }));
    project.zoom = 0.05;
    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: -1 } }));

    expect(targetZooms[3]).toBe(50);
    expect(targetZooms[4]).toBe(0.05);
  });

  it("bases consecutive keyboard zoom steps on the current animation target", () => {
    const engine = new ForgeEngine(canvas, onViewportChange);
    engine.resizeViewport(800, 600, 1);
    engine.setProject(createMockProject({ zoom: 1, panX: 0, panY: 0 }));

    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: 1 } }));
    window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: 1 } }));

    expect((engine as any).targetViewport.zoom).toBeCloseTo(1.21);
  });

  it("upscales small project thumbnails with nearest-neighbor rendering", async () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    engine.setProject(createMockProject({ width: 16, height: 16, layers: [] }));
    const createElementSpy = vi.spyOn(document, "createElement");
    const toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,pixel-art");

    await engine.generateThumbnail();

    const generatedCanvases = createElementSpy.mock.results
      .map((result) => result.value)
      .filter((element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement);
    const pixelCanvas = generatedCanvases.find((element) => element.width === 160);

    expect(pixelCanvas).toBeDefined();
    expect(pixelCanvas?.height).toBe(160);
    expect(pixelCanvas?.getContext("2d")?.imageSmoothingEnabled).toBe(false);
    expect(toDataURLSpy).toHaveBeenCalledWith("image/png", undefined);

    createElementSpy.mockRestore();
    toDataURLSpy.mockRestore();
  });

  it("keeps the regular thumbnail pipeline for projects at least 32x32", async () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    engine.setProject(createMockProject({ width: 32, height: 32, layers: [] }));
    const createElementSpy = vi.spyOn(document, "createElement");
    const toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/jpeg;base64,regular");

    await engine.generateThumbnail();

    const generatedCanvases = createElementSpy.mock.results
      .map((result) => result.value)
      .filter((element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement);

    expect(generatedCanvases.some((element) => element.width === 320)).toBe(false);
    expect(toDataURLSpy).toHaveBeenCalledWith("image/jpeg", 0.9);

    createElementSpy.mockRestore();
    toDataURLSpy.mockRestore();
  });

  it("keeps a freshly committed layer cache when synchronizing the project", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const project = createMockProject();
    const dataUrl = "data:image/png;base64,painted-layer";
    const cachedCanvas = document.createElement("canvas");
    cachedCanvas.width = 120;
    cachedCanvas.height = 90;
    (cachedCanvas as HTMLCanvasElement & { _dataUrl?: string })._dataUrl = dataUrl;

    engine.setProject(project);
    const engineState = engine as any;
    engineState.layerCanvasCache.set("layer-1", cachedCanvas);
    engineState.layerReadyCache.set("layer-1", true);

    const updatedProject = {
      ...project,
      layers: [
        {
          ...project.layers[0],
          data: dataUrl,
          width: 120,
          height: 90,
        },
      ],
    };

    engineState.applyProjectUpdate(updatedProject);

    expect(engineState.project).toBe(updatedProject);
    expect(engineState.layerCanvasCache.get("layer-1")).toBe(cachedCanvas);
    expect(engineState.layerReadyCache.get("layer-1")).toBe(true);
  });

  it("keeps a freshly committed mask cache when synchronizing the project", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const maskData = "data:image/png;base64,painted-mask";
    const project = createMockProject({
      layers: [
        {
          ...createMockProject().layers[0],
          mask: {
            data: "data:image/png;base64,old-mask",
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            enabled: true,
            linked: true,
          },
        },
      ],
    });
    const cachedCanvas = document.createElement("canvas");
    cachedCanvas.width = 80;
    cachedCanvas.height = 60;

    engine.setProject(project);
    const engineState = engine as any;
    engineState.maskCanvasCache.set("layer-1", { canvas: cachedCanvas, dataUrl: maskData });

    const updatedProject = {
      ...project,
      layers: [
        {
          ...project.layers[0],
          mask: {
            ...project.layers[0].mask!,
            data: maskData,
            width: 80,
            height: 60,
          },
        },
      ],
    };

    engineState.applyProjectUpdate(updatedProject);

    expect(engineState.project).toBe(updatedProject);
    expect(engineState.maskCanvasCache.get("layer-1")).toEqual({
      canvas: cachedCanvas,
      dataUrl: maskData,
    });
  });

  it("reuses the converted alpha canvas for an unchanged layer mask", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const engineState = engine as any;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 20;
    sourceCanvas.height = 10;
    const mask = {
      data: "data:image/png;base64,mask",
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      enabled: true,
      linked: true,
    };

    engineState.maskCanvasCache.set("layer-1", {
      canvas: sourceCanvas,
      dataUrl: mask.data,
    });

    const firstAlphaCanvas = engineState.getMaskAlphaCanvas("layer-1", mask);
    const secondAlphaCanvas = engineState.getMaskAlphaCanvas("layer-1", mask);

    expect(firstAlphaCanvas).toBeDefined();
    expect(secondAlphaCanvas).toBe(firstAlphaCanvas);
    expect(engineState.maskCanvasCache.get("layer-1").alphaCanvas).toBe(firstAlphaCanvas);
  });

  it("reuses a layer render buffer until its dimensions change", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const engineState = engine as any;

    const firstBuffer = engineState.getLayerRenderBuffer("layer-1", 120, 80);
    const secondBuffer = engineState.getLayerRenderBuffer("layer-1", 120, 80);
    const resizedBuffer = engineState.getLayerRenderBuffer("layer-1", 240, 80);

    expect(secondBuffer).toBe(firstBuffer);
    expect(resizedBuffer).not.toBe(firstBuffer);
  });

  it("invalidates the mask and render buffers together", () => {
    const engine = new ForgeEngine(canvas, onViewportChange, { headless: true });
    const engineState = engine as any;
    const sourceCanvas = document.createElement("canvas");

    engineState.maskCanvasCache.set("layer-1", {
      canvas: sourceCanvas,
      dataUrl: "data:image/png;base64,mask",
    });
    engineState.getLayerRenderBuffer("layer-1", 20, 20);

    engine.invalidateLayerCache("layer-1");

    expect(engineState.maskCanvasCache.has("layer-1")).toBe(false);
    expect(engineState.layerRenderBufferCache.has("layer-1")).toBe(false);
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
    const createElement = vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === "canvas") {
        const context = (element as HTMLCanvasElement).getContext("2d")!;
        vi.spyOn(context, "fillRect").mockImplementation(
          (...args: [number, number, number, number]) => {
            fillRectCalls.push(args);
          },
        );
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
