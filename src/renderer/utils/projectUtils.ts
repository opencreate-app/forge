/**
 * Purpose: Utility functions for project-related operations, such as creating projects from images and loading image assets.
 */
import { Project, Layer } from "@store/projectStore";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates the bounding box of a layer, including its styles (stroke, shadow, etc.).
 */
export const getStyledLayerBounds = (layer: Layer): Bounds => {
  const { x, y, width, height } = layer;
  if (!layer.styles) return { x, y, width, height };

  const { stroke, dropShadow } = layer.styles;

  let paddingLeft = 0;
  let paddingTop = 0;
  let paddingRight = 0;
  let paddingBottom = 0;

  if (stroke?.enabled && stroke.size > 0) {
    let strokePadding = 0;
    if (stroke.position === "outside") {
      strokePadding = stroke.size;
    } else if (stroke.position === "center") {
      strokePadding = stroke.size / 2;
    }
    // We add a small buffer for anti-aliasing (consistent with ForgeEngine)
    strokePadding = Math.ceil(strokePadding) + 2;

    paddingLeft = Math.max(paddingLeft, strokePadding);
    paddingTop = Math.max(paddingTop, strokePadding);
    paddingRight = Math.max(paddingRight, strokePadding);
    paddingBottom = Math.max(paddingBottom, strokePadding);
  }

  if (dropShadow?.enabled) {
    const rad = (dropShadow.angle * Math.PI) / 180;
    const offsetX = Math.cos(rad) * dropShadow.distance;
    const offsetY = Math.sin(rad) * dropShadow.distance;
    const blur = dropShadow.size; // Total influence

    // Shadow extends from (x + offsetX - blur) to (x + width + offsetX + blur)
    paddingLeft = Math.max(paddingLeft, Math.ceil(blur - offsetX) + 5);
    paddingTop = Math.max(paddingTop, Math.ceil(blur - offsetY) + 5);
    paddingRight = Math.max(paddingRight, Math.ceil(blur + offsetX) + 5);
    paddingBottom = Math.max(paddingBottom, Math.ceil(blur + offsetY) + 5);
  }

  return {
    x: x - paddingLeft,
    y: y - paddingTop,
    width: width + paddingLeft + paddingRight,
    height: height + paddingTop + paddingBottom,
  };
};

/**
 * Calculates the combined bounding box of multiple layers, including their styles.
 */
export const getCombinedStyledBounds = (layers: Layer[]): Bounds => {
  if (layers.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const bounds = layers.map((l) => {
    if (l.type === "group") {
      // In OpenCreate Forge, groups don't have styles themselves,
      // and we are usually given a list including all descendants.
      return { x: l.x, y: l.y, width: 0, height: 0 };
    }
    return getStyledLayerBounds(l);
  });

  const validBounds = bounds.filter((b) => b.width > 0 || b.height > 0);
  if (validBounds.length === 0) {
    return {
      x: Math.min(...layers.map((l) => l.x)),
      y: Math.min(...layers.map((l) => l.y)),
      width: Math.max(...layers.map((l) => l.x + l.width)) - Math.min(...layers.map((l) => l.x)),
      height: Math.max(...layers.map((l) => l.y + l.height)) - Math.min(...layers.map((l) => l.y)),
    };
  }

  const minX = Math.min(...validBounds.map((b) => b.x));
  const minY = Math.min(...validBounds.map((b) => b.y));
  const maxX = Math.max(...validBounds.map((b) => b.x + b.width));
  const maxY = Math.max(...validBounds.map((b) => b.y + b.height));

  return {
    x: minX,
    y: minY,
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
};

export const createProjectFromImage = (
  dataUrl: string,
  width: number,
  height: number,
  name: string,
  filePath?: string,
): Project => {
  const id = Math.random().toString(36).substr(2, 9);
  const layerId = "layer-" + id;

  const newProject: Project = {
    id,
    name,
    width,
    height,
    layers: [
      {
        id: layerId,
        name: "Layer 1",
        type: "raster",
        visible: true,
        locked: false,
        opacity: 100,
        fill: 100,
        x: 0,
        y: 0,
        width,
        height,
        data: dataUrl,
        blendMode: "source-over",
      },
    ],
    guides: [],
    activeLayerId: layerId,
    selectedLayerIds: [layerId],
    selection: { hasSelection: false, bounds: null },
    zoom: 1,
    panX: 0,
    panY: 0,
    isDirty: false,
    filePath,
    undoStack: [{ description: "New Project from Image", state: {} as any }],
    redoStack: [],
  };

  return newProject;
};

export const loadImage = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
};
