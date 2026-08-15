/**
 * Purpose: Placeholder and logic for group layers, used to organize and potentially apply transformations to multiple child layers.
 */
import { Layer } from "@/renderer/store/projectStore";

export interface GroupRenderTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchor: { x: number; y: number };
  baseX: number;
  baseY: number;
  originX: number;
  originY: number;
}

/**
 * Provides methods for rendering and managing group layers.
 * Groups are used to organize multiple layers and apply transformations collectively.
 */
export class GroupLayer {
  /**
   * Renders the group layer and its children using an offscreen buffer for isolated compositing.
   * @param ctx The destination rendering context.
   * @param layer The group layer data.
   * @param allLayers All layers in the project to find children.
   * @param renderLayer Callback to render a single layer (provided by engine).
   * @param projectWidth Width of the project for buffer sizing.
   * @param projectHeight Height of the project for buffer sizing.
   */
  public static render(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    allLayers: Layer[],
    renderLayer: (ctx: CanvasRenderingContext2D, layer: Layer) => void,
    projectWidth: number,
    projectHeight: number,
    transform?: GroupRenderTransform,
  ) {
    // 1. Create offscreen buffer for isolated compositing (Photoshop-style)
    const buffer = document.createElement("canvas");
    buffer.width = projectWidth;
    buffer.height = projectHeight;
    const bctx = buffer.getContext("2d")!;
    bctx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;

    // 2. Find all immediate children of this group
    const children = allLayers.filter((l) => l.parentId === layer.id);

    // 3. Render children into the buffer. A group transform is applied to the
    // complete child composition, preserving the relative positions of children.
    if (transform) {
      const rotation = (transform.rotation * Math.PI) / 180;
      bctx.translate(transform.x + transform.originX, transform.y + transform.originY);
      bctx.rotate(rotation);
      bctx.scale(transform.scaleX, transform.scaleY);
      bctx.translate(
        -transform.baseX - transform.width * transform.anchor.x - transform.originX,
        -transform.baseY - transform.height * transform.anchor.y - transform.originY,
      );
    }

    for (const child of children) {
      if (child.visible) {
        renderLayer(bctx, child);
      }
    }

    // 4. Draw the composited group onto the main context
    // The main context already has the group's alpha/blendMode set by ForgeEngine
    ctx.drawImage(buffer, 0, 0);
  }
}
