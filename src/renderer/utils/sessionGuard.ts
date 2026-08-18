/**
 * Purpose: Persist and restore the complete renderer session so unexpected application exits do not lose open work.
 */
import type { Project } from "@store/projectStore";
import { getSerializableProject, useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";

export const SESSION_GUARD_STORAGE_KEY = "forge-session-guard";
export const SESSION_GUARD_VERSION = 1;
export const SESSION_GUARD_INTERVAL_MS = 30_000;

let sessionGuardPaused = false;

export interface SessionSnapshot {
  version: number;
  savedAt: string;
  projects: Project[];
  activeProjectId: string | null;
  activeTab: "home" | string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isValidSnapshot = (value: unknown): value is SessionSnapshot => {
  if (!isRecord(value)) return false;
  if (value.version !== SESSION_GUARD_VERSION || !Array.isArray(value.projects)) return false;
  if (value.activeProjectId !== null && typeof value.activeProjectId !== "string") return false;
  return typeof value.activeTab === "string";
};

export const createSessionSnapshot = (): SessionSnapshot => {
  const { projects, activeProjectId } = useProjectStore.getState();
  const { activeTab } = useUIStore.getState();

  return {
    version: SESSION_GUARD_VERSION,
    savedAt: new Date().toISOString(),
    projects: projects.map((project) => ({
      ...getSerializableProject(project),
      // getSerializableProject intentionally strips these fields for disk files, but the
      // recovery snapshot must preserve the document's dirty state and original path.
      filePath: project.filePath,
      isDirty: project.isDirty,
    })),
    activeProjectId,
    activeTab,
  };
};

export const saveSessionSnapshot = (): boolean => {
  try {
    localStorage.setItem(SESSION_GUARD_STORAGE_KEY, JSON.stringify(createSessionSnapshot()));
    return true;
  } catch (error) {
    console.error("Failed to save Session Guard snapshot:", error);
    return false;
  }
};

export const loadSessionSnapshot = (): SessionSnapshot | null => {
  try {
    const rawSnapshot = localStorage.getItem(SESSION_GUARD_STORAGE_KEY);
    if (!rawSnapshot) return null;

    const parsedSnapshot: unknown = JSON.parse(rawSnapshot);
    return isValidSnapshot(parsedSnapshot) ? parsedSnapshot : null;
  } catch (error) {
    console.error("Failed to load Session Guard snapshot:", error);
    return null;
  }
};

export const clearSessionSnapshot = (): void => {
  try {
    localStorage.removeItem(SESSION_GUARD_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear Session Guard snapshot:", error);
  }
};

export const pauseSessionGuard = (): void => {
  sessionGuardPaused = true;
};

export const resumeSessionGuard = (): void => {
  sessionGuardPaused = false;
};

export const isSessionGuardPaused = (): boolean => sessionGuardPaused;

export const restoreSessionSnapshot = (snapshot: SessionSnapshot): void => {
  const projectIds = new Set(snapshot.projects.map((project) => project.id));
  const activeProjectId =
    snapshot.activeProjectId && projectIds.has(snapshot.activeProjectId)
      ? snapshot.activeProjectId
      : snapshot.projects[0]?.id || null;
  const activeTab =
    snapshot.activeTab === "home" || projectIds.has(snapshot.activeTab)
      ? snapshot.activeTab
      : activeProjectId || "home";

  useProjectStore.getState().restoreSession(snapshot.projects, activeProjectId);
  useUIStore.getState().setActiveTab(activeTab);
};
