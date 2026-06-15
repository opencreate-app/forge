import { describe, it, expect, vi, beforeEach } from "vitest";
import { TextTool } from "@/core/tools/TextTool";
import { createMockToolContext } from "../../mocks";

vi.mock("@/renderer/store/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({ showGuides: true })),
    setState: vi.fn(),
  },
}));

const mockUpdateLayer = vi.fn();
vi.mock("@/renderer/store/projectStore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useProjectStore: Object.assign(vi.fn(), {
      getState: () => ({
        updateLayer: mockUpdateLayer,
      }),
    }),
  };
});

describe("TextTool Snapping", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.guides = [
      { id: "g1", type: "vertical", position: 100 },
      { id: "g2", type: "horizontal", position: 200 }
    ];
    context.project.zoom = 1;
    context.project.width = 1000;
    context.project.height = 1000;
  });

  it("should snap initial mouse down to guides", () => {
    const tool = new TextTool();
    tool.onActivate(context);
    
    // Click near vertical guide (100) -> 102
    context.screenToProject = vi.fn(() => ({ x: 102, y: 50 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    
    expect((tool as any).startPos.x).toBe(100);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });

  it("should snap text box creation to guides", () => {
    const tool = new TextTool();
    tool.onActivate(context);
    
    // Start at 0, 0
    context.screenToProject = vi.fn(() => ({ x: 0, y: 0 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    
    // Move near horizontal guide (200) -> 198
    context.screenToProject = vi.fn(() => ({ x: 50, y: 198 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    expect((tool as any).currentPos.y).toBe(200);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "horizontal", position: 200 });
  });

  it("should snap text box edges and center during movement", () => {
    const tool = new TextTool();
    tool.onActivate(context);
    
    // Create a mock layer
    const textLayer = {
        id: "layer1",
        type: "text",
        x: 0,
        y: 0,
        width: 50,
        height: 20,
        visible: true,
        locked: false
    };
    context.project.layers = [textLayer];
    context.isLayerVisible = vi.fn(() => true);
    context.isLayerLocked = vi.fn(() => false);
    
    // Set as editing layer
    (tool as any).editingLayerId = "layer1";
    (tool as any).isEditing = true;
    
    // Start moving from 10, 10 (inside layer)
    // Actually TextTool.onMouseDown starts moving if clicked FAR from handles when editing.
    // Let's mock findTextLayerAt to return null (to trigger movement) 
    // or just set isMoving to true manually for the test after onMouseDown.
    
    // 1. First click to start editing
    context.screenToProject = vi.fn(() => ({ x: 10, y: 10 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    expect((tool as any).isEditing).toBe(true);
    tool.onMouseUp({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    expect((tool as any).isSelecting).toBe(false);
    
    // 2. Second click OUTSIDE the layer to start moving
    context.screenToProject = vi.fn(() => ({ x: -50, y: -50 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    expect((tool as any).isMoving).toBe(true);
    
    // Move so that CENTER (x + 25) is near guide (100)
    // dx should be 75 (PotentialX = 75, Center = 100).
    // Mouse moved from -50 to 25? dx = 25 - (-50) = 75.
    context.screenToProject = vi.fn(() => ({ x: 26, y: -50 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });

  it("should snap handles during resizing", () => {
    const tool = new TextTool();
    tool.onActivate(context);
    
    const textLayer = {
        id: "layer1",
        type: "text",
        x: 0,
        y: 0,
        width: 50,
        height: 20,
        visible: true,
        locked: false,
        rotation: 0
    };
    context.project.layers = [textLayer];
    
    // Mock resize
    (tool as any).editingLayerId = "layer1";
    (tool as any).isEditing = true;
    (tool as any).isResizing = true;
    (tool as any).resizeHandle = "center-right";
    (tool as any).layerStartBounds = { x: 0, y: 0, width: 50, height: 20 };
    (tool as any).startPos = { x: 50, y: 10 }; // On the right edge
    
    // Move near guide (100)
    context.screenToProject = vi.fn(() => ({ x: 102, y: 10 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });

  it("should snap handles exactly during resizing, even with click offset", () => {
    const tool = new TextTool();
    tool.onActivate(context);
    
    const textLayer = {
        id: "layer1",
        type: "text",
        x: 0,
        y: 0,
        width: 50,
        height: 20,
        visible: true,
        locked: false,
        rotation: 0
    };
    context.project.layers = [textLayer];
    
    // Set as editing
    (tool as any).editingLayerId = "layer1";
    (tool as any).isEditing = true;

    // 1. Start resizing from right edge (x=50)
    // Click at 54, 10 (offset of 4px from handle at 50, 10)
    context.screenToProject = vi.fn(() => ({ x: 54, y: 10 }));
    (tool as any).isCtrlPressed = true;
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    
    expect((tool as any).resizeHandle).toBe("center-right");
    expect((tool as any).handleStartOffset.x).toBe(4);

    // 2. Move mouse to 104. 
    // Target handle center = 104 - 4 = 100.
    // 100 is Guide 100.
    context.screenToProject = vi.fn(() => ({ x: 104, y: 10 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    // Check updateLayer call
    expect(mockUpdateLayer).toHaveBeenCalledWith(
        context.project.id,
        "layer1",
        expect.objectContaining({ width: 100 })
    );
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });
});
