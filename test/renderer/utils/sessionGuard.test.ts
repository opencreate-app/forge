import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore, type Project } from "@/renderer/store/projectStore";
import { useUIStore } from "@/renderer/store/uiStore";
import { useSafeQuit } from "@/renderer/hooks/useSafeQuit";
import { useSessionGuard } from "@/renderer/hooks/useSessionGuard";
import {
  clearSessionSnapshot,
  clearRendererRecoveryMarker,
  createSessionSnapshot,
  getRendererRecoveryStabilizationMs,
  loadRendererRecoveryMarker,
  loadSessionSnapshot,
  prepareRendererRecovery,
  restoreSessionSnapshot,
  RENDERER_RECOVERY_STORAGE_KEY,
  SESSION_GUARD_DEBOUNCE_MS,
  saveSessionSnapshot,
  SESSION_GUARD_STORAGE_KEY,
} from "@/renderer/utils/sessionGuard";

const createProject = (overrides: Partial<Project> = {}): Project => ({
  id: "project-1",
  name: "Recovered project",
  width: 100,
  height: 100,
  layers: [],
  guides: [],
  activeLayerId: null,
  selectedLayerIds: [],
  selection: { hasSelection: false, bounds: null },
  zoom: 1,
  panX: 0,
  panY: 0,
  isDirty: true,
  filePath: "/tmp/recovered.ocfd",
  undoStack: [],
  redoStack: [],
  ...overrides,
});

describe("Session Guard", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useUIStore.setState({ activeTab: "home", tabHistory: ["home"] });
  });

  it("persists and loads a complete session snapshot", () => {
    const project = createProject();
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    useUIStore.getState().setActiveTab(project.id);

    expect(saveSessionSnapshot()).toBe(true);

    const snapshot = loadSessionSnapshot();
    expect(snapshot?.projects[0]).toMatchObject({
      id: project.id,
      filePath: project.filePath,
      isDirty: true,
    });
    expect(snapshot?.activeProjectId).toBe(project.id);
    expect(snapshot?.activeTab).toBe(project.id);
  });

  it("restores a snapshot and clears it after recovery", () => {
    const project = createProject();
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    useUIStore.getState().setActiveTab(project.id);
    const snapshot = createSessionSnapshot();

    restoreSessionSnapshot(snapshot);
    clearSessionSnapshot();

    expect(useProjectStore.getState().projects[0]).toMatchObject({
      id: project.id,
      filePath: project.filePath,
      isDirty: true,
    });
    expect(useProjectStore.getState().activeProjectId).toBe(project.id);
    expect(useUIStore.getState().activeTab).toBe(project.id);
    expect(localStorage.getItem(SESSION_GUARD_STORAGE_KEY)).toBeNull();
  });

  it("rejects an invalid snapshot without throwing", () => {
    localStorage.setItem(SESSION_GUARD_STORAGE_KEY, JSON.stringify({ version: 99 }));

    expect(loadSessionSnapshot()).toBeNull();
  });

  it("saves a recovery marker only for the first renderer failure", () => {
    const project = createProject();
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });

    expect(prepareRendererRecovery(new Error("first render failure"))).toBe(true);
    expect(loadRendererRecoveryMarker()).toMatchObject({
      attempts: 1,
      message: "first render failure",
    });
    expect(loadSessionSnapshot()?.projects[0]?.id).toBe(project.id);

    expect(prepareRendererRecovery(new Error("second render failure"))).toBe(false);
    expect(loadRendererRecoveryMarker()?.attempts).toBe(1);

    clearRendererRecoveryMarker();
    expect(localStorage.getItem(RENDERER_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it("keeps the periodic backup active under React StrictMode", () => {
    vi.useFakeTimers();
    try {
      const project = createProject({ name: "Before interval" });
      useProjectStore.setState({ projects: [project], activeProjectId: project.id });

      const StrictModeWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.StrictMode, null, children);
      const { unmount } = renderHook(() => useSessionGuard(), { wrapper: StrictModeWrapper });

      useProjectStore.setState({
        projects: [{ ...project, name: "After interval" }],
        activeProjectId: project.id,
      });
      act(() => vi.advanceTimersByTime(30_000));

      expect(loadSessionSnapshot()?.projects[0]?.name).toBe("After interval");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes a recent snapshot after project changes before the periodic interval", () => {
    vi.useFakeTimers();
    try {
      const project = createProject({ name: "Before change" });
      useProjectStore.setState({ projects: [project], activeProjectId: project.id });

      const { unmount } = renderHook(() => useSessionGuard());

      useProjectStore.setState({
        projects: [{ ...project, name: "After change" }],
        activeProjectId: project.id,
      });

      expect(loadSessionSnapshot()?.projects[0]?.name).toBe("Before change");
      act(() => vi.advanceTimersByTime(SESSION_GUARD_DEBOUNCE_MS));
      expect(loadSessionSnapshot()?.projects[0]?.name).toBe("After change");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a recovery toast and clears the marker after stabilization", () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(
        RENDERER_RECOVERY_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          attempts: 1,
          message: "render failure",
          savedAt: new Date().toISOString(),
        }),
      );

      const { unmount } = renderHook(() => useSessionGuard());

      expect(useUIStore.getState().toast).toMatchObject({
        message: "O app foi recuperado após uma falha de renderização.",
        type: "warning",
      });

      act(() => vi.advanceTimersByTime(getRendererRecoveryStabilizationMs()));
      expect(loadRendererRecoveryMarker()).toBeNull();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useSafeQuit", () => {
  const originalElectronAPI = (window as any).electronAPI;

  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useUIStore.setState({ activeTab: "home", tabHistory: ["home"] });
  });

  afterEach(() => {
    window.removeEventListener("forge:save-project", handleSaveRequest);
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: originalElectronAPI,
    });
  });

  let handleSaveRequest: (event: Event) => void;

  it("clears the snapshot when the user discards unsaved changes", async () => {
    const respondToSafeQuit = vi.fn().mockResolvedValue(undefined);
    const api = {
      confirmCloseAll: vi.fn().mockResolvedValue(1),
      respondToSafeQuit,
      onSafeQuitRequested: (callback: () => void) => {
        const listener = () => void callback();
        window.addEventListener("test-safe-quit", listener);
        return () => window.removeEventListener("test-safe-quit", listener);
      },
    };
    Object.defineProperty(window, "electronAPI", { configurable: true, value: api });
    localStorage.setItem(SESSION_GUARD_STORAGE_KEY, "snapshot");

    const { unmount } = renderHook(() => useSafeQuit());
    await act(async () => window.dispatchEvent(new Event("test-safe-quit")));

    await waitFor(() => expect(respondToSafeQuit).toHaveBeenCalledWith(true));
    expect(localStorage.getItem(SESSION_GUARD_STORAGE_KEY)).toBeNull();
    unmount();
  });

  it("saves dirty projects sequentially before approving quit", async () => {
    const project = createProject();
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    const respondToSafeQuit = vi.fn().mockResolvedValue(undefined);
    const api = {
      confirmCloseAll: vi.fn().mockResolvedValue(0),
      respondToSafeQuit,
      onSafeQuitRequested: (callback: () => void) => {
        const listener = () => void callback();
        window.addEventListener("test-safe-quit", listener);
        return () => window.removeEventListener("test-safe-quit", listener);
      },
    };
    Object.defineProperty(window, "electronAPI", { configurable: true, value: api });
    handleSaveRequest = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId: string }>).detail.projectId;
      window.dispatchEvent(
        new CustomEvent("forge:save-project-finished", {
          detail: { projectId, success: true },
        }),
      );
    };
    window.addEventListener("forge:save-project", handleSaveRequest);

    const { unmount } = renderHook(() => useSafeQuit());
    await act(async () => window.dispatchEvent(new Event("test-safe-quit")));

    await waitFor(() => expect(respondToSafeQuit).toHaveBeenCalledWith(true));
    expect(api.confirmCloseAll).toHaveBeenCalledWith(1);
    unmount();
  });
});
