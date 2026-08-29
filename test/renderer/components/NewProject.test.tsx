import { describe, expect, it } from "vitest";
import { createNewProjectBackgroundLayer } from "@/renderer/utils/newProjectUtils";
import { createProjectFromImage } from "@/renderer/utils/projectUtils";

describe("NewProject background layers", () => {
  it.each([
    ["white", "#ffffff"],
    ["black", "#000000"],
  ] as const)("creates a %s background as a color fill layer", (background, color) => {
    const layer = createNewProjectBackgroundLayer("bg", 1920, 1080, background);

    expect(layer).toMatchObject({
      id: "bg",
      name: "Background",
      type: "color_fill",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      colorFill: { color },
    });
    expect(layer.data).toBeUndefined();
  });

  it("keeps a transparent background as an empty raster layer", () => {
    const layer = createNewProjectBackgroundLayer("bg", 800, 600, "transparent");

    expect(layer).toMatchObject({
      id: "bg",
      name: "Background",
      type: "raster",
      width: 800,
      height: 600,
    });
    expect(layer.data).toBeUndefined();
    expect(layer.colorFill).toBeUndefined();
  });

  it("keeps imported project images as raster layers", () => {
    const project = createProjectFromImage("data:image/png;base64,image", 320, 240, "Imported");

    expect(project.layers[0]).toMatchObject({
      type: "raster",
      data: "data:image/png;base64,image",
      width: 320,
      height: 240,
    });
  });
});
