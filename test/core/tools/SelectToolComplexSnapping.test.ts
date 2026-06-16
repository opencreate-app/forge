import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectTool } from "@/core/tools/SelectTool";
import { createMockToolContext } from "../../mocks";

vi.mock("@/renderer/store/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({ showGuides: true, snapToGuides: true })),
    setState: vi.fn(),
  },
}));

describe("SelectTool Complex Snapping", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.guides = [
      { id: "g1", type: "vertical", position: 100 }
    ];
    context.project.zoom = 1;
  });

  it("should detect internal edges and snap to them", () => {
    const tool = new SelectTool();
    
    // Setup L-shape selection 20x20
    // Top-left 10x10 is empty, rest is filled
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 0, y: 0, width: 20, height: 20 }
    };
    
    const mockCanvas = document.createElement("canvas");
    mockCanvas.width = 20;
    mockCanvas.height = 20;
    const ctx = mockCanvas.getContext("2d")!;
    
    // Fill the L-shape
    ctx.fillStyle = "white";
    ctx.fillRect(10, 0, 10, 20); // Right half
    ctx.fillRect(0, 10, 10, 10); // Bottom-left quarter
    
    context.getSelectionCanvas = vi.fn(() => ({
      canvas: mockCanvas,
      ctx: ctx
    }));

    (tool as any).isPointInSelection = vi.fn(() => true);
    
    // Start moving
    context.screenToProject = vi.fn(() => ({ x: 15, y: 15 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    
    // Verify that x=10 was detected as a relative snap point
    expect((tool as any).relativeSnapPointsX).toContain(10);
    
    // Move so that internal edge (relX=10) is near guide (100)
    // dx should be 90. Mouse is at 105.
    context.screenToProject = vi.fn(() => ({ x: 106, y: 15 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    const lastCall = context.updateProject.mock.calls[context.updateProject.mock.calls.length - 1][0];
    // Original x (0) + dx (90) = 90.
    // At x=90, the relative point 10 is at 100 (the guide).
    expect(lastCall.selection.bounds.x).toBe(90);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });
});
