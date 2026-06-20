/**
 * Purpose: Logic for rendering raster layers, including image caching and lazy loading of data URLs into canvases.
 */
import { Layer } from "@/renderer/store/projectStore";

/**
 * Provides static methods for rendering raster (image-based) layers.
 * Manages canvas caching and lazy loading of image data.
 */
export class RasterLayer {
  /**
   * Renders a raster layer to the given context.
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
    let lCanvas = layerCanvasCache.get(layer.id);

    // If not in cache and we have data, try to load it
    if (
      !lCanvas ||
      lCanvas.width !== layer.width ||
      lCanvas.height !== layer.height ||
      (lCanvas as any)._dataUrl !== layer.data
    ) {
      if (layer.data) {
        // Utility to populate cache from an image element
        const populateCache = (image: HTMLImageElement) => {
          if (image.naturalWidth === 0) return null;
          const cachedCanvas = document.createElement("canvas");
          cachedCanvas.width = layer.width;
          cachedCanvas.height = layer.height;
          (cachedCanvas as any)._dataUrl = layer.data;
          const cctx = cachedCanvas.getContext("2d")!;
          // Use scaling draw if dimensions don't match exactly (though they should)
          cctx.drawImage(image, 0, 0, layer.width, layer.height);
          layerCanvasCache.set(layer.id, cachedCanvas);
          layerReadyCache.set(layer.id, true);
          return cachedCanvas;
        };

        let img = imageCache.get(layer.data);
        if (!img) {
          img = new Image();
          img.src = layer.data;
          imageCache.set(layer.data, img);
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
          // Already loading, just wait for it
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
