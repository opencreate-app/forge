import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore, Project } from "@/renderer/store/projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    const { projects } = useProjectStore.getState();
    projects.forEach((p) => useProjectStore.getState().removeProject(p.id));
  });

  it("should add a new project", () => {
    const store = useProjectStore.getState();
    const newProject: Project = {
      id: "p1",
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [],
      activeLayerId: null,
      selectedLayerIds: [],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    };
    expect(store.addProject(newProject)).toBe("p1");
    expect(store.addProject({ ...newProject, name: "Duplicate" })).toBe("p1");
    expect(useProjectStore.getState().projects).toHaveLength(1);
  });

  it("should import cloned layers into another project while preserving group hierarchy", () => {
    const sourceProject: Project = {
      id: "source",
      name: "Source",
      width: 800,
      height: 600,
      layers: [
        {
          id: "group-1",
          name: "Group",
          type: "group",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
        {
          id: "layer-1",
          name: "Artwork",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          data: "data:image/png;base64,artwork",
          parentId: "group-1",
          blendMode: "source-over",
        },
      ],
      guides: [],
      activeLayerId: "layer-1",
      selectedLayerIds: ["group-1", "layer-1"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    };
    const targetProject: Project = {
      ...sourceProject,
      id: "target",
      name: "Target",
      layers: [],
      activeLayerId: null,
      selectedLayerIds: [],
    };

    const store = useProjectStore.getState();
    store.addProject(sourceProject);
    store.addProject(targetProject);
    store.importLayersFromProject("source", "target", ["group-1", "layer-1"]);

    const source = useProjectStore.getState().projects.find((project) => project.id === "source")!;
    const target = useProjectStore.getState().projects.find((project) => project.id === "target")!;
    const importedGroup = target.layers.find((layer) => layer.type === "group")!;
    const importedLayer = target.layers.find((layer) => layer.type === "raster")!;

    expect(source.layers.map((layer) => layer.id)).toEqual(["group-1", "layer-1"]);
    expect(importedGroup.id).not.toBe("group-1");
    expect(importedLayer.id).not.toBe("layer-1");
    expect(importedLayer.parentId).toBe(importedGroup.id);
    expect(importedLayer.data).toBe("data:image/png;base64,artwork");
    expect(target.selectedLayerIds).toEqual(target.layers.map((layer) => layer.id));
    expect(target.activeLayerId).toBe(importedLayer.id);
    expect(target.isDirty).toBe(true);
    expect(target.undoStack.at(-1)?.description).toBe("Import Layers");
  });

  it("should insert a new layer above the active layer", () => {
    const store = useProjectStore.getState();
    const projectId = "p1";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "l1",
          name: "Layer 1",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          blendMode: "source-over",
        },
        {
          id: "l2",
          name: "Layer 2",
          visible: true,
          type: "raster",
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
      activeLayerId: "l1",
      selectedLayerIds: ["l1"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    // Add layer above l1
    store.addLayer(projectId, { type: "raster", name: "New Layer" }, false, "l1");

    const project = useProjectStore.getState().projects[0];

    // Layers should be [l1, New Layer, l2]
    expect(project.layers).toHaveLength(3);
    expect(project.layers[0].id).toBe("l1");
    expect(project.layers[1].name).toBe("New Layer");
    expect(project.layers[2].id).toBe("l2");
  });

  it("should isolate a layer and restore all", () => {
    const store = useProjectStore.getState();
    const projectId = "p1";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "l1",
          name: "Layer 1",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          blendMode: "source-over",
        },
        {
          id: "l2",
          name: "Layer 2",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          blendMode: "source-over",
        },
        {
          id: "l3",
          name: "Layer 3",
          visible: true,
          type: "raster",
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
      activeLayerId: "l1",
      selectedLayerIds: ["l1"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    // Isolate l1
    store.isolateLayer(projectId, "l1");
    let project = useProjectStore.getState().projects[0];
    expect(project.layers.find((l) => l.id === "l1")?.visible).toBe(true);
    expect(project.layers.find((l) => l.id === "l2")?.visible).toBe(false);
    expect(project.layers.find((l) => l.id === "l3")?.visible).toBe(false);
    expect(project.undoStack.slice(-1)[0].description).toBe("Isolate Layer");

    // Restore all (by isolating l1 again)
    store.isolateLayer(projectId, "l1");
    project = useProjectStore.getState().projects[0];
    expect(project.layers.every((l) => l.visible)).toBe(true);
    expect(project.undoStack.slice(-1)[0].description).toBe("Show All Layers");
  });

  it("should group layers and ungroup them", () => {
    const store = useProjectStore.getState();
    const projectId = "p1";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "l1",
          name: "Layer 1",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          blendMode: "source-over",
        },
        {
          id: "l2",
          name: "Layer 2",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          blendMode: "source-over",
        },
        {
          id: "l3",
          name: "Layer 3",
          visible: true,
          type: "raster",
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
      activeLayerId: "l1",
      selectedLayerIds: ["l1", "l2"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    // Group l1 and l2
    store.groupLayers(projectId, ["l1", "l2"]);
    let project = useProjectStore.getState().projects[0];
    const groupLayer = project.layers.find((l) => l.type === "group");
    expect(groupLayer).toBeDefined();
    expect(project.layers.find((l) => l.id === "l1")?.parentId).toBe(groupLayer?.id);
    expect(project.layers.find((l) => l.id === "l2")?.parentId).toBe(groupLayer?.id);
    expect(project.undoStack.slice(-1)[0].description).toBe("Group Layers");

    // Ungroup
    store.ungroupLayers(projectId, groupLayer!.id);
    project = useProjectStore.getState().projects[0];
    expect(project.layers.find((l) => l.type === "group")).toBeUndefined();
    expect(project.layers.find((l) => l.id === "l1")?.parentId).toBeNull();
    expect(project.undoStack.slice(-1)[0].description).toBe("Ungroup Layers");
  });

  it("should convert layers to a smart object and rasterize it", async () => {
    const store = useProjectStore.getState();
    const projectId = "p1";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "l1",
          name: "Layer 1",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 10,
          y: 10,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
        {
          id: "l2",
          name: "Layer 2",
          visible: true,
          type: "raster",
          locked: false,
          opacity: 100,
          fill: 100,
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
      ],
      activeLayerId: "l1",
      selectedLayerIds: ["l1", "l2"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    // Convert to Smart Object
    await store.convertToSmartObject(projectId, ["l1", "l2"]);
    let project = useProjectStore.getState().projects[0];
    const smartLayer = project.layers.find((l) => l.type === "smart_object");

    expect(smartLayer).toBeDefined();
    expect(smartLayer?.width).toBe(140); // MaxX(150) - MinX(10) = 140
    expect(smartLayer?.height).toBe(140);
    expect(smartLayer?.x).toBe(10);
    expect(smartLayer?.y).toBe(10);
    expect(smartLayer?.dataObject).toBeDefined();
    expect(smartLayer?.dataObject?.layers).toHaveLength(2);
    expect(smartLayer?.dataObject?.layers[0].x).toBe(0); // 10 - 10
    expect(smartLayer?.dataObject?.layers[1].x).toBe(40); // 50 - 10

    // Rasterize
    store.rasterizeSmartObject(projectId, smartLayer!.id);
    project = useProjectStore.getState().projects[0];
    const rasterizedLayer = project.layers.find((l) => l.id === smartLayer!.id);
    expect(rasterizedLayer?.type).toBe("raster");
    expect(rasterizedLayer?.dataObject).toBeUndefined();
  });

  it("should remove multiple layers and their descendants", () => {
    const store = useProjectStore.getState();
    const projectId = "p1";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "g1",
          name: "Group 1",
          type: "group",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          blendMode: "source-over",
        },
        {
          id: "l1",
          name: "Layer 1",
          parentId: "g1",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
        {
          id: "l2",
          name: "Layer 2",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
        {
          id: "l3",
          name: "Layer 3",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
      ],
      activeLayerId: "l3",
      selectedLayerIds: ["g1", "l2"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    // Remove g1 (group with l1) and l2
    store.removeLayers(projectId, ["g1", "l2"]);
    const project = useProjectStore.getState().projects[0];
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0].id).toBe("l3");
    expect(project.activeLayerId).toBe("l3");
    expect(project.selectedLayerIds).toEqual(["l3"]);
  });

  it("should duplicate multiple layers and maintain hierarchy", () => {
    const store = useProjectStore.getState();
    const projectId = "p1";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "g1",
          name: "Group 1",
          type: "group",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          blendMode: "source-over",
        },
        {
          id: "l1",
          name: "Layer 1",
          parentId: "g1",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
        {
          id: "l2",
          name: "Layer 2",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          blendMode: "source-over",
        },
      ],
      activeLayerId: "l2",
      selectedLayerIds: ["g1", "l2"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    // Duplicate g1 (with l1) and l2
    store.duplicateLayers(projectId, ["g1", "l2"]);
    const project = useProjectStore.getState().projects[0];

    // Original layers: [g1, l1, l2]
    // Duplicated g1 (with l1') after g1,l1: [g1, l1, g1', l1', l2]
    // Duplicated l2' after l2: [g1, l1, g1', l1', l2, l2']
    expect(project.layers).toHaveLength(6);

    const g1Copy = project.layers.find((l) => l.name === "Group 1 copy");
    const l1Copy = project.layers.find((l) => l.parentId === g1Copy?.id);
    const l2Copy = project.layers.find((l) => l.name === "Layer 2 copy");

    expect(g1Copy).toBeDefined();
    expect(l1Copy).toBeDefined();
    expect(l1Copy?.name).toBe("Layer 1"); // Nested children shouldn't have "copy" suffix
    expect(l2Copy).toBeDefined();

    expect(project.selectedLayerIds).toEqual([g1Copy?.id, l2Copy?.id]);
  });

  it("should duplicate layers without adding an intermediate history entry", () => {
    const store = useProjectStore.getState();
    const projectId = "p-no-duplicate-history";
    store.addProject({
      id: projectId,
      name: "Test Project",
      width: 100,
      height: 100,
      layers: [
        {
          id: "layer",
          name: "Layer",
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
      ],
      activeLayerId: "layer",
      selectedLayerIds: ["layer"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    });

    const initialHistoryLength = useProjectStore
      .getState()
      .projects.find((p) => p.id === projectId)!.undoStack.length;
    const createdIds = store.duplicateLayers(projectId, ["layer"], true);
    const project = useProjectStore.getState().projects.find((p) => p.id === projectId)!;

    expect(createdIds).toHaveLength(1);
    expect(project.layers).toHaveLength(2);
    expect(project.undoStack).toHaveLength(initialHistoryLength);
    expect(project.selectedLayerIds).toEqual(createdIds);
  });

  it("should resize project, scale layer coordinates and dimensions, scale guides, and keep history", async () => {
    const store = useProjectStore.getState();
    const projectId = "p-resize";
    store.addProject({
      id: projectId,
      name: "Test Resize Project",
      width: 100,
      height: 100,
      layers: [
        {
          id: "raster-layer",
          name: "Raster Layer",
          type: "raster",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 10,
          y: 20,
          width: 50,
          height: 60,
          blendMode: "source-over",
        },
        {
          id: "text-layer",
          name: "Text Layer",
          type: "text",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 5,
          y: 5,
          width: 40,
          height: 20,
          fontSize: 12,
          tracking: 2,
          blendMode: "source-over",
        },
      ],
      activeLayerId: "raster-layer",
      selectedLayerIds: ["raster-layer"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [
        { id: "g-h", type: "horizontal", position: 30 },
        { id: "g-v", type: "vertical", position: 40 },
      ],
      undoStack: [{ description: "Initial State", state: {} as any }],
      redoStack: [],
    });

    // Resize from 100x100 to 200x300 (scaleX = 2, scaleY = 3)
    await store.resizeProject(projectId, 200, 300, "nearest");

    const project = useProjectStore.getState().projects.find((p) => p.id === projectId)!;
    expect(project.width).toBe(200);
    expect(project.height).toBe(300);

    // Raster layer: original x: 10 -> 20, y: 20 -> 60, width: 50 -> 100, height: 60 -> 180
    const raster = project.layers.find((l) => l.id === "raster-layer")!;
    expect(raster.x).toBe(20);
    expect(raster.y).toBe(60);
    expect(raster.width).toBe(100);
    expect(raster.height).toBe(180);

    // Text layer: original x: 5 -> 10, y: 5 -> 15, width: 40 -> 80, height: 20 -> 60, fontSize: 12 -> 36, tracking: 2 -> 4
    const text = project.layers.find((l) => l.id === "text-layer")!;
    expect(text.x).toBe(10);
    expect(text.y).toBe(15);
    expect(text.width).toBe(80);
    expect(text.height).toBe(60);
    expect(text.fontSize).toBe(36);
    expect(text.tracking).toBe(4);

    // Guides: original horizontal position: 30 * 3 = 90, vertical position: 40 * 2 = 80
    const gh = project.guides.find((g) => g.id === "g-h")!;
    const gv = project.guides.find((g) => g.id === "g-v")!;
    expect(gh.position).toBe(90);
    expect(gv.position).toBe(80);

    // History: should have pushed history entry
    expect(project.undoStack).toHaveLength(2);
    expect(project.undoStack[1].description).toBe("Image Size");

    // Revert using undo
    store.undo(projectId);
    const revertedProject = useProjectStore.getState().projects.find((p) => p.id === projectId)!;
    expect(revertedProject.width).toBe(100);
    expect(revertedProject.height).toBe(100);

    const revertedRaster = revertedProject.layers.find((l) => l.id === "raster-layer")!;
    expect(revertedRaster.x).toBe(10);
    expect(revertedRaster.y).toBe(20);
    expect(revertedRaster.width).toBe(50);
    expect(revertedRaster.height).toBe(60);
  });
});
