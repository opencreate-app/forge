import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore, Project } from "@/renderer/store/projectStore";

describe("projectStore reorderLayers", () => {
  const projectId = "p1";

  beforeEach(() => {
    // Clear projects
    const { projects } = useProjectStore.getState();
    projects.forEach((p) => useProjectStore.getState().removeProject(p.id));

    // Setup initial project with layers: L1, L2, L3, L4 (bottom to top in array)
    // Display order (top to bottom): L4, L3, L2, L1
    const newProject: Project = {
      id: projectId,
      name: "Test Project",
      width: 800,
      height: 600,
      layers: [
        {
          id: "L1",
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
        {
          id: "L2",
          name: "Layer 2",
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
        {
          id: "L3",
          name: "Layer 3",
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
        {
          id: "L4",
          name: "Layer 4",
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
      activeLayerId: "L4",
      selectedLayerIds: ["L4"],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      guides: [],
      undoStack: [],
      redoStack: [],
    };
    useProjectStore.getState().addProject(newProject);
  });

  const getLayerIds = () => {
    const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
    return project?.layers.map((l) => l.id) || [];
  };

  it("should move L1 above L2", () => {
    // Initial: [L1, L2, L3, L4]
    useProjectStore.getState().reorderLayers(projectId, ["L1"], "L2", "above");
    // Expected: [L2, L1, L3, L4]
    expect(getLayerIds()).toEqual(["L2", "L1", "L3", "L4"]);
  });

  it("should move L1 below L2 (no change as it's already below)", () => {
    // Initial: [L1, L2, L3, L4]
    useProjectStore.getState().reorderLayers(projectId, ["L1"], "L2", "below");
    // Expected: [L1, L2, L3, L4]
    expect(getLayerIds()).toEqual(["L1", "L2", "L3", "L4"]);
  });

  it("should move L4 below L2", () => {
    // Initial: [L1, L2, L3, L4]
    useProjectStore.getState().reorderLayers(projectId, ["L4"], "L2", "below");
    // Expected: [L1, L4, L2, L3]
    expect(getLayerIds()).toEqual(["L1", "L4", "L2", "L3"]);
  });

  it("should move multiple layers (L3, L4) below L2", () => {
    // Initial: [L1, L2, L3, L4]
    useProjectStore.getState().reorderLayers(projectId, ["L3", "L4"], "L2", "below");
    // Expected: [L1, L3, L4, L2]
    expect(getLayerIds()).toEqual(["L1", "L3", "L4", "L2"]);
  });

  it("should move multiple layers (L1, L2) above L3", () => {
    // Initial: [L1, L2, L3, L4]
    useProjectStore.getState().reorderLayers(projectId, ["L1", "L2"], "L3", "above");
    // Expected: [L3, L1, L2, L4]
    expect(getLayerIds()).toEqual(["L3", "L1", "L2", "L4"]);
  });

  it("should move L4 to bottom when target is null", () => {
    // Initial: [L1, L2, L3, L4]
    useProjectStore.getState().reorderLayers(projectId, ["L4"], null, "below");
    // Expected: [L4, L1, L2, L3]
    expect(getLayerIds()).toEqual(["L4", "L1", "L2", "L3"]);
  });
});
