import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichTextToolbar } from "@/renderer/components/tools/RichTextToolbar";
import { useProjectStore } from "@/renderer/store/projectStore";
import { useTextEditorStore } from "@/renderer/store/textEditorStore";
import { createMockProject } from "../../mocks";

describe("RichTextToolbar", () => {
  beforeEach(() => {
    const project = createMockProject({
      id: "toolbar-project",
      activeLayerId: "text-layer",
      layers: [
        {
          id: "text-layer",
          name: "Text",
          type: "text",
          visible: true,
          locked: false,
          opacity: 100,
          fill: 100,
          x: 10,
          y: 20,
          width: 200,
          height: 80,
          blendMode: "source-over",
          text: "Toolbar",
          fontSize: 24,
        },
      ],
    });
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    useTextEditorStore.setState({
      isEditing: true,
      layerId: "text-layer",
      anchor: { x: 10, y: 20 },
      formatStart: 0,
      formatEnd: 7,
      isCtrlPressed: false,
    });
  });

  afterEach(() => {
    useTextEditorStore.getState().reset();
    useProjectStore.setState({ projects: [], activeProjectId: null });
  });

  it("aligns its left edge to the text anchor", () => {
    render(<RichTextToolbar onOpenColorPicker={vi.fn()} />);

    const toolbar = screen.getByRole("button", { name: "Bold" }).parentElement;
    expect(toolbar).toHaveStyle({
      left: "10px",
      transform: "translateY(-100%) translateY(-8px)",
    });
  });

  it("stays hidden while Ctrl is pressed", () => {
    useTextEditorStore.setState({ isCtrlPressed: true });

    render(<RichTextToolbar onOpenColorPicker={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Bold" })).not.toBeInTheDocument();
  });

  it("emits the numeric bold weight used by the TextTool options", () => {
    const handler = vi.fn();
    window.addEventListener("forge:text-format", handler);
    render(<RichTextToolbar onOpenColorPicker={vi.fn()} />);

    screen.getByRole("button", { name: "Bold" }).click();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { type: "setStyle", style: { fontWeight: "700" } },
      }),
    );
    window.removeEventListener("forge:text-format", handler);
  });

  it("keeps Bold active for weights at or above 500 and toggles them off", () => {
    useTextEditorStore.setState({ style: { fontWeight: "600" } });
    const handler = vi.fn();
    window.addEventListener("forge:text-format", handler);
    render(<RichTextToolbar onOpenColorPicker={vi.fn()} />);

    const boldButton = screen.getByRole("button", { name: "Bold" });
    expect(boldButton).toHaveAttribute("aria-pressed", "true");
    expect(boldButton.className).toContain("bg-accent");

    boldButton.click();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { type: "setStyle", style: { fontWeight: "400" } },
      }),
    );
    window.removeEventListener("forge:text-format", handler);
  });
});
