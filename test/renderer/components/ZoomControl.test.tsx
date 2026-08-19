import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ZoomControl from "@/renderer/components/ZoomControl";
import { forgeEvents, FORGE_EVENTS } from "@/renderer/utils/events";
import { sliderValueToZoom, zoomToSliderValue } from "@/renderer/utils/zoomUtils";

describe("ZoomControl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the slider above the status control on a single click", () => {
    render(<ZoomControl zoom={1} />);

    expect(screen.queryByRole("slider", { name: "Zoom level" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));

    expect(screen.getByRole("slider", { name: "Zoom level" })).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.getByText("5000%")).toBeInTheDocument();
  });

  it("fits the canvas on double click", () => {
    const fitHandler = vi.fn();
    forgeEvents.addEventListener(FORGE_EVENTS.FIT_TO_SCREEN, fitHandler);

    render(<ZoomControl zoom={1} />);
    const button = screen.getByRole("button", { name: "Zoom" });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);

    expect(fitHandler).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("slider", { name: "Zoom level" })).toBeInTheDocument();

    forgeEvents.removeEventListener(FORGE_EVENTS.FIT_TO_SCREEN, fitHandler);
  });

  it("keeps the thumb at the dragged position while the canvas zoom animates", () => {
    const { rerender } = render(<ZoomControl zoom={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
    const slider = screen.getByRole("slider", { name: "Zoom level" });

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 110, pointerId: 1 });
    fireEvent.change(slider, { target: { value: "700" } });
    rerender(<ZoomControl zoom={0.5} />);

    expect(slider).toHaveValue("700");
  });

  it("resynchronizes the thumb when the popup is reopened", () => {
    const { rerender } = render(<ZoomControl zoom={1} />);
    const button = screen.getByRole("button", { name: "Zoom" });

    fireEvent.click(button);
    const slider = screen.getByRole("slider", { name: "Zoom level" });
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.change(slider, { target: { value: "700" } });

    fireEvent.click(button);
    rerender(<ZoomControl zoom={0.5} />);
    fireEvent.click(button);

    const reopenedSlider = screen.getByRole("slider", { name: "Zoom level" }) as HTMLInputElement;
    expect(Number(reopenedSlider.value)).toBeCloseTo(zoomToSliderValue(0.5), 5);
  });

  it("emits the minimum and maximum zoom values from the slider", () => {
    const zoomHandler = vi.fn();
    window.addEventListener("forge:zoom-to", zoomHandler);

    render(<ZoomControl zoom={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
    const slider = screen.getByRole("slider", { name: "Zoom level" });

    fireEvent.change(slider, { target: { value: "0" } });
    fireEvent.change(slider, { target: { value: "1000" } });

    expect(zoomHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        detail: expect.objectContaining({ zoom: 0.05, immediate: false }),
      }),
    );
    expect(zoomHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: expect.objectContaining({ zoom: 50, immediate: false }),
      }),
    );

    window.removeEventListener("forge:zoom-to", zoomHandler);
  });

  it("marks slider changes as immediate only after pointer movement", () => {
    const zoomHandler = vi.fn();
    window.addEventListener("forge:zoom-to", zoomHandler);

    render(<ZoomControl zoom={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
    const slider = screen.getByRole("slider", { name: "Zoom level" });

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    fireEvent.change(slider, { target: { value: "600" } });
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 2 });
    fireEvent.pointerMove(slider, { clientX: 110, pointerId: 2 });
    fireEvent.change(slider, { target: { value: "700" } });

    expect(zoomHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        detail: expect.objectContaining({ immediate: false }),
      }),
    );
    expect(zoomHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: expect.objectContaining({ immediate: true }),
      }),
    );

    window.removeEventListener("forge:zoom-to", zoomHandler);
  });

  it("uses logarithmic spacing across the zoom range", () => {
    expect(sliderValueToZoom(0)).toBe(0.05);
    expect(sliderValueToZoom(1000)).toBe(50);
    expect(sliderValueToZoom(500)).toBeCloseTo(1.581, 3);
    expect(zoomToSliderValue(0.05)).toBe(0);
    expect(zoomToSliderValue(1.581)).toBeCloseTo(500, 1);
    expect(zoomToSliderValue(50)).toBe(1000);
  });
});
