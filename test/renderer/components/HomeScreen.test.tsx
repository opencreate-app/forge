import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import HomeScreen from "@/renderer/components/HomeScreen";
import { createMockProject } from "../../mocks";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { useRecentProjectsStore } from "@store/recentProjectsStore";

describe("HomeScreen", () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useUIStore.setState({ activeTab: "home" });
    useRecentProjectsStore.setState({ recentProjects: [] });
  });

  it("opens one tab per dropped project and continues after unsupported files", async () => {
    const { container } = render(<HomeScreen />);
    const firstProject = createMockProject({ id: "home-first", name: "First" });
    const secondProject = createMockProject({ id: "home-second", name: "Second" });
    const files = [
      new File([JSON.stringify(firstProject)], "first.ocfd", { type: "application/json" }),
      new File(["unsupported"], "notes.txt", { type: "text/plain" }),
      new File([JSON.stringify(secondProject)], "second.ocfd", { type: "application/json" }),
    ];

    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { files },
    });

    await waitFor(() => {
      expect(useProjectStore.getState().projects).toHaveLength(2);
    });

    expect(useProjectStore.getState().projects.map((project) => project.id)).toEqual([
      firstProject.id,
      secondProject.id,
    ]);
    expect(useUIStore.getState().activeTab).toBe(secondProject.id);
  });
});
