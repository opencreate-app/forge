import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ColorPickerModal from "@/renderer/components/modals/ColorPickerModal";
import { useToolStore } from "@/renderer/store/toolStore";
import { forgeEvents, FORGE_EVENTS } from "@/renderer/utils/events";

describe("ColorPickerModal", () => {
  beforeEach(() => {
    useToolStore.setState({ foregroundColor: "#000000", backgroundColor: "#ffffff" });
  });

  it("applies an edited hex color only after clicking OK", async () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    render(<ColorPickerModal isOpen initialColor="#000000" onApply={onApply} onClose={onClose} />);

    const hexInput = await screen.findByLabelText("Hex color");
    fireEvent.change(hexInput, { target: { value: "00ff00" } });

    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onApply).toHaveBeenCalledWith("#00ff00");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("discards edits on cancel", async () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(
      <ColorPickerModal
        isOpen
        initialColor="#ffffff"
        onApply={onApply}
        onCancel={onCancel}
        onClose={onClose}
      />,
    );

    const hexInput = await screen.findByLabelText("Hex color");
    fireEvent.change(hexInput, { target: { value: "ff0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("notifies the owner during editing when live preview is enabled", async () => {
    const onPreview = vi.fn();
    render(
      <ColorPickerModal
        isOpen
        initialColor="#000000"
        onPreview={onPreview}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const hexInput = await screen.findByLabelText("Hex color");
    fireEvent.change(hexInput, { target: { value: "336699" } });

    expect(onPreview).toHaveBeenLastCalledWith("#336699");
  });

  it("updates the temporary color when the canvas reports a sampled pixel", async () => {
    const onApply = vi.fn();
    render(<ColorPickerModal isOpen initialColor="#000000" onApply={onApply} onClose={vi.fn()} />);
    await screen.findByLabelText("Hex color");
    const picker = screen.getByRole("slider", { name: "Saturation and brightness" });
    const marker = picker.querySelector("div.h-4.w-4");

    forgeEvents.emit(FORGE_EVENTS.COLOR_SAMPLED, { r: 255, g: 0, b: 0, a: 255 });

    await waitFor(() => expect(screen.getByLabelText("Hex color")).toHaveValue("ff0000"));
    expect(marker).toHaveStyle({ left: "100%", top: "0%" });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("prevents a canvas sampling click from reaching the active tool", async () => {
    const canvas = document.createElement("canvas");
    canvas.id = "forge-canvas";
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });
    document.body.appendChild(canvas);

    const canvasMouseDown = vi.fn();
    const colorSampleRequest = vi.fn();
    canvas.addEventListener("mousedown", canvasMouseDown);
    forgeEvents.addEventListener(FORGE_EVENTS.REQUEST_COLOR_SAMPLE, colorSampleRequest);

    render(<ColorPickerModal isOpen initialColor="#000000" onApply={vi.fn()} onClose={vi.fn()} />);
    await screen.findByLabelText("Hex color");

    fireEvent.mouseDown(canvas, { button: 0, clientX: 50, clientY: 50 });

    expect(colorSampleRequest).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { x: 50, y: 50 } }),
    );
    expect(canvasMouseDown).not.toHaveBeenCalled();

    forgeEvents.removeEventListener(FORGE_EVENTS.REQUEST_COLOR_SAMPLE, colorSampleRequest);
    canvas.removeEventListener("mousedown", canvasMouseDown);
    canvas.remove();
  });

  it("continues calculating the selected color while dragging the picker", async () => {
    render(<ColorPickerModal isOpen initialColor="#000000" onApply={vi.fn()} onClose={vi.fn()} />);
    const picker = await screen.findByRole("slider", { name: "Saturation and brightness" });

    Object.defineProperty(picker, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });

    fireEvent.pointerDown(picker, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(picker, { clientX: 50, clientY: 50, pointerId: 1 });

    expect(screen.getByLabelText("Hex color")).toHaveValue("804040");
  });

  it("preserves the selected hue when the picker reaches zero brightness", async () => {
    render(<ColorPickerModal isOpen initialColor="#00ff00" onApply={vi.fn()} onClose={vi.fn()} />);
    const picker = await screen.findByRole("slider", { name: "Saturation and brightness" });

    Object.defineProperty(picker, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });

    fireEvent.pointerDown(picker, { clientX: 50, clientY: 100, pointerId: 1 });

    expect(screen.getByLabelText("Hex color")).toHaveValue("000000");
    expect(picker).toHaveStyle({ backgroundColor: "hsl(120, 100%, 50%)" });
  });

  it("continues dragging to the picker boundary until pointerup", async () => {
    render(<ColorPickerModal isOpen initialColor="#000000" onApply={vi.fn()} onClose={vi.fn()} />);
    const picker = await screen.findByRole("slider", { name: "Saturation and brightness" });

    Object.defineProperty(picker, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });
    const marker = picker.querySelector("div.rounded-full");
    expect(marker).toHaveClass("h-4", "w-4");

    fireEvent.pointerDown(picker, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(marker).toHaveClass("h-5", "w-5");
    fireEvent.pointerMove(picker, { clientX: 150, clientY: 0, pointerId: 1 });
    expect(screen.getByLabelText("Hex color")).toHaveValue("ff0000");

    fireEvent.pointerMove(picker, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(screen.getByLabelText("Hex color")).toHaveValue("ffffff");

    fireEvent.pointerUp(picker, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(picker, { clientX: 50, clientY: 50, pointerId: 1 });

    expect(marker).toHaveClass("h-4", "w-4");
    expect(screen.getByLabelText("Hex color")).toHaveValue("ffffff");
  });
});
