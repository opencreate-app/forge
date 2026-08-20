import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTabs from "@/renderer/components/ProjectTabs";
import { createMockProject } from "../../mocks";
import { useProjectStore } from "@store/projectStore";
import { useRecentProjectsStore } from "@store/recentProjectsStore";
import { useUIStore } from "@store/uiStore";
import { LAYER_DRAG_MIME } from "@utils/dragAndDrop";

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
    if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
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

  it("highlights a tab when a layer is dragged over it and imports the layer on drop", () => {
    const targetProject = createMockProject({
      id: "project-2",
      name: "Target",
      filePath: "/tmp/target.ocfd",
      layers: [],
      activeLayerId: null,
      selectedLayerIds: [],
    });
    useProjectStore.setState({
      projects: [project, targetProject],
      activeProjectId: project.id,
    });

    render(<ProjectTabs />);
    const targetTab = screen.getByText("target.ocfd").closest("button")!;
    const payload = JSON.stringify({
      type: "layer",
      sourceProjectId: project.id,
      layerIds: ["layer-1"],
    });
    const dataTransfer = {
      types: [LAYER_DRAG_MIME],
      dropEffect: "move",
      getData: (type: string) => (type === LAYER_DRAG_MIME ? payload : '["layer-1"]'),
    };

    fireEvent.dragOver(targetTab, { dataTransfer });
    expect(targetTab).toHaveClass("outline-2");

    fireEvent.drop(targetTab, { dataTransfer });

    const target = useProjectStore
      .getState()
      .projects.find((candidate) => candidate.id === targetProject.id)!;
    expect(target.layers).toHaveLength(1);
    expect(target.layers[0].name).toBe("Layer 1");
    expect(useUIStore.getState().activeTab).toBe(targetProject.id);
  });

  it("opens a dropped project in a new tab", async () => {
    vi.useRealTimers();
    render(<ProjectTabs />);
    const tabBar = getProjectTab().parentElement!;
    const droppedProject = createMockProject({ id: "dropped-project", name: "Dropped" });
    const file = new File([JSON.stringify(droppedProject)], "dropped.ocfd", {
      type: "application/json",
    });

    fireEvent.drop(tabBar, {
      dataTransfer: { types: ["Files"], files: [file] },
    });

    await waitFor(() => {
      expect(
        useProjectStore.getState().projects.some((item) => item.id === droppedProject.id),
      ).toBe(true);
    });
    expect(useUIStore.getState().activeTab).toBe(droppedProject.id);
  });

  it("opens a new tab when the same project is dropped again", async () => {
    vi.useRealTimers();
    render(<ProjectTabs />);
    const tabBar = getProjectTab().parentElement!;
    const droppedProject = createMockProject({ id: "dropped-project", name: "Dropped" });
    const file = new File([JSON.stringify(droppedProject)], "dropped.ocfd", {
      type: "application/json",
    });
    const dataTransfer = { types: ["Files"], files: [file] };

    fireEvent.drop(tabBar, { dataTransfer });
    await waitFor(() => {
      expect(useProjectStore.getState().projects).toHaveLength(2);
    });

    const firstDroppedProjectId = useProjectStore.getState().projects[1].id;
    fireEvent.drop(tabBar, { dataTransfer });

    await waitFor(() => {
      expect(useProjectStore.getState().projects).toHaveLength(3);
    });

    const projects = useProjectStore.getState().projects;
    expect(projects[2].id).not.toBe(firstDroppedProjectId);
    expect(projects[2].filePath).toBeUndefined();
    expect(useUIStore.getState().activeTab).toBe(projects[2].id);
    expect(useProjectStore.getState().activeProjectId).toBe(projects[2].id);
  });

  it("opens one tab per dropped project and keeps importing after unsupported files", async () => {
    vi.useRealTimers();
    render(<ProjectTabs />);
    const tabBar = getProjectTab().parentElement!;
    const firstProject = createMockProject({ id: "first-dropped", name: "First" });
    const secondProject = createMockProject({ id: "second-dropped", name: "Second" });
    const files = [
      new File([JSON.stringify(firstProject)], "first.ocfd", { type: "application/json" }),
      new File(["unsupported"], "notes.txt", { type: "text/plain" }),
      new File([JSON.stringify(secondProject)], "second.ocfd", { type: "application/json" }),
    ];

    fireEvent.drop(tabBar, {
      dataTransfer: { types: ["Files"], files },
    });

    await waitFor(() => {
      expect(useProjectStore.getState().projects).toHaveLength(3);
    });

    const projects = useProjectStore.getState().projects;
    expect(projects.map((item) => item.id)).toEqual([
      project.id,
      firstProject.id,
      secondProject.id,
    ]);
    expect(useUIStore.getState().activeTab).toBe(secondProject.id);
    expect(useProjectStore.getState().activeProjectId).toBe(secondProject.id);
  });
});
