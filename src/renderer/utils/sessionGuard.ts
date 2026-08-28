/**
 * Purpose: Persist and restore the complete renderer session so unexpected application exits do not lose open work.
 */
import type { Project } from "@store/projectStore";
import { getSerializableProject, useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";

export const SESSION_GUARD_STORAGE_KEY = "forge-session-guard";
export const SESSION_GUARD_VERSION = 1;
export const SESSION_GUARD_INTERVAL_MS = 30_000;
export const SESSION_GUARD_DEBOUNCE_MS = 1_000;
export const RENDERER_RECOVERY_STORAGE_KEY = "forge-renderer-recovery";
export const RENDERER_RECOVERY_VERSION = 1;
const RENDERER_RECOVERY_STABILIZATION_MS = 5_000;

let sessionGuardPaused = false;

export interface SessionSnapshot {
  version: number;
  savedAt: string;
  projects: Project[];
  activeProjectId: string | null;
  activeTab: "home" | string;
}

export interface RendererRecoveryMarker {
  version: number;
  attempts: number;
  message: string;
  stack?: string;
  savedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isValidSnapshot = (value: unknown): value is SessionSnapshot => {
  if (!isRecord(value)) return false;
  if (value.version !== SESSION_GUARD_VERSION || !Array.isArray(value.projects)) return false;
  if (value.activeProjectId !== null && typeof value.activeProjectId !== "string") return false;
  return typeof value.activeTab === "string";
};

const isValidRecoveryMarker = (value: unknown): value is RendererRecoveryMarker => {
  if (!isRecord(value)) return false;
  return (
    value.version === RENDERER_RECOVERY_VERSION &&
    typeof value.attempts === "number" &&
    typeof value.message === "string" &&
    typeof value.savedAt === "string"
  );
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

export const loadRendererRecoveryMarker = (): RendererRecoveryMarker | null => {
  try {
    const rawMarker = localStorage.getItem(RENDERER_RECOVERY_STORAGE_KEY);
    if (!rawMarker) return null;

    const parsedMarker: unknown = JSON.parse(rawMarker);
    return isValidRecoveryMarker(parsedMarker) ? parsedMarker : null;
  } catch (error) {
    console.error("Failed to load renderer recovery marker:", error);
    return null;
  }
};

/**
 * Saves the current session and records that the next renderer load is a recovery attempt.
 * Returns false after one failed recovery attempt so the app cannot refresh forever.
 */
export const prepareRendererRecovery = (error: unknown): boolean => {
  try {
    const previousMarker = loadRendererRecoveryMarker();
    if (previousMarker && previousMarker.attempts >= 1) return false;

    if (!saveSessionSnapshot()) return false;

    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const marker: RendererRecoveryMarker = {
      version: RENDERER_RECOVERY_VERSION,
      attempts: (previousMarker?.attempts || 0) + 1,
      message: normalizedError.message,
      stack: normalizedError.stack,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(RENDERER_RECOVERY_STORAGE_KEY, JSON.stringify(marker));
    return true;
  } catch (recoveryError) {
    console.error("Failed to prepare renderer recovery:", recoveryError);
    return false;
  }
};

export const clearRendererRecoveryMarker = (): void => {
  try {
    localStorage.removeItem(RENDERER_RECOVERY_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear renderer recovery marker:", error);
  }
};

export const getRendererRecoveryStabilizationMs = (): number => RENDERER_RECOVERY_STABILIZATION_MS;

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
