import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ToolSettingInput from "@/renderer/components/ui/ToolSettingInput";

describe("ToolSettingInput", () => {
  it("keeps the initial value fixed while scrubbing the label", () => {
    const onChange = vi.fn();
    render(<ToolSettingInput label="Size" value={60} onChange={onChange} min={1} max={1000} />);

    fireEvent.mouseDown(screen.getByText("Size"), { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 101 });
    fireEvent.mouseMove(window, { clientX: 103 });
    fireEvent.mouseUp(window);

    expect(onChange).toHaveBeenNthCalledWith(1, 61, 60, expect.any(Number));
    expect(onChange).toHaveBeenNthCalledWith(2, 63, 60, expect.any(Number));
    expect(onChange.mock.calls[1][2]).toBe(onChange.mock.calls[0][2]);
  });

  it("keeps the initial value fixed while dragging the slider", () => {
    const onChange = vi.fn();
    render(<ToolSettingInput label="Size" value={60} onChange={onChange} min={1} max={1000} />);

    const numberInput = screen.getByDisplayValue("60");
    fireEvent.click(numberInput.parentElement!);
    const slider = screen.getByRole("slider");
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.change(slider, { target: { value: "61" } });
    fireEvent.change(slider, { target: { value: "63" } });

    expect(onChange).toHaveBeenNthCalledWith(1, 61, 60, expect.any(Number));
    expect(onChange).toHaveBeenNthCalledWith(2, 63, 60, expect.any(Number));
    expect(onChange.mock.calls[1][2]).toBe(onChange.mock.calls[0][2]);
  });

  it("uses the accelerated step while holding Shift", () => {
    const onChange = vi.fn();
    render(
      <ToolSettingInput
        label="Size"
        value={60}
        onChange={onChange}
        min={1}
        max={1000}
        shiftStep={4}
      />,
    );

    const label = screen.getByText("Size");
    const input = screen.getByDisplayValue("60");

    fireEvent.wheel(label.parentElement!, { deltaY: -1, shiftKey: true });
    fireEvent.mouseDown(label, { clientX: 100, shiftKey: true });
    fireEvent.mouseMove(window, { clientX: 101, shiftKey: true });
    fireEvent.mouseUp(window);
    fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true });

    expect(onChange.mock.calls.map(([nextValue]) => nextValue)).toEqual([64, 64, 64]);
  });
});
