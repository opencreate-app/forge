/**
 * Purpose: Zustand store for managing user preferences including theme, auto-save, and history configuration with local storage persistence.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Interface representing the structure of user preferences state and actions.
 */
interface PreferencesState {
  /** The UI theme style ('dark', 'light', or 'auto') */
  theme: "dark" | "light" | "auto";
  /** Whether auto-save is enabled */
  autosave: boolean;
  /** Auto-save interval duration in minutes */
  autosaveInterval: number;
  /** Whether to save history undo/redo stacks inside the project file (.ocfd) */
  saveHistory: boolean;
  /** The maximum number of actions preserved in the history stack */
  historyLimit: number;

  /** Updates the active UI theme style */
  setTheme: (theme: "dark" | "light" | "auto") => void;
  /** Toggles the auto-save configuration state */
  setAutosave: (enabled: boolean) => void;
  /** Updates the auto-save interval duration */
  setAutosaveInterval: (interval: number) => void;
  /** Toggles whether project history is serialized in documents */
  setSaveHistory: (enabled: boolean) => void;
  /** Sets the history limit value */
  setHistoryLimit: (limit: number) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "dark",
      autosave: false,
      autosaveInterval: 5,
      saveHistory: false,
      historyLimit: 50,

      setTheme: (theme) => set({ theme }),
      setAutosave: (autosave) => set({ autosave }),
      setAutosaveInterval: (autosaveInterval) =>
        set({ autosaveInterval: Math.max(1, Math.min(60, autosaveInterval)) }),
      setSaveHistory: (saveHistory) => set({ saveHistory }),
      setHistoryLimit: (historyLimit) =>
        set({ historyLimit: Math.max(10, Math.min(200, historyLimit)) }),
    }),
    {
      name: "forge-preferences-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
