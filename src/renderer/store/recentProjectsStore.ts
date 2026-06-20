/**
 * Purpose: Zustand store for managing the list of recent projects with local storage persistence.
 * Stores project metadata and cached thumbnails for the Home screen.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface RecentProject {
  id: string;
  name: string;
  filePath: string;
  thumbnail: string; // Base64 JPEG
  lastModified: string; // ISO string
  fileSize: number; // Bytes
}

interface RecentProjectsState {
  recentProjects: RecentProject[];

  /** Adds or updates a project in the recent list. */
  addRecentProject: (project: RecentProject) => void;
  /** Removes a project from the recent list. */
  removeRecentProject: (id: string) => void;
  /** Clears the entire list of recent projects. */
  clearRecentProjects: () => void;
}

const MAX_RECENT_PROJECTS = 50;

export const useRecentProjectsStore = create<RecentProjectsState>()(
  persist(
    (set) => ({
      recentProjects: [],

      addRecentProject: (project) =>
        set((state) => {
          // Remove if already exists to move it to the top
          const filtered = state.recentProjects.filter(
            (p) => p.id !== project.id && p.filePath !== project.filePath,
          );

          const newList = [project, ...filtered].slice(0, MAX_RECENT_PROJECTS);

          return { recentProjects: newList };
        }),

      removeRecentProject: (id) =>
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.id !== id),
        })),

      clearRecentProjects: () => set({ recentProjects: [] }),
    }),
    {
      name: "forge-recent-projects-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
