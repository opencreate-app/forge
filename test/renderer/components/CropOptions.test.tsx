import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CropOptions } from "@/renderer/components/tools/CropOptions";
import { useToolStore } from "@/renderer/store/toolStore";

describe("CropOptions", () => {
  beforeEach(() => {
    useToolStore.setState({
      toolSettings: {
        ...useToolStore.getState().toolSettings,
        crop: {
          mode: "Free",
          ratioW: 1,
          ratioH: 1,
          deleteCropped: true,
          isDirty: false,
        },
      },
    });
  });

  it("shows the crop modes, divider, and ratio presets", () => {
    render(<CropOptions />);

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("Free");
    expect(screen.getByRole("group", { name: "Modes" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Presets" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Fixed Ratio" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Original Ratio" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1:1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "4:3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3:2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "16:9" })).toBeInTheDocument();
  });

  it("applies a selected preset as an editable fixed ratio", () => {
    render(<CropOptions />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "16:9" } });

    expect(useToolStore.getState().toolSettings.crop).toMatchObject({
      mode: "Fixed Ratio",
      ratioW: 16,
      ratioH: 9,
    });
    expect(screen.getByDisplayValue("16")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9")).toBeInTheDocument();
  });

  it("shows Fixed Ratio for custom values", () => {
    useToolStore.setState({
      toolSettings: {
        ...useToolStore.getState().toolSettings,
        crop: {
          mode: "Fixed Ratio",
          ratioW: 9,
          ratioH: 16,
          deleteCropped: true,
          isDirty: false,
        },
      },
    });

    render(<CropOptions />);

    expect(screen.getByRole("combobox")).toHaveValue("Fixed Ratio");
  });

  it("swaps width and height as a single fixed-ratio update", () => {
    useToolStore.setState({
      toolSettings: {
        ...useToolStore.getState().toolSettings,
        crop: {
          mode: "Fixed Ratio",
          ratioW: 16,
          ratioH: 9,
          deleteCropped: true,
          isDirty: false,
        },
      },
    });

    render(<CropOptions />);
    fireEvent.click(screen.getByRole("button", { name: "Swap width and height" }));

    expect(useToolStore.getState().toolSettings.crop).toMatchObject({
      mode: "Fixed Ratio",
      ratioW: 9,
      ratioH: 16,
    });
  });
});
