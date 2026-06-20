import { describe, it, expect, vi, beforeEach } from "vitest";
import { MoveTool } from "@/core/tools/MoveTool";
import { createMockToolContext, createMockProject } from "../../mocks";
import { useUIStore } from "@/renderer/store/uiStore";

describe("MoveTool Snapping", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
    // Reset UI Store to defaults
    useUIStore.setState({
      showGuides: true,
      snapToGuides: true,
      snapToLayers: true,
    });
  });

  it("should snap a layer to another layer's edge", () => {
    const tool = new MoveTool();
    const project = createMockProject();
    project.width = 1000;
    project.height = 1000;
    project.layers = [
      {
        id: "target",
        name: "Target",
        x: 500,
        y: 500,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
      {
        id: "moving",
        name: "Moving",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
    ];
    project.activeLayerId = "moving";
    project.selectedLayerIds = ["moving"];
    project.zoom = 1;
    context.project = project;

    // Ensure mocks use the current project
    context.isLayerVisible = vi.fn(
      (id) => project.layers.find((l) => l.id === id)?.visible ?? false,
    );
    context.isLayerLocked = vi.fn((id) => project.layers.find((l) => l.id === id)?.locked ?? false);

    // Start drag at (100, 100)
    context.screenToProject = vi.fn().mockReturnValue({ x: 100, y: 100 });
    tool.onMouseDown({ button: 0, offsetX: 100, offsetY: 100 } as MouseEvent, context);

    // Move to (398, 100) - Should snap "moving" right edge (which would be at 498) to "target" left edge (500)
    // dx = 398 - 100 = 298.
    // Initial right edge = 200. New right edge = 200 + 298 = 498.
    // Snap margin is 4 pixels. 498 is within 4 pixels of 500.
    context.screenToProject = vi.fn().mockReturnValue({ x: 398, y: 100 });
    tool.onMouseMove({ offsetX: 398, offsetY: 100 } as MouseEvent, context);

    const updateCall = context.updateProject.mock.calls.find((call: any) => call[0].layers);
    const updatedMovingLayer = updateCall[0].layers.find((l: any) => l.id === "moving");

    // Expected dx should be 300 (to make right edge 500), so new x should be 100 + 300 = 400.
    // Initial x was 100. dx = 500 - 200 = 300. New x = 100 + 300 = 400.
    expect(updatedMovingLayer.x).toBe(400);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 500 });
  });

  it("should snap a layer to another layer's center", () => {
    const tool = new MoveTool();
    const project = createMockProject();
    project.width = 1000;
    project.height = 1000;
    project.layers = [
      {
        id: "target",
        name: "Target",
        x: 500,
        y: 500,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
      {
        id: "moving",
        name: "Moving",
        x: 0,
        y: 0,
        width: 80, // Different width to avoid simultaneous edge/center snap
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
    ];
    project.activeLayerId = "moving";
    project.selectedLayerIds = ["moving"];
    project.zoom = 1;
    context.project = project;

    // Ensure mocks use the current project
    context.isLayerVisible = vi.fn(
      (id) => project.layers.find((l) => l.id === id)?.visible ?? false,
    );
    context.isLayerLocked = vi.fn((id) => project.layers.find((l) => l.id === id)?.locked ?? false);

    // Target vertical center is 550 (500 + 100/2)
    // Moving initial vertical center is 40 (0 + 80/2)

    // Start drag at (0, 0)
    context.screenToProject = vi.fn().mockReturnValue({ x: 0, y: 0 });
    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);

    // Move to (509, 0)
    // New moving center would be 40 + 509 = 549. Dist to 550 is 1.
    // New moving left edge would be 0 + 509 = 509. Dist to 500 is 9.
    // Center snap is closer.
    context.screenToProject = vi.fn().mockReturnValue({ x: 509, y: 0 });
    tool.onMouseMove({ offsetX: 509, offsetY: 0 } as MouseEvent, context);

    const updateCall = context.updateProject.mock.calls.find((call: any) => call[0].layers);
    const updatedMovingLayer = updateCall[0].layers.find((l: any) => l.id === "moving");

    // Expected dx = 510 (550 - 40). New x = 0 + 510 = 510.
    expect(updatedMovingLayer.x).toBe(510);
    expect((tool as any).activeSnapLines).toContainEqual({ type: "vertical", position: 550 });
  });

  it("should NOT snap if snapToLayers is disabled", () => {
    useUIStore.setState({ snapToLayers: false });

    const tool = new MoveTool();
    const project = createMockProject();
    project.width = 1000;
    project.height = 1000;
    project.layers = [
      {
        id: "target",
        name: "Target",
        x: 500,
        y: 500,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
      {
        id: "moving",
        name: "Moving",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
    ];
    project.activeLayerId = "moving";
    project.selectedLayerIds = ["moving"];
    project.zoom = 1;
    context.project = project;

    // Ensure mocks use the current project
    context.isLayerVisible = vi.fn(
      (id) => project.layers.find((l) => l.id === id)?.visible ?? false,
    );
    context.isLayerLocked = vi.fn((id) => project.layers.find((l) => l.id === id)?.locked ?? false);

    context.screenToProject = vi.fn().mockReturnValue({ x: 100, y: 100 });
    tool.onMouseDown({ button: 0, offsetX: 100, offsetY: 100 } as MouseEvent, context);

    // Move to (300, 100) - Should not snap to anything (Canvas center is at 500)
    context.screenToProject = vi.fn().mockReturnValue({ x: 300, y: 100 });
    tool.onMouseMove({ offsetX: 300, offsetY: 100 } as MouseEvent, context);

    const updateCall = context.updateProject.mock.calls.find((call: any) => call[0].layers);
    const updatedMovingLayer = updateCall[0].layers.find((l: any) => l.id === "moving");

    // Should NOT snap, so x should be 100 + (300 - 100) = 300.
    expect(updatedMovingLayer.x).toBe(300);
    expect((tool as any).activeSnapLines).not.toContainEqual({ type: "vertical", position: 500 });
  });
});
