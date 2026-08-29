/**
 * Purpose: Shared canvas helpers for creating and combining pixel-based selections.
 */
import type { Layer, Selection } from "@store/projectStore";
import { getOptimizedBoundingBox } from "@core/utils/imageUtils";
import { loadImage } from "@utils/projectUtils";

export type SelectionOperation = "replace" | "unite" | "subtract";

export interface SelectionResult {
  bounds: NonNullable<Selection["bounds"]>;
  mask: string;
}

/** Creates a selection mask from the non-transparent pixels of a layer image. */
export const createLayerPixelSelection = async (layer: Layer): Promise<SelectionResult | null> => {
  if (!layer.data) return null;

  const image = await loadImage(layer.data);
  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0);
  const localBounds = getOptimizedBoundingBox(canvas, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  });
  if (!localBounds) return null;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = localBounds.width;
  maskCanvas.height = localBounds.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;

  maskCtx.drawImage(
    canvas,
    localBounds.x,
    localBounds.y,
    localBounds.width,
    localBounds.height,
    0,
    0,
    localBounds.width,
    localBounds.height,
  );
  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = "white";
  maskCtx.fillRect(0, 0, localBounds.width, localBounds.height);

  return {
    bounds: {
      x: layer.x + localBounds.x,
      y: layer.y + localBounds.y,
      width: localBounds.width,
      height: localBounds.height,
    },
    mask: maskCanvas.toDataURL(),
  };
};

/** Combines an incoming pixel selection with the current project selection. */
export const combineSelections = async (
  current: Selection,
  incoming: SelectionResult,
  operation: SelectionOperation,
): Promise<SelectionResult | null> => {
  if (operation === "replace") {
    return incoming;
  }

  if (!current.hasSelection || !current.bounds || !current.mask) {
    return operation === "subtract" ? null : incoming;
  }

  const oldBounds = current.bounds;
  const newBounds =
    operation === "unite"
      ? {
          x: Math.min(oldBounds.x, incoming.bounds.x),
          y: Math.min(oldBounds.y, incoming.bounds.y),
          right: Math.max(oldBounds.x + oldBounds.width, incoming.bounds.x + incoming.bounds.width),
          bottom: Math.max(
            oldBounds.y + oldBounds.height,
            incoming.bounds.y + incoming.bounds.height,
          ),
        }
      : {
          x: oldBounds.x,
          y: oldBounds.y,
          right: oldBounds.x + oldBounds.width,
          bottom: oldBounds.y + oldBounds.height,
        };

  const canvas = document.createElement("canvas");
  canvas.width = newBounds.right - newBounds.x;
  canvas.height = newBounds.bottom - newBounds.y;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const currentImage = await loadImage(current.mask);
  ctx.drawImage(currentImage, oldBounds.x - newBounds.x, oldBounds.y - newBounds.y);

  if (operation === "subtract") {
    ctx.globalCompositeOperation = "destination-out";
  } else {
    ctx.globalCompositeOperation = "source-over";
  }

  const incomingImage = await loadImage(incoming.mask);
  ctx.drawImage(incomingImage, incoming.bounds.x - newBounds.x, incoming.bounds.y - newBounds.y);
  ctx.globalCompositeOperation = "source-over";

  const actualBounds = getOptimizedBoundingBox(canvas, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  });
  if (!actualBounds) return null;

  const resultCanvas = document.createElement("canvas");
  resultCanvas.width = actualBounds.width;
  resultCanvas.height = actualBounds.height;
  const resultCtx = resultCanvas.getContext("2d");
  if (!resultCtx) return null;

  resultCtx.drawImage(
    canvas,
    actualBounds.x,
    actualBounds.y,
    actualBounds.width,
    actualBounds.height,
    0,
    0,
    actualBounds.width,
    actualBounds.height,
  );

  return {
    bounds: {
      x: newBounds.x + actualBounds.x,
      y: newBounds.y + actualBounds.y,
      width: actualBounds.width,
      height: actualBounds.height,
    },
    mask: resultCanvas.toDataURL(),
  };
};
