/**
 * Purpose: Generate optimized previews from complete project data for renderer UI surfaces.
 */
import { ForgeEngine } from "@core/engine/ForgeEngine";
import type { Project } from "@store/projectStore";

/**
 * Renders a project independently from the interactive viewport and returns its optimized preview.
 */
export const generateProjectThumbnail = async (project: Project, size = 200): Promise<string> => {
  const canvas = document.createElement("canvas");
  const engine = new ForgeEngine(canvas, undefined, { headless: true });

  try {
    engine.setProject(project);
    return await engine.generateThumbnail(size);
  } finally {
    engine.destroy();
  }
};
