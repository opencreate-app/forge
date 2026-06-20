/**
 * Purpose: Custom React hook that implements periodic auto-saving of projects based on user preferences and project dirtiness.
 */
import { useEffect } from "react";
import { useProjectStore } from "@store/projectStore";
import { usePreferencesStore } from "@store/preferencesStore";

/**
 * Custom hook to manage periodic project auto-saving.
 * Registers an interval based on user preferences if auto-save is enabled,
 * and dispatches a save event when the active project has unsaved changes.
 */
export const useAutosave = (): void => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const autosave = usePreferencesStore((state) => state.autosave);
  const autosaveInterval = usePreferencesStore((state) => state.autosaveInterval);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const isDirty = activeProject?.isDirty;
  const filePath = activeProject?.filePath;

  useEffect(() => {
    // console.log("useAutosave effect triggered", {
    //   autosave,
    //   autosaveInterval,
    //   activeProjectId,
    //   isDirty,
    //   filePath,
    // });
    // console.log("Active project details", activeProject);

    if (!autosave || !activeProjectId || !isDirty || !filePath) return;

    // Convert minutes to milliseconds
    const intervalMs = autosaveInterval * 60 * 1000;

    const timer = setInterval(() => {
      window.dispatchEvent(new CustomEvent("forge:save-project"));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [autosave, autosaveInterval, activeProjectId, isDirty, filePath]);
};
