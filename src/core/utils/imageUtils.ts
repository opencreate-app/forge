/**
 * Purpose: Utility functions for image manipulation and optimization, such as calculating bounding boxes for non-transparent pixels.
 */
/**
 * Finds the bounding box of non-transparent pixels
 * WITHIN a specific search area for optimization.
 */
export function getOptimizedBoundingBox(
  canvas: HTMLCanvasElement,
  searchBounds: { x: number; y: number; width: number; height: number },
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { x, y, width, height } = searchBounds;

  const searchX = Math.max(0, Math.floor(x));
  const searchY = Math.max(0, Math.floor(y));
  const searchWidth = Math.min(canvas.width - searchX, Math.ceil(width));
  const searchHeight = Math.min(canvas.height - searchY, Math.ceil(height));

  if (searchWidth <= 0 || searchHeight <= 0) return null;

  const data = ctx.getImageData(searchX, searchY, searchWidth, searchHeight).data;
  let minX = canvas.width,
    minY = canvas.height,
    maxX = -1,
    maxY = -1;
  let foundPixel = false;

  for (let dy = 0; dy < searchHeight; dy++) {
    for (let dx = 0; dx < searchWidth; dx++) {
      const alpha = data[(dy * searchWidth + dx) * 4 + 3];
      if (alpha > 0) {
        const globalX = searchX + dx;
        const globalY = searchY + dy;
        minX = Math.min(minX, globalX);
        minY = Math.min(minY, globalY);
        maxX = Math.max(maxX, globalX);
        maxY = Math.max(maxY, globalY);
        foundPixel = true;
      }
    }
  }

  if (!foundPixel) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Reduces the number of colors in ImageData based on quality (0-1).
 * Uses a Popularity Palette algorithm to find the most frequent colors,
 * then maps pixels to this palette for better visual fidelity.
 */
export function quantizeImageData(imageData: ImageData, quality: number) {
  if (quality >= 1) return imageData;

  const data = imageData.data;
  // quality 0.1 -> ~8 colors | quality 0.9 -> ~256 colors
  const maxColors = Math.max(2, Math.floor(quality * 256));

  // Step 1: Count color frequency (subsampling for performance)
  const colorMap = new Map<number, number>();
  // Subsample large images to avoid freezing the main thread
  const step = data.length > 1000000 ? 16 : 4;

  for (let i = 0; i < data.length; i += step) {
    const r = Math.round(data[i] / 8) * 8; // Slight grouping to group similar colors
    const g = Math.round(data[i + 1] / 8) * 8;
    const b = Math.round(data[i + 2] / 8) * 8;
    // Pack RGB into a single 24-bit integer for the Map key
    const rgb = (r << 16) | (g << 8) | b;

    colorMap.set(rgb, (colorMap.get(rgb) || 0) + 1);
  }

  // Step 2: Sort by frequency and extract the top N colors for our Palette
  const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
  const palette = sortedColors.slice(0, maxColors).map((entry) => {
    const rgb = entry[0];
    return {
      r: (rgb >> 16) & 255,
      g: (rgb >> 8) & 255,
      b: rgb & 255,
    };
  });

  // Step 3: Map every pixel in the image to the nearest color in our new Palette
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];

    let minDistance = Infinity;
    let closestColor = palette[0];

    // Find the closest color in the palette using Euclidean distance
    for (const color of palette) {
      const dist =
        (pr - color.r) * (pr - color.r) +
        (pg - color.g) * (pg - color.g) +
        (pb - color.b) * (pb - color.b);

      if (dist < minDistance) {
        minDistance = dist;
        closestColor = color;
      }
    }

    data[i] = closestColor.r;
    data[i + 1] = closestColor.g;
    data[i + 2] = closestColor.b;
    // Alpha remains unchanged
  }

  return imageData;
}

/**
 * Safely converts an ArrayBuffer to a Base64 string without causing
 * 'Maximum call stack size exceeded' errors on large files.
 */
export function safeBase64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192; // Process in chunks to avoid stack limits

  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  return btoa(binary);
}

/**
 * Applies a binary threshold to the alpha channel of a canvas.
 * This is useful for creating hard, crisp edges on anti-aliased content (like strokes).
 * @param canvas The canvas to modify.
 * @param threshold The alpha threshold (0-255). Values >= threshold become 255, others 0.
 */
export function applyAlphaThreshold(canvas: HTMLCanvasElement, threshold: number = 128) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] >= threshold ? 255 : 0;
  }
  ctx.putImageData(imageData, 0, 0);
}

