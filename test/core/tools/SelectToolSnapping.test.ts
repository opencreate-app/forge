import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectTool } from "@/core/tools/SelectTool";
import { createMockToolContext } from "../../mocks";
import { useUIStore } from "@/renderer/store/uiStore";

vi.mock("@/renderer/store/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({ showGuides: true, snapToGuides: true })),
    setState: vi.fn(),
  },
}));

describe("SelectTool Snapping", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.guides = [
      { id: "g1", type: "vertical", position: 100 },
      { id: "g2", type: "horizontal", position: 200 },
    ];
    context.project.zoom = 1;
  });

  it("should snap cursor to guides during selection creation", () => {
    const tool = new SelectTool();

    // Start selection at 0, 0
    context.screenToProject = vi.fn(() => ({ x: 0, y: 0 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    // Move cursor near vertical guide (100) -> 102
    context.screenToProject = vi.fn(() => ({ x: 102, y: 50 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    expect((tool as any).currentX).toBe(100); // Snapped to guide
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });

    // Move cursor near horizontal guide (200) -> 198
    context.screenToProject = vi.fn(() => ({ x: 50, y: 198 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    expect((tool as any).currentY).toBe(200); // Snapped to guide
    expect((tool as any).activeSnapLines).toContainEqual({ type: "horizontal", position: 200 });
  });

  it("should snap initial coordinate to guides in onMouseDown", () => {
    const tool = new SelectTool();

    // Click near vertical guide (100) -> 102
    context.screenToProject = vi.fn(() => ({ x: 102, y: 50 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    expect((tool as any).startX).toBe(100); // Snapped to guide
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });

  it("should snap cursor to canvas edges during selection creation", () => {
    const tool = new SelectTool();
    context.project.width = 1000;
    context.project.height = 1000;

    // Start selection at 500, 500
    context.screenToProject = vi.fn(() => ({ x: 500, y: 500 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    // Move cursor near left canvas edge (0) -> 2
    context.screenToProject = vi.fn(() => ({ x: 2, y: 500 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    expect((tool as any).currentX).toBe(0); // Snapped to canvas edge
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 0 });

    // Move cursor near right canvas edge (1000) -> 998
    context.screenToProject = vi.fn(() => ({ x: 998, y: 500 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    expect((tool as any).currentX).toBe(1000); // Snapped to canvas edge
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 1000 });
  });

  it("should snap edges and center to guides during selection movement", () => {
    const tool = new SelectTool();

    // Setup existing selection 10x10 at 0,0
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };

    // Mock getSelectionCanvas to return a canvas with correct dimensions
    const mockCanvas = document.createElement("canvas");
    mockCanvas.width = 10;
    mockCanvas.height = 10;
    context.getSelectionCanvas = vi.fn(() => ({
      canvas: mockCanvas,
      ctx: mockCanvas.getContext("2d")!,
    }));

    // Mock isPointInSelection to return true so we can move it
    (tool as any).isPointInSelection = vi.fn(() => true);

    // Click at 5, 5 to start moving
    context.screenToProject = vi.fn(() => ({ x: 5, y: 5 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    // Move such that LEFT edge (x=0) is near guide (100)
    // dx should be 100. Mouse is at 105.
    context.screenToProject = vi.fn(() => ({ x: 104, y: 5 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    let lastCall = context.updateProject.mock.calls[context.updateProject.mock.calls.length - 1][0];
    expect(lastCall.selection.bounds.x).toBe(100);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });

    // Move such that CENTER (x+5) is near guide (100)
    // dx should be 95. Mouse is at 100.
    context.screenToProject = vi.fn(() => ({ x: 101, y: 5 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    lastCall = context.updateProject.mock.calls[context.updateProject.mock.calls.length - 1][0];
    expect(lastCall.selection.bounds.x + 5).toBe(100);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });

    // Move such that RIGHT edge (x+10) is near guide (100)
    // dx should be 90. Mouse is at 95.
    context.screenToProject = vi.fn(() => ({ x: 96, y: 5 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    lastCall = context.updateProject.mock.calls[context.updateProject.mock.calls.length - 1][0];
    expect(lastCall.selection.bounds.x + 10).toBe(100);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });

  it("should snap to canvas edges during selection movement", () => {
    const tool = new SelectTool();
    context.project.width = 1000;
    context.project.height = 1000;

    // Setup existing selection 10x10 at 500,500
    context.project.selection = {
      hasSelection: true,
      bounds: { x: 500, y: 500, width: 10, height: 10 },
    };

    // Mock getSelectionCanvas to return a canvas with correct dimensions
    const mockCanvas = document.createElement("canvas");
    mockCanvas.width = 10;
    mockCanvas.height = 10;
    context.getSelectionCanvas = vi.fn(() => ({
      canvas: mockCanvas,
      ctx: mockCanvas.getContext("2d")!,
    }));

    (tool as any).isPointInSelection = vi.fn(() => true);

    // Click at 505, 505
    context.screenToProject = vi.fn(() => ({ x: 505, y: 505 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);

    // Move such that RIGHT edge (x+10) is near canvas right edge (1000)
    // dx should be 490. Mouse is at 505 + 490 = 995.
    context.screenToProject = vi.fn(() => ({ x: 996, y: 505 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    const lastCall =
      context.updateProject.mock.calls[context.updateProject.mock.calls.length - 1][0];
    expect(lastCall.selection.bounds.x + 10).toBe(1000);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 1000 });
  });

  it("should NOT snap to guides if snapToGuides is false, but SHOULD snap to canvas edges", () => {
    const tool = new SelectTool();
    context.project.width = 1000;
    context.project.height = 1000;

    // Override mock to return snapToGuides: false
    (useUIStore.getState as any).mockReturnValue({ showGuides: true, snapToGuides: false });

    // 1. Try snapping to vertical guide (100) -> 102
    context.screenToProject = vi.fn(() => ({ x: 102, y: 50 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    expect((tool as any).startX).toBe(102); // Should NOT snap to 100
    expect((tool as any).activeSnapLines).toHaveLength(0);

    // 2. Try snapping to canvas edge (0) -> 2
    context.screenToProject = vi.fn(() => ({ x: 2, y: 50 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    expect((tool as any).startX).toBe(0); // SHOULD snap to 0
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 0 });

    // Restore mock
    (useUIStore.getState as any).mockReturnValue({ showGuides: true, snapToGuides: true });
  });
});
