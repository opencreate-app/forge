import { describe, expect, it, vi } from "vitest";
import { TransformTool } from "@/core/tools/TransformTool";
import { Layer, Project } from "@/renderer/store/projectStore";

describe("TransformTool", () => {
  it("should scale child positions around the group anchor when applying", async () => {
    const group: Layer = {
      id: "group",
      name: "Group",
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
    };
    const firstChild: Layer = {
      ...group,
      id: "first",
      type: "color_fill",
      parentId: group.id,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      colorFill: { color: "#fff" },
    };
    const secondChild: Layer = {
      ...firstChild,
      id: "second",
      x: 20,
    };
    const project = {
      layers: [group, firstChild, secondChild],
    } as Project;
    const updateProject = vi.fn();
    const tool = new TransformTool();

    (tool as any).originalLayer = group;
    (tool as any).currentTransform = {
      x: 30,
      y: 5,
      width: 30,
      height: 10,
      scaleX: 2,
      scaleY: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
      isDirty: true,
    };

    await tool.apply({
      project,
      pushHistory: vi.fn(),
      updateProject,
      setActiveTool: vi.fn(),
    } as any);

    const updatedLayers = updateProject.mock.calls[0][0].layers as Layer[];
    expect(updatedLayers.find((layer) => layer.id === "first")).toMatchObject({
      x: 0,
      width: 20,
    });
    expect(updatedLayers.find((layer) => layer.id === "second")).toMatchObject({
      x: 40,
      width: 20,
    });
  });
});
