import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockProject } from "../../mocks";

const engineMocks = vi.hoisted(() => ({
  setProject: vi.fn(),
  generateThumbnail: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@core/engine/ForgeEngine", () => ({
  ForgeEngine: vi.fn().mockImplementation(function () {
    return engineMocks;
  }),
}));

import { ForgeEngine } from "@core/engine/ForgeEngine";
import { generateProjectThumbnail } from "@utils/projectThumbnail";

describe("generateProjectThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engineMocks.generateThumbnail.mockResolvedValue("data:image/png;base64,preview");
  });

  it("renders the complete project through a headless engine and destroys it", async () => {
    const project = createMockProject();

    await expect(generateProjectThumbnail(project, 128)).resolves.toBe(
      "data:image/png;base64,preview",
    );

    expect(ForgeEngine).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), undefined, {
      headless: true,
    });
    expect(engineMocks.setProject).toHaveBeenCalledWith(project);
    expect(engineMocks.generateThumbnail).toHaveBeenCalledWith(128);
    expect(engineMocks.destroy).toHaveBeenCalledOnce();
  });

  it("destroys the engine when thumbnail rendering fails", async () => {
    const error = new Error("render failed");
    engineMocks.generateThumbnail.mockRejectedValueOnce(error);

    await expect(generateProjectThumbnail(createMockProject())).rejects.toBe(error);
    expect(engineMocks.destroy).toHaveBeenCalledOnce();
  });
});
