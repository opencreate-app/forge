import { describe, it, expect, vi, beforeEach } from "vitest";
import { CropTool } from "@/core/tools/CropTool";
import { createMockToolContext } from "../../mocks";

vi.mock("@/renderer/store/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({ showGuides: true })),
    setState: vi.fn(),
  },
}));

describe("CropTool Snapping Fix", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    context.project.width = 1000;
    context.project.height = 1000;
    context.project.zoom = 1;
    context.project.guides = [{ id: "g1", type: "vertical", position: 100 }];
    context.project.selection = { hasSelection: false, bounds: null };
    context.settings.crop.mode = "Free";
  });

  it("should snap handle to guide exactly, even with click offset", () => {
    const tool = new CropTool();
    tool.onActivate(context);
    
    // Initial crop is 1000x1000 (0 to 1000)
    // The top-left handle is at 0, 0.
    
    // 1. Click at 5, 5 (offset from top-left handle center 0, 0)
    context.screenToProject = vi.fn(() => ({ x: 5, y: 5 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    
    // Verify that active handle is top-left
    expect((tool as any).activeHandle.name).toBe("top-left");
    // handleStartOffset should be 5, 5
    expect((tool as any).handleStartOffset).toEqual({ x: 5, y: 5 });

    // 2. Move mouse to 104, 50.
    // Ideally, handle center should be at 104 - 5 = 99.
    // 99 is within snap margin of guide 100.
    context.screenToProject = vi.fn(() => ({ x: 104, y: 50 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    // Get current top-left handle position
    const handles = (tool as any).getHandles(context);
    const tl = handles.find((h: any) => h.name === "top-left");
    
    // It should be EXACTLY at 100 (the guide)
    expect(tl.x).toBe(100);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
  });

  it("should hide snap line if aspect ratio constraint moves handle away from guide", () => {
    const tool = new CropTool();
    tool.onActivate(context);
    
    // Set fixed ratio 1:1
    context.settings.crop.mode = "Fixed Ratio";
    context.settings.crop.ratioW = 1;
    context.settings.crop.ratioH = 1;

    // Start drag from bottom-right (1000, 1000)
    // Click at 1000, 1000 (no offset)
    context.screenToProject = vi.fn(() => ({ x: 1000, y: 1000 }));
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as any, context);
    
    // Move near a vertical guide at 100 (from 1000)
    // But keep aspect ratio. If we snap X to 100, Y must also move significantly.
    // If we move mouse to 102, 800:
    // X is near 100? No, project is 1000. 102 is near 100.
    // If X snaps to 100, width becomes 900. Height must become 900.
    // So Y must move to 100 (since top is 0).
    // If mouse was at 800, Y would NOT snap to any horizontal guide.
    
    context.screenToProject = vi.fn(() => ({ x: 102, y: 800 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);

    const handles = (tool as any).getHandles(context);
    const br = handles.find((h: any) => h.name === "bottom-right");
    
    // With 1:1 ratio, mouse at 102, 800 results in scale ~0.45
    // br.x will be 450.
    expect(br.x).toBeCloseTo(450, 0);
    // Vertical snap line 100 should be HIDDEN because 450 !== 100
    expect((tool as any).activeSnapLines).not.toContainEqual({ type: "vertical", position: 100 });
    
    // Now move mouse to 102, 102. BOTH should snap and BE VALID.
    context.project.guides.push({ id: "g2", type: "horizontal", position: 100 });
    context.screenToProject = vi.fn(() => ({ x: 102, y: 102 }));
    tool.onMouseMove({ offsetX: 0, offsetY: 0 } as any, context);
    
    const handles2 = (tool as any).getHandles(context);
    const br2 = handles2.find((h: any) => h.name === "bottom-right");
    expect(br2.x).toBe(100);
    expect(br2.y).toBe(100);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 100 });
    expect((tool as any).activeSnapLines).toContainEqual({ type: "horizontal", position: 100 });
  });
});
