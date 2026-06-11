/**
 * Purpose: Implementation of a solid color fill layer that fills the entire layer bounds with a single color.
 */
import { Layer } from "@/renderer/store/projectStore";

export class ColorFillLayer {
  /**
   * Renders a solid color fill layer.
   * @param ctx The canvas rendering context.
   * @param layer The layer to render.
   */
  public static render(ctx: CanvasRenderingContext2D, layer: Layer) {
    if (!layer.colorFill) return;

    ctx.fillStyle = layer.colorFill.color;
    ctx.fillRect(0, 0, layer.width, layer.height);
  }
}
