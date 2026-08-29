import { describe, expect, it } from "vitest";
import { useGradientStore } from "@/renderer/store/gradientStore";

describe("gradientStore built-in presets", () => {
  it("includes the foreground-to-transparent preset", () => {
    const preset = useGradientStore
      .getState()
      .presets.find((item) => item.id === "foreground-transparent");

    expect(preset).toMatchObject({
      name: "Foreground to Transparent",
      colors: [{ position: 0 }, { position: 1 }],
      opacityStops: [
        { opacity: 1, position: 0 },
        { opacity: 0, position: 1 },
      ],
    });
  });

  it("includes a fully opaque rainbow preset", () => {
    const preset = useGradientStore.getState().presets.find((item) => item.id === "rainbow");

    expect(preset?.colors).toHaveLength(7);
    expect(preset?.colors[0]).toEqual({ color: "#ff0000", position: 0 });
    expect(preset?.colors.at(-1)).toEqual({ color: "#8000ff", position: 1 });
    expect(preset?.opacityStops).toEqual([
      { opacity: 1, position: 0 },
      { opacity: 1, position: 1 },
    ]);
  });
});
