/**
 * Purpose: Renders non-destructive linear, radial, and angular gradient layers.
 */
import { GradientFill, Layer } from "@/renderer/store/projectStore";
import { resolveGradientStops, gradientStopToCssColor } from "@/renderer/utils/gradientUtils";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

export class GradientFillLayer {
  public static render(ctx: CanvasRenderingContext2D, layer: Layer) {
    const gradientFill = layer.gradientFill;
    if (!gradientFill || gradientFill.colors.length < 2) return;

    const start = {
      x: layer.x + gradientFill.start.x,
      y: layer.y + gradientFill.start.y,
    };
    const end = {
      x: layer.x + gradientFill.end.x,
      y: layer.y + gradientFill.end.y,
    };

    const gradient = this.createGradient(ctx, gradientFill, start, end);
    if (!gradient) return;

    const stops = resolveGradientStops(gradientFill.colors, gradientFill.opacityStops);
    stops.forEach((stop) => {
      gradient.addColorStop(clamp(stop.position, 0, 1), gradientStopToCssColor(stop));
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
  }

  private static createGradient(
    ctx: CanvasRenderingContext2D,
    gradientFill: GradientFill,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): CanvasGradient | null {
    if (gradientFill.type === "linear") {
      return ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    }

    if (gradientFill.type === "radial") {
      const radius = Math.max(1, distance(start, end));
      return ctx.createRadialGradient(start.x, start.y, 0, start.x, start.y, radius);
    }

    if (typeof ctx.createConicGradient !== "function") return null;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    return ctx.createConicGradient(angle, start.x, start.y);
  }
}

export default GradientFillLayer;
