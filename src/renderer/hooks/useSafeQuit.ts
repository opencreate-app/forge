/**
 * Purpose: Handle Electron's SafeQuit requests, including aggregate unsaved-project confirmation and sequential saves.
 */
import { useEffect, useRef } from "react";
import { useProjectStore, type Project } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { clearSessionSnapshot, pauseSessionGuard, resumeSessionGuard } from "@utils/sessionGuard";

const SAVE_TIMEOUT_MS = 10_000;

const waitForProjectSave = (project: Project): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("forge:save-project-finished", handleFinished);
      window.clearTimeout(timeout);
      resolve(success);
    };

    const handleFinished = (event: Event) => {
      const { projectId, success } = (
        event as CustomEvent<{ projectId?: string; success: boolean }>
      ).detail;
      if (projectId && projectId !== project.id) return;
      finish(success);
    };

    const timeout = window.setTimeout(() => finish(false), SAVE_TIMEOUT_MS);
    window.addEventListener("forge:save-project-finished", handleFinished);

    window.dispatchEvent(
      new CustomEvent("forge:save-project", { detail: { projectId: project.id } }),
    );
  });

export const useSafeQuit = (): void => {
  const requestInProgressRef = useRef(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onSafeQuitRequested) return;

    const handleSafeQuitRequest = async () => {
      if (requestInProgressRef.current) return;
      requestInProgressRef.current = true;
      pauseSessionGuard();
      let keepSessionGuardPaused = false;

      try {
        const projects = useProjectStore.getState().projects;
        const dirtyProjects = projects.filter((project) => project.isDirty);
        let approved = true;

        if (dirtyProjects.length > 0) {
          const response = await api.confirmCloseAll(dirtyProjects.length);

          if (response === 2) {
            approved = false;
          } else if (response === 0) {
            for (const project of dirtyProjects) {
              useProjectStore.getState().setActiveProject(project.id);
              useUIStore.getState().setActiveTab(project.id);

              if (!(await waitForProjectSave(project))) {
                approved = false;
                break;
              }
            }
          }
        }

        if (approved) {
          clearSessionSnapshot();
        }
        await api.respondToSafeQuit(approved);
        keepSessionGuardPaused = approved;
      } catch (error) {
        console.error("SafeQuit failed:", error);
        await api.respondToSafeQuit(false);
      } finally {
        if (!keepSessionGuardPaused) resumeSessionGuard();
        requestInProgressRef.current = false;
      }
    };

    return api.onSafeQuitRequested(handleSafeQuitRequest);
  }, []);
};
