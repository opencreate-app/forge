/**
 * Purpose: Logic for rendering Smart Object layers.
 * Smart Objects render their internal project state into a flattened raster buffer for efficient display.
 */
import { Layer } from "@/renderer/store/projectStore";

/**
 * Provides static methods for rendering Smart Object layers.
 * Currently uses the cached flattened 'data' (image) of the internal project.
 */
export class SmartObjectLayer {
  /**
   * Renders a smart object layer to the given context.
   * @param ctx The destination rendering context.
   * @param layer The layer data to render.
   * @param layerCanvasCache Map of cached canvases per layer ID.
   * @param layerReadyCache Map of readiness flags per layer ID.
   * @param imageCache Map of loaded HTMLImageElements per data URL.
   * @param onReady Callback triggered when the image finishes loading and is ready for rendering in the next frame.
   */
  public static render(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    layerCanvasCache: Map<string, HTMLCanvasElement>,
    layerReadyCache: Map<string, boolean>,
    imageCache: Map<string, HTMLImageElement>,
    onReady: () => void,
  ) {
    // Prefer dataOriginal for rendering to maintain quality during transformations.
    const sourceData = layer.dataOriginal || layer.data;
    let lCanvas = layerCanvasCache.get(layer.id);

    if (
      !lCanvas ||
      lCanvas.width !== layer.width ||
      lCanvas.height !== layer.height ||
      (lCanvas as any)._dataUrl !== sourceData
    ) {
      if (sourceData) {
        const populateCache = (image: HTMLImageElement) => {
          if (image.naturalWidth === 0) return null;
          const cachedCanvas = document.createElement("canvas");
          cachedCanvas.width = layer.width;
          cachedCanvas.height = layer.height;
          (cachedCanvas as any)._dataUrl = sourceData;
          const cctx = cachedCanvas.getContext("2d")!;
          // Canvas handles the non-destructive scaling here
          cctx.drawImage(image, 0, 0, layer.width, layer.height);
          layerCanvasCache.set(layer.id, cachedCanvas);
          layerReadyCache.set(layer.id, true);
          return cachedCanvas;
        };

        let img = imageCache.get(sourceData);
        if (!img) {
          img = new Image();
          img.src = sourceData;
          imageCache.set(sourceData, img);
          img.addEventListener(
            "load",
            () => {
              if (populateCache(img!)) onReady();
            },
            { once: true },
          );
        } else if (img.complete) {
          lCanvas = populateCache(img) || undefined;
        } else {
          img.addEventListener(
            "load",
            () => {
              if (populateCache(img!)) onReady();
            },
            { once: true },
          );
        }
      }
    }

    if (lCanvas && layerReadyCache.get(layer.id)) {
      ctx.drawImage(lCanvas, Math.round(layer.x), Math.round(layer.y));
    }
  }
}
