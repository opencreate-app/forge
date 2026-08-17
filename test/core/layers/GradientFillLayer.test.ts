import { describe, expect, it, vi } from "vitest";
import { GradientFillLayer } from "@/core/layers/GradientFillLayer";
import type { Layer } from "@/renderer/store/projectStore";

const layer: Layer = {
  id: "gradient-1",
  name: "Gradient",
  type: "gradient_fill",
  visible: true,
  locked: false,
  opacity: 100,
  fill: 100,
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  blendMode: "source-over",
  gradientFill: {
    type: "linear",
    colors: [
      { color: "#ff0000", position: 0 },
      { color: "#0000ff", position: 1 },
    ],
    start: { x: 0, y: 0 },
    end: { x: 100, y: 80 },
  },
};

describe("GradientFillLayer", () => {
  it.each(["linear", "radial", "angular"] as const)(
    "creates a %s canvas gradient and fills the layer bounds",
    (type) => {
      const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
      const ctx = {
        createLinearGradient: vi.fn(() => gradient),
        createRadialGradient: vi.fn(() => gradient),
        createConicGradient: vi.fn(() => gradient),
        fillRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      GradientFillLayer.render(ctx, {
        ...layer,
        gradientFill: { ...layer.gradientFill!, type },
      });

      expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 100, 80);
    },
  );
});
