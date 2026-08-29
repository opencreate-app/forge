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
            opacityStops: [
              { opacity: 1, position: 0 },
              { opacity: 1, position: 1 },
            ],
          },
          onApply,
        }}
        onOpenColorPicker={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select color stop at 100%" }));
    const position = screen.getByRole("spinbutton");
    fireEvent.change(position, { target: { value: "80" } });

    expect(position).toHaveValue(80);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.blur(position);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 0.8 },
        ],
        opacityStops: [
          { opacity: 1, position: 0 },
          { opacity: 1, position: 1 },
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
            opacityStops: [
              { opacity: 1, position: 0 },
              { opacity: 1, position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select color stop at 100%" }));
    const position = screen.getByRole("spinbutton");
    fireEvent.change(position, { target: { value: "75" } });
    fireEvent.blur(position);

    const project = useProjectStore.getState().projects[0];
    expect(project.layers[0].gradientFill?.colors[1]).toEqual({
      color: "#0000ff",
      position: 0.75,
    });
    expect(project.layers[0].gradientFill?.opacityStops).toEqual([
      { opacity: 1, position: 0 },
      { opacity: 1, position: 1 },
    ]);
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

    fireEvent.click(screen.getByRole("button", { name: "Select color stop at 100%" }));
    const position = screen.getByRole("spinbutton");
    fireEvent.change(position, { target: { value: "65" } });
    fireEvent.blur(position);

    const updatedLayer = useProjectStore.getState().projects[0].layers[0];
    expect(updatedLayer.visible).toBe(false);
    expect(updatedLayer.gradientFill?.colors[1].position).toBe(0.65);
    expect(updatedLayer.gradientFill?.opacityStops?.[1]).toEqual({ opacity: 1, position: 1 });
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

    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getByRole("spinbutton")).toHaveValue(25);
  });

  it("edits the selected opacity stop numerically", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Select opacity stop at 100%" }));
    const opacity = screen.getByRole("spinbutton", { name: "Gradient stop opacity" });
    fireEvent.change(opacity, {
      target: { value: "35" },
    });
    fireEvent.blur(opacity);

    expect(
      useProjectStore.getState().projects[0].layers[0].gradientFill?.opacityStops?.[1],
    ).toEqual({ opacity: 0.35, position: 1 });
    expect(useProjectStore.getState().projects[0].layers[0].gradientFill?.colors[1]).toEqual({
      color: "#0000ff",
      position: 1,
    });
  });

  it("drags stops, removes extra stops outside the track, and preserves the minimum", () => {
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
            opacityStops: [
              { opacity: 1, position: 0 },
              { opacity: 1, position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const track = screen.getByLabelText("Gradient stop editor");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({
        bottom: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        height: 100,
      }),
    });

    const gradientBeforeClick = useProjectStore.getState().projects[0].layers[0].gradientFill;
    const colorStop = screen.getByRole("button", { name: "Select color stop at 100%" });
    fireEvent.pointerDown(colorStop, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(colorStop, { clientX: 100, clientY: 100, pointerId: 1 });

    const opacityStop = screen.getByRole("button", { name: "Select opacity stop at 100%" });
    fireEvent.pointerDown(opacityStop, { clientX: 100, clientY: 0, pointerId: 2 });
    fireEvent.pointerUp(opacityStop, { clientX: 100, clientY: 0, pointerId: 2 });

    let gradient = useProjectStore.getState().projects[0].layers[0].gradientFill!;
    expect(gradient).toEqual(gradientBeforeClick);

    fireEvent.pointerDown(colorStop, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(colorStop, { clientX: 40, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(colorStop, { clientX: 40, clientY: 100, pointerId: 3 });

    fireEvent.pointerDown(opacityStop, { clientX: 100, clientY: 0, pointerId: 4 });
    fireEvent.pointerMove(opacityStop, { clientX: 60, clientY: 0, pointerId: 4 });
    fireEvent.pointerUp(opacityStop, { clientX: 60, clientY: 0, pointerId: 4 });

    gradient = useProjectStore.getState().projects[0].layers[0].gradientFill!;
    expect(gradient.colors[1].position).toBe(0.4);
    expect(gradient.opacityStops?.[1].position).toBe(0.6);

    fireEvent.doubleClick(track, { clientX: 50, clientY: 90 });
    const extraColorStop = screen.getByRole("button", { name: "Select color stop at 50%" });
    fireEvent.pointerDown(extraColorStop, { clientX: 50, clientY: 100, pointerId: 5 });
    fireEvent.pointerMove(extraColorStop, { clientX: 50, clientY: 115, pointerId: 5 });
    expect(useProjectStore.getState().projects[0].layers[0].gradientFill?.colors).toHaveLength(3);
    fireEvent.pointerMove(extraColorStop, { clientX: 50, clientY: 141, pointerId: 5 });

    gradient = useProjectStore.getState().projects[0].layers[0].gradientFill!;
    expect(gradient.colors).toHaveLength(2);
    fireEvent.pointerUp(extraColorStop, { clientX: 50, clientY: 141, pointerId: 5 });

    const firstColorStop = screen.getByRole("button", { name: "Select color stop at 0%" });
    fireEvent.pointerDown(firstColorStop, { clientX: 0, clientY: 100, pointerId: 6 });
    fireEvent.pointerMove(firstColorStop, { clientX: 0, clientY: 141, pointerId: 6 });

    expect(useProjectStore.getState().projects[0].layers[0].gradientFill?.colors).toHaveLength(2);
    fireEvent.pointerUp(firstColorStop, { clientX: 0, clientY: 141, pointerId: 6 });

    fireEvent.doubleClick(track, { clientX: 50, clientY: 10 });
    const extraOpacityStop = screen.getByRole("button", { name: "Select opacity stop at 50%" });
    fireEvent.pointerDown(extraOpacityStop, { clientX: 50, clientY: 0, pointerId: 7 });
    fireEvent.pointerMove(extraOpacityStop, { clientX: 50, clientY: -15, pointerId: 7 });
    expect(
      useProjectStore.getState().projects[0].layers[0].gradientFill?.opacityStops,
    ).toHaveLength(3);
    fireEvent.pointerMove(extraOpacityStop, { clientX: 50, clientY: -41, pointerId: 7 });

    gradient = useProjectStore.getState().projects[0].layers[0].gradientFill!;
    expect(gradient.opacityStops).toHaveLength(2);
    fireEvent.pointerUp(extraOpacityStop, { clientX: 50, clientY: -41, pointerId: 7 });

    const firstOpacityStop = screen.getByRole("button", { name: "Select opacity stop at 0%" });
    fireEvent.pointerDown(firstOpacityStop, { clientX: 0, clientY: 0, pointerId: 8 });
    fireEvent.pointerMove(firstOpacityStop, { clientX: 0, clientY: -41, pointerId: 8 });

    expect(
      useProjectStore.getState().projects[0].layers[0].gradientFill?.opacityStops,
    ).toHaveLength(2);
    fireEvent.pointerUp(firstOpacityStop, { clientX: 0, clientY: -41, pointerId: 8 });
  });

  it("shows a checkerboard behind transparent gradient areas", () => {
    render(
      <GradientEditorModal
        isOpen
        request={{
          target: "preset",
          initialPreset: {
            id: "transparent-gradient",
            name: "Transparent Gradient",
            type: "linear",
            colors: [
              { color: "#ff0000", position: 0 },
              { color: "#ff0000", position: 1 },
            ],
            opacityStops: [
              { opacity: 1, position: 0 },
              { opacity: 0, position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Gradient stop editor")).toHaveStyle({
      backgroundImage: expect.stringContaining("#454545"),
    });
  });

  it("creates independent color and opacity stops with double-click", () => {
    const project = useProjectStore.getState().projects[0];
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
            opacityStops: [
              { opacity: 1, position: 0 },
              { opacity: 1, position: 1 },
            ],
          },
        }}
        onOpenColorPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const track = screen.getByLabelText("Gradient stop editor");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });
    fireEvent.doubleClick(track, { clientX: 25, clientY: 10 });
    fireEvent.doubleClick(track, { clientX: 75, clientY: 90 });

    const updatedGradient = useProjectStore.getState().projects[0].layers[0].gradientFill!;
    expect(updatedGradient.opacityStops).toHaveLength(3);
    expect(updatedGradient.colors).toHaveLength(3);
    expect(updatedGradient.opacityStops).toContainEqual({ opacity: 1, position: 0.25 });
    expect(updatedGradient.colors).toContainEqual({ color: "#4000bf", position: 0.75 });
    expect(project.layers[0].gradientFill?.colors).toHaveLength(2);
  });
});
