import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LayerList from "@/renderer/components/Sidebar/LayerList";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { createMockProject } from "../../mocks";

describe("LayerList", () => {
  beforeEach(() => {
    const source = createMockProject({
      id: "source-project",
      layers: [
        {
          ...createMockProject().layers[0],
          id: "source-layer",
          name: "Source layer",
        },
      ],
      activeLayerId: "source-layer",
      selectedLayerIds: ["source-layer"],
    });
    const target = createMockProject({
      id: "target-project",
      layers: [
        {
          ...createMockProject().layers[0],
          id: "target-layer",
          name: "Target layer",
        },
      ],
      activeLayerId: "target-layer",
      selectedLayerIds: ["target-layer"],
    });

    useProjectStore.setState({
      projects: [source, target],
      activeProjectId: source.id,
    });
    useUIStore.setState({ activeSidebarTab: "layers", isSidebarExpanded: true });
  });

  it("clears the dragged-layer feedback when the active project changes", async () => {
    render(<LayerList />);
    const sourceLayer = screen.getByText("Source layer").closest("[draggable='true']");
    expect(sourceLayer).not.toBeNull();

    fireEvent.dragStart(sourceLayer!, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: "copyMove",
      },
    });
    expect(sourceLayer).toHaveClass("opacity-30");

    act(() => {
      useProjectStore.getState().setActiveProject("target-project");
    });

    await waitFor(() => {
      const targetLayer = screen.getByText("Target layer").closest("[draggable='true']");
      expect(targetLayer).not.toHaveClass("opacity-30");
    });
  });
});
