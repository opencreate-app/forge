/**
 * Purpose: Helpers for constructing layers used by the new-project workflow.
 */
import { Layer } from "@store/projectStore";

export type NewProjectBackground = "white" | "black" | "transparent";

export const createNewProjectBackgroundLayer = (
  id: string,
  width: number,
  height: number,
  background: NewProjectBackground,
): Layer => {
  const isTransparent = background === "transparent";

  return {
    id,
    name: "Background",
    type: isTransparent ? "raster" : "color_fill",
    visible: true,
    locked: false,
    opacity: 100,
    fill: 100,
    x: 0,
    y: 0,
    width,
    height,
    ...(isTransparent
      ? {}
      : {
          colorFill: {
            color: background === "white" ? "#ffffff" : "#000000",
          },
        }),
    blendMode: "source-over",
  };
};
