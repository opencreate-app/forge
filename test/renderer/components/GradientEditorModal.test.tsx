import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GradientEditorModal from "@/renderer/components/modals/GradientEditorModal";
import { useProjectStore } from "@/renderer/store/projectStore";
import { createMockProject } from "../../mocks";

describe("GradientEditorModal", () => {
  beforeEach(() => {
    const project = createMockProject({
      id: "gradient-project",
      activeLayerId: "layer-1",
      layers: [
        {
          ...createMockProject().layers[0],
          type: "gradient_fill",
          gradientFill: {
            type: "linear",
            colors: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 1 },
            ],
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
          },
        },
      ],
    });
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
  });

  it("commits a color stop position only after the input loses focus", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <GradientEditorModal
        isOpen
        request={{
          target: "preset",
          initialPreset: {
            id: "layer-1",
            name: "Gradient",
            type: "linear",
            colors: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 1 },
            ],
          },
          onApply,
        }}
        onOpenColorPicker={vi.fn()}
        onClose={onClose}
      />,
    );

    const positions = screen.getAllByRole("spinbutton");
    fireEvent.change(positions[1], { target: { value: "80" } });

    expect(positions[1]).toHaveValue(80);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.blur(positions[1]);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 0.8 },
        ],
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("updates the active gradient layer while editing the modal", () => {
    render(
      <GradientEditorModal
        isOpen
        request={{
          target: "layer",
          projectId: "gradient-project",
          layerId: "layer-1",
          initialPreset: {
            id: "layer-1",
            name: "Gradient",
            type: "linear",
            colors: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const positions = screen.getAllByRole("spinbutton");
    fireEvent.change(positions[1], { target: { value: "75" } });
    fireEvent.blur(positions[1]);

    const project = useProjectStore.getState().projects[0];
    expect(project.layers[0].gradientFill?.colors[1]).toEqual({
      color: "#0000ff",
      position: 0.75,
    });
  });

  it("edits an invisible gradient layer without changing its visibility", () => {
    const project = useProjectStore.getState().projects[0];
    useProjectStore.setState({
      projects: [
        {
          ...project,
          layers: project.layers.map((layer) => ({ ...layer, visible: false })),
        },
      ],
    });

    render(
      <GradientEditorModal
        isOpen
        request={{
          target: "layer",
          projectId: "gradient-project",
          layerId: "layer-1",
          initialPreset: {
            id: "layer-1",
            name: "Gradient",
            type: "linear",
            colors: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const position = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(position, { target: { value: "65" } });
    fireEvent.blur(position);

    const updatedLayer = useProjectStore.getState().projects[0].layers[0];
    expect(updatedLayer.visible).toBe(false);
    expect(updatedLayer.gradientFill?.colors[1].position).toBe(0.65);
  });

  it("loads another active gradient layer without closing", () => {
    const project = useProjectStore.getState().projects[0];
    const secondLayer = {
      ...project.layers[0],
      id: "layer-2",
      name: "Second Gradient",
      gradientFill: {
        ...project.layers[0].gradientFill!,
        colors: [
          { color: "#00ff00", position: 0.25 },
          { color: "#ffffff", position: 0.75 },
        ],
      },
    };
    useProjectStore.setState({
      projects: [{ ...project, layers: [...project.layers, secondLayer] }],
    });

    render(
      <GradientEditorModal
        isOpen
        request={{
          target: "layer",
          projectId: "gradient-project",
          layerId: "layer-1",
          initialPreset: {
            id: "layer-1",
            name: "Gradient",
            type: "linear",
            colors: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    act(() => {
      useProjectStore.getState().setActiveLayer("gradient-project", "layer-2");
    });

    expect(screen.getAllByRole("spinbutton").map((input) => input)).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(25);
    expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(75);
  });
});
