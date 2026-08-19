import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTabs from "@/renderer/components/ProjectTabs";
import { createMockProject } from "../../mocks";
import { useProjectStore } from "@store/projectStore";
import { useRecentProjectsStore } from "@store/recentProjectsStore";
import { useUIStore } from "@store/uiStore";

describe("ProjectTabs", () => {
  const project = createMockProject({
    id: "project-1",
    name: "Pixel Art",
    filePath: "/tmp/pixel-art.ocfd",
  });

  beforeEach(() => {
    vi.useFakeTimers();
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    useUIStore.setState({ activeTab: "home" });
    useRecentProjectsStore.setState({
      recentProjects: [
        {
          id: project.id,
          name: project.name,
          filePath: project.filePath!,
          thumbnail: "data:image/png;base64,thumbnail",
          lastModified: "2026-01-01T00:00:00.000Z",
          fileSize: 1,
        },
      ],
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const getProjectTab = () => screen.getAllByRole("button")[1];

  it("shows the project thumbnail after a 700ms hover delay", () => {
    render(<ProjectTabs />);
    const tab = getProjectTab();
    Object.defineProperty(tab, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 20, right: 170, top: 0, bottom: 30, width: 150, height: 30 }),
    });

    fireEvent.mouseEnter(tab);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(699));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Project preview" })).toHaveAttribute(
      "src",
      "data:image/png;base64,thumbnail",
    );
  });

  it("cancels the preview when leaving before the delay", () => {
    render(<ProjectTabs />);
    const tab = getProjectTab();

    fireEvent.mouseEnter(tab);
    act(() => vi.advanceTimersByTime(499));
    fireEvent.mouseLeave(tab);
    act(() => vi.advanceTimersByTime(1));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("hides the preview when starting to drag a tab", () => {
    render(<ProjectTabs />);
    const tab = getProjectTab();

    fireEvent.mouseEnter(tab);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseDown(tab, { button: 0, clientX: 50 });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not show a preview when the project has no saved thumbnail", () => {
    useRecentProjectsStore.setState({ recentProjects: [] });
    render(<ProjectTabs />);
    fireEvent.mouseEnter(getProjectTab());

    act(() => vi.advanceTimersByTime(700));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
