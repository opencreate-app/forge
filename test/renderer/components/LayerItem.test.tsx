import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LayerItem from "@/renderer/components/Sidebar/LayerItem";
import { useProjectStore, type Layer, type Project } from "@/renderer/store/projectStore";
import { useUIStore } from "@/renderer/store/uiStore";

const createProject = (layer: Layer): Project => ({
  id: "project-1",
  name: "Project",
  width: 100,
  height: 100,
  layers: [layer],
  guides: [],
  activeLayerId: layer.id,
  activeMaskId: null,
  selectedLayerIds: [layer.id],
  selection: { hasSelection: false, bounds: null },
  zoom: 1,
  panX: 0,
  panY: 0,
  isDirty: false,
  undoStack: [],
  redoStack: [],
});

const colorFillLayer: Layer = {
  id: "fill-1",
  name: "Fill",
  type: "color_fill",
  visible: true,
  locked: false,
  opacity: 100,
  fill: 100,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  blendMode: "source-over",
  colorFill: { color: "#12ab34" },
  mask: {
    data: "data:image/png;base64,mask",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    enabled: true,
    linked: true,
  },
};

describe("LayerItem", () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [createProject(colorFillLayer)],
      activeProjectId: "project-1",
    });
    useUIStore.setState({ stylingLayerId: null });
  });

  it("opens the color fill modal when its visual thumbnail is double-clicked", () => {
    const onOpenColorPicker = vi.fn();
    window.addEventListener("forge:open-color-picker-for-layer", onOpenColorPicker);

    const view = render(
      <LayerItem
        layer={colorFillLayer}
        projectId="project-1"
        isActive
        isSelected
        index={0}
        depth={0}
        isInheritedHidden={false}
        draggedIndex={null}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onClick={vi.fn()}
        onVisibilityMouseDown={vi.fn()}
        onVisibilityMouseEnter={vi.fn()}
        onToggleExpansion={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    const thumbnails = view.container.querySelectorAll("div.w-8.h-8");
    fireEvent.doubleClick(thumbnails[0]);

    expect(useUIStore.getState().stylingLayerId).toBeNull();
    expect(onOpenColorPicker).toHaveBeenCalledOnce();
    expect(onOpenColorPicker.mock.calls[0][0].detail).toEqual({
      projectId: "project-1",
      layerId: "fill-1",
    });

    fireEvent.doubleClick(thumbnails[1]);
    expect(onOpenColorPicker).toHaveBeenCalledOnce();

    window.removeEventListener("forge:open-color-picker-for-layer", onOpenColorPicker);
  });
});
