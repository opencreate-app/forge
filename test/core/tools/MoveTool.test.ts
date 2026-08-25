import { describe, it, expect, vi, beforeEach } from "vitest";
import { MoveTool } from "@/core/tools/MoveTool";
import { createMockToolContext, createMockProject } from "../../mocks";

describe("MoveTool", () => {
  let context: any;

  beforeEach(() => {
    context = createMockToolContext();
  });

  it("should move a layer", () => {
    const tool = new MoveTool();
    const project = createMockProject();
    context.project = project;

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
    context.screenToProject = vi.fn(() => ({ x: 20, y: 25 }));
    tool.onMouseMove({ offsetX: 20, offsetY: 25 } as MouseEvent, context);

    expect(context.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: expect.arrayContaining([expect.objectContaining({ x: 10, y: 15 })]),
      }),
    );
  });

  it("should move multiple selected layers", () => {
    const tool = new MoveTool();
    const project = createMockProject();
    project.layers = [
      {
        id: "1",
        name: "L1",
        x: 0,
        y: 0,
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
        id: "2",
        name: "L2",
        x: 10,
        y: 10,
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
    project.selectedLayerIds = ["1", "2"];
    context.project = project;

    context.screenToProject = vi
      .fn()
      .mockReturnValueOnce({ x: 0, y: 0 })
      .mockReturnValue({ x: 10, y: 10 });

    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);
    tool.onMouseMove({ offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(context.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: [
          expect.objectContaining({ id: "1", x: 10, y: 10 }),
          expect.objectContaining({ id: "2", x: 20, y: 20 }),
        ],
      }),
    );
  });

  it("should duplicate the current selection and move the copy with Alt+Drag", async () => {
    const tool = new MoveTool();
    const project = createMockProject({
      layers: [
        {
          id: "source",
          name: "Source",
          x: 20,
          y: 30,
          width: 100,
          height: 80,
          type: "raster",
          visible: true,
          locked: false,
          blendMode: "source-over",
          opacity: 100,
          fill: 100,
        },
      ],
      activeLayerId: "source",
      selectedLayerIds: ["source"],
    });
    context.project = project;
    context.duplicateLayers = vi.fn((layerIds: string[]) => {
      const source = project.layers.find((layer) => layer.id === layerIds[0])!;
      const copy = { ...source, id: "copy", name: "Source copy" };
      project.layers = [...project.layers, copy];
      project.activeLayerId = copy.id;
      project.selectedLayerIds = [copy.id];
      return [copy.id];
    });
    context.screenToProject = vi
      .fn()
      .mockReturnValueOnce({ x: 30, y: 40 })
      .mockReturnValue({ x: 40, y: 55 });

    await tool.onMouseDown(
      { button: 0, offsetX: 30, offsetY: 40, altKey: true } as MouseEvent,
      context,
    );
    tool.onMouseMove({ offsetX: 40, offsetY: 55 } as MouseEvent, context);
    tool.onMouseUp({ offsetX: 40, offsetY: 55 } as MouseEvent, context);

    const moveUpdate = context.updateProject.mock.calls.find((call: any[]) => call[0].layers)?.[0];
    expect(context.duplicateLayers).toHaveBeenCalledWith(["source"], true);
    expect(moveUpdate.layers.find((layer: any) => layer.id === "source")).toMatchObject({
      x: 20,
      y: 30,
    });
    expect(moveUpdate.layers.find((layer: any) => layer.id === "copy")).toMatchObject({
      x: 30,
      y: 45,
    });
    expect(project.selectedLayerIds).toEqual(["copy"]);
    expect(context.addHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Move Tool" }),
    );
  });

  it("should not duplicate on an Alt click without movement", async () => {
    const tool = new MoveTool();
    context.screenToProject = vi.fn().mockReturnValue({ x: 10, y: 10 });

    await tool.onMouseDown(
      { button: 0, offsetX: 10, offsetY: 10, altKey: true } as MouseEvent,
      context,
    );
    tool.onMouseUp({ offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(context.duplicateLayers).not.toHaveBeenCalled();
    expect(context.addHistoryEntry).not.toHaveBeenCalled();
  });

  it("should move group children when moving a group", () => {
    const tool = new MoveTool();
    const project = createMockProject();
    project.layers = [
      {
        id: "g1",
        name: "Group",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        type: "group",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
      {
        id: "l1",
        name: "Child",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: false,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
        parentId: "g1",
      },
    ];
    project.selectedLayerIds = ["g1"];
    context.project = project;

    context.screenToProject = vi
      .fn()
      .mockReturnValueOnce({ x: 0, y: 0 })
      .mockReturnValue({ x: 10, y: 10 });

    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);
    tool.onMouseMove({ offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(context.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: [
          expect.objectContaining({ id: "g1", x: 10, y: 10 }),
          expect.objectContaining({ id: "l1", x: 60, y: 60 }),
        ],
      }),
    );
  });

  it("should not move locked layers", () => {
    const tool = new MoveTool();
    const project = createMockProject();
    project.layers = [
      {
        id: "l1",
        name: "Locked",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        type: "raster",
        visible: true,
        locked: true,
        blendMode: "source-over",
        opacity: 100,
        fill: 100,
      },
      {
        id: "l2",
        name: "Normal",
        x: 0,
        y: 0,
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
    project.selectedLayerIds = ["l1", "l2"];
    context.project = project;
    context.isLayerLocked = vi.fn((id) => id === "l1");

    context.screenToProject = vi
      .fn()
      .mockReturnValueOnce({ x: 0, y: 0 })
      .mockReturnValue({ x: 10, y: 10 });

    tool.onMouseDown({ button: 0, offsetX: 0, offsetY: 0 } as MouseEvent, context);
    tool.onMouseMove({ offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(context.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: [
          expect.objectContaining({ id: "l1", x: 0, y: 0 }),
          expect.objectContaining({ id: "l2", x: 10, y: 10 }),
        ],
      }),
    );
  });
});
