import { vi } from "vitest";
import { ToolContext } from "@/core/tools/BaseTool";
import { Project } from "@/renderer/store/projectStore";

export const createMockProject = (overrides: Partial<Project> = {}): Project => ({
  id: "test-project",
  name: "Test",
  width: 800,
  height: 600,
  layers: [
    {
      id: "layer-1",
      name: "Layer 1",
      type: "raster",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      blendMode: "source-over",
    },
  ],
  guides: [],
  activeLayerId: "layer-1",
  activeMaskId: null,
  selectedLayerIds: ["layer-1"],
  selection: { hasSelection: false, bounds: null },
  zoom: 1,
  panX: 0,
  panY: 0,
  isDirty: false,
  undoStack: [],
  redoStack: [],
  ...overrides,
});

export const createMockToolContext = (overrides: Partial<ToolContext> = {}): ToolContext => {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;

  return {
    project: createMockProject(),
    settings: {
      brush: { size: 10, hardness: 0.5, opacity: 100, spacing: 10, color: "#000000" },
      pencil: { size: 1, color: "#000000", opacity: 100, shape: "circle" },
      eraser: { size: 10, hardness: 0.5, opacity: 100, spacing: 10 },
      move: { autoSelect: true },
      select: { mode: "replace", type: "rect" },
      text: { fontSize: 24, fontFamily: "Arial", color: "#000000" },
      transform: { maintainAspectRatio: true },
      crop: {},
    } as any,
    activeToolId: "brush",
    previousToolId: "brush",
    canvas,
    ctx: canvas.getContext("2d")!,
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
    devicePixelRatio: 1,
    setViewportTransform: vi.fn((zoom: number, panX: number, panY: number) => {
      canvas.getContext("2d")!.setTransform(zoom, 0, 0, zoom, panX, panY);
    }),
    updateProject: vi.fn(),
    pushHistory: vi.fn(),
    addHistoryEntry: vi.fn(),
    invalidateCache: vi.fn(),
    setLayerCache: vi.fn(),
    setMaskCache: vi.fn(),
    getLayerCanvas: vi.fn().mockReturnValue(null),
    ensureLayerCanvas: vi.fn().mockResolvedValue(document.createElement("canvas")),
    screenToProject: vi.fn((x, y) => ({ x, y })),
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    sampleColorAtScreen: vi.fn().mockReturnValue(null),
    setForegroundColor: vi.fn(),
    getSelectionCanvas: vi.fn(() => ({
      canvas: document.createElement("canvas"),
      ctx: document.createElement("canvas").getContext("2d")!,
    })),
    updateSelectionEdges: vi.fn(),
    setLastSelectionMask: vi.fn(),
    floatSelection: vi.fn().mockResolvedValue(true),
    commitFloatingLayer: vi.fn().mockResolvedValue(undefined),
    clearSelection: vi.fn().mockResolvedValue(undefined),
    deleteSelectionContents: vi.fn().mockResolvedValue(false),
    setInteracting: vi.fn(),
    setActiveTool: vi.fn(),
    updateToolSettings: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    animateFitToScreen: vi.fn(),
    isLayerLocked: vi.fn((layerId: string) => {
      const project = (overrides.project as any) || createMockProject();
      return project.layers.find((l: any) => l.id === layerId)?.locked || false;
    }),
    isLayerVisible: vi.fn((layerId: string) => {
      const project = (overrides.project as any) || createMockProject();
      return project.layers.find((l: any) => l.id === layerId)?.visible || false;
    }),
    ...overrides,
  };
};
