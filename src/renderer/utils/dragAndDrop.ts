import type { DragEvent } from "react";

/**
 * Purpose: Shared drag-and-drop payload helpers for moving layers between project tabs.
 */

export const LAYER_DRAG_MIME = "application/x-opencreate-layer";

export interface LayerDragPayload {
  type: "layer";
  sourceProjectId: string;
  layerIds: string[];
}

export const createLayerDragPayload = (
  sourceProjectId: string,
  layerIds: string[],
): LayerDragPayload => ({
  type: "layer",
  sourceProjectId,
  layerIds,
});

export const isLayerDragEvent = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes(LAYER_DRAG_MIME);

export const parseLayerDragPayload = (value: string): LayerDragPayload | null => {
  if (!value) return null;

  try {
    const payload = JSON.parse(value) as Partial<LayerDragPayload>;
    if (
      payload.type !== "layer" ||
      typeof payload.sourceProjectId !== "string" ||
      !Array.isArray(payload.layerIds) ||
      payload.layerIds.some((id) => typeof id !== "string")
    ) {
      return null;
    }

    return {
      type: "layer",
      sourceProjectId: payload.sourceProjectId,
      layerIds: payload.layerIds,
    };
  } catch {
    return null;
  }
};

export const isFileDragEvent = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes("Files");
