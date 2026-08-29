/**
 * Purpose: Custom hook that listens for and handles global menu actions and Electron IPC events, such as saving, opening projects, and undo/redo operations.
 */
import { useEffect } from "react";
import { useProjectStore, getSerializableProject } from "@store/projectStore";
import { useRecentProjectsStore } from "@store/recentProjectsStore";
import { useUIStore } from "@store/uiStore";
import { useToolStore } from "@store/toolStore";
import { createProjectFromImage, loadImage } from "@utils/projectUtils";
import { forgeEvents, FORGE_EVENTS } from "@utils/events";

export const useMenuHandler = () => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const addProject = useProjectStore((state) => state.addProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const addLayer = useProjectStore((state) => state.addLayer);
  const duplicateLayer = useProjectStore((state) => state.duplicateLayer);
  const mergeLayers = useProjectStore((state) => state.mergeLayers);
  const removeLayers = useProjectStore((state) => state.removeLayers);
  const syncSmartObject = useProjectStore((state) => state.syncSmartObject);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const showToast = useUIStore((state) => state.showToast);
  const showRulers = useUIStore((state) => state.showRulers);
  const setShowRulers = useUIStore((state) => state.setShowRulers);
  const showGuides = useUIStore((state) => state.showGuides);
  const setShowGuides = useUIStore((state) => state.setShowGuides);
  const snapToGuides = useUIStore((state) => state.snapToGuides);
  const setSnapToGuides = useUIStore((state) => state.setSnapToGuides);
  const snapToLayers = useUIStore((state) => state.snapToLayers);
  const setSnapToLayers = useUIStore((state) => state.setSnapToLayers);
  const addRecentProject = useRecentProjectsStore((state) => state.addRecentProject);
  const rotateProject = useProjectStore((state) => state.rotateProject);
  const flipProject = useProjectStore((state) => state.flipProject);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  useEffect(() => {
    if (!(window as any).electronAPI) return;

    const handleAction = async (action: string, requestedProjectId?: string) => {
      const requestedProject = requestedProjectId
        ? useProjectStore.getState().projects.find((project) => project.id === requestedProjectId)
        : undefined;
      const projectForSave = requestedProject || activeProject;
      const isInputFocused =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      const isModalOpen = useUIStore.getState().isAnyModalOpen();

      // Guard all other actions if a modal is open, except standard edit operations
      if (isModalOpen) {
        if (
          action === "undo" ||
          action === "redo" ||
          action === "select-all" ||
          action === "save-project" ||
          action === "save-project-as"
        ) {
          // Standard edit operations are allowed ONLY if an input is focused
          if (!isInputFocused) return;
        } else {
          // All other actions are strictly blocked
          return;
        }
      }

      switch (action) {
        case "new-project":
          window.dispatchEvent(new CustomEvent("forge:new-project"));
          break;

        case "preferences":
          window.dispatchEvent(new CustomEvent("forge:open-preferences"));
          break;

        case "open-project":
          try {
            const result = await (window as any).electronAPI.openProject();
            if (result && result.success) {
              if (result.type === "project") {
                const projectData = JSON.parse(result.content);
                // Ensure it has the new fields and is not dirty
                projectData.filePath = result.filePath;
                projectData.isDirty = false;
                const projectId = addProject(projectData);
                setActiveTab(projectId);
                showToast("Project opened successfully", "info");
              } else if (result.type === "image") {
                const img = await loadImage(result.dataURL);
                const name = result.filePath
                  .split(/[\\/]/)
                  .pop()
                  .replace(/\.[^/.]+$/, "");
                const newProject = createProjectFromImage(
                  result.dataURL,
                  img.naturalWidth,
                  img.naturalHeight,
                  name,
                  result.filePath,
                );
                const projectId = addProject(newProject);
                setActiveTab(projectId);
                showToast("Image opened successfully", "info");
              }
            }
          } catch (err: any) {
            showToast(`Failed to open project: ${err.message}`, "error");
          }
          break;

        case "save-project":
          if (!projectForSave) return;

          if (projectForSave.parentLayerId) {
            try {
              await syncSmartObject(projectForSave.id);
              updateProject(projectForSave.id, { isDirty: false });
              showToast("Smart Object updated", "info");
              window.dispatchEvent(
                new CustomEvent("forge:save-project-finished", {
                  detail: { projectId: projectForSave.id, success: true },
                }),
              );
            } catch (err: any) {
              console.error("Sync error:", err);
              showToast(`Failed to update Smart Object: ${err.message}`, "error");
              window.dispatchEvent(
                new CustomEvent("forge:save-project-finished", {
                  detail: { projectId: projectForSave.id, success: false },
                }),
              );
            }
            return;
          }

          if (projectForSave.filePath) {
            const isImage = /\.(png|jpg|jpeg|webp|bmp)$/i.test(projectForSave.filePath);

            if (isImage) {
              window.dispatchEvent(
                new CustomEvent("forge:save-image", {
                  detail: { filePath: projectForSave.filePath, projectId: projectForSave.id },
                }),
              );
              return;
            }

            try {
              const appVersion = await (window as any).electronAPI.getAppVersion();
              const serializableProject = getSerializableProject(projectForSave);
              const jsonString = JSON.stringify({ ...serializableProject, version: appVersion });

              const result = await (window as any).electronAPI.saveProject({
                jsonString,
                filePath: projectForSave.filePath,
              });
              if (result.success) {
                updateProject(projectForSave.id, { isDirty: false, version: appVersion });
                showToast("Project saved", "info");

                // Request thumbnail and update recent projects
                window.dispatchEvent(
                  new CustomEvent("forge:request-thumbnail", {
                    detail: {
                      callback: (thumbnail: string) => {
                        addRecentProject({
                          id: projectForSave.id,
                          name: projectForSave.name,
                          filePath: result.filePath,
                          thumbnail,
                          lastModified: result.updatedAt,
                          fileSize: result.fileSize,
                        });
                      },
                    },
                  }),
                );

                window.dispatchEvent(
                  new CustomEvent("forge:save-project-finished", {
                    detail: { projectId: projectForSave.id, success: true },
                  }),
                );
              } else {
                window.dispatchEvent(
                  new CustomEvent("forge:save-project-finished", {
                    detail: { projectId: projectForSave.id, success: false },
                  }),
                );
              }
            } catch (err: any) {
              console.error("Save error:", err);
              showToast(`Failed to save project: ${err.message}`, "error");
              window.dispatchEvent(
                new CustomEvent("forge:save-project-finished", {
                  detail: { projectId: projectForSave.id, success: false },
                }),
              );
            }
          } else {
            handleAction("save-project-as", projectForSave.id);
          }
          break;

        case "save-project-as":
          if (!projectForSave) return;
          try {
            const appVersion = await (window as any).electronAPI.getAppVersion();
            const serializableProject = getSerializableProject(projectForSave);
            const jsonString = JSON.stringify({ ...serializableProject, version: appVersion });

            const isImage =
              projectForSave.filePath &&
              /\.(png|jpg|jpeg|webp|bmp)$/i.test(projectForSave.filePath);

            const result = await (window as any).electronAPI.saveProjectAs({
              jsonString,
              defaultName: isImage ? projectForSave.name : `${projectForSave.name}.ocfd`,
            });
            if (result.success) {
              updateProject(projectForSave.id, {
                isDirty: false,
                filePath: result.filePath,
                name: result.name,
                version: appVersion,
              });
              showToast("Project saved", "info");

              // Request thumbnail and update recent projects
              window.dispatchEvent(
                new CustomEvent("forge:request-thumbnail", {
                  detail: {
                    callback: (thumbnail: string) => {
                      addRecentProject({
                        id: projectForSave.id,
                        name: result.name,
                        filePath: result.filePath,
                        thumbnail,
                        lastModified: result.updatedAt,
                        fileSize: result.fileSize,
                      });
                    },
                  },
                }),
              );

              window.dispatchEvent(
                new CustomEvent("forge:save-project-finished", {
                  detail: { projectId: projectForSave.id, success: true },
                }),
              );
            } else {
              window.dispatchEvent(
                new CustomEvent("forge:save-project-finished", {
                  detail: { projectId: projectForSave.id, success: false },
                }),
              );
            }
          } catch (err: any) {
            console.error("Save As error:", err);
            showToast(`Failed to save project: ${err.message}`, "error");
            window.dispatchEvent(
              new CustomEvent("forge:save-project-finished", {
                detail: { projectId: projectForSave.id, success: false },
              }),
            );
          }
          break;

        case "open-export-modal":
          if (!activeProject) return;
          window.dispatchEvent(new CustomEvent("forge:open-export-modal"));
          break;

        case "open-image-size-modal":
          if (!activeProject) return;
          window.dispatchEvent(new CustomEvent("forge:open-image-size-modal"));
          break;

        case "rotate-90-cw":
          if (!activeProject) return;
          try {
            await rotateProject(activeProject.id, 90);
            showToast("Image rotated 90° CW", "info");
            forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
          } catch (err: any) {
            showToast(`Failed to rotate: ${err.message}`, "error");
          }
          break;

        case "rotate-90-ccw":
          if (!activeProject) return;
          try {
            await rotateProject(activeProject.id, 270);
            showToast("Image rotated 90° CCW", "info");
            forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
          } catch (err: any) {
            showToast(`Failed to rotate: ${err.message}`, "error");
          }
          break;

        case "rotate-180":
          if (!activeProject) return;
          try {
            await rotateProject(activeProject.id, 180);
            showToast("Image rotated 180°", "info");
            forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
          } catch (err: any) {
            showToast(`Failed to rotate: ${err.message}`, "error");
          }
          break;

        case "flip-horizontal":
          if (!activeProject) return;
          try {
            await flipProject(activeProject.id, "horizontal");
            showToast("Image flipped horizontally", "info");
            forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
          } catch (err: any) {
            showToast(`Failed to flip: ${err.message}`, "error");
          }
          break;

        case "flip-vertical":
          if (!activeProject) return;
          try {
            await flipProject(activeProject.id, "vertical");
            showToast("Image flipped vertically", "info");
            forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
          } catch (err: any) {
            showToast(`Failed to flip: ${err.message}`, "error");
          }
          break;

        case "export-to-clipboard":
          if (!activeProject) return;
          window.dispatchEvent(new CustomEvent("forge:export-to-clipboard"));
          break;

        case "undo":
          if (isInputFocused) {
            try {
              document.execCommand("undo");
            } catch (e) {
              console.warn("execCommand undo failed:", e);
            }
          } else if (activeProjectId) {
            if (useToolStore.getState().activeToolId === "transform") {
              window.dispatchEvent(new CustomEvent("forge:transform-undo"));
            } else {
              undo(activeProjectId);
            }
          }
          break;

        case "redo":
          if (isInputFocused) {
            try {
              document.execCommand("redo");
            } catch (e) {
              console.warn("execCommand redo failed:", e);
            }
          } else if (activeProjectId) {
            if (useToolStore.getState().activeToolId === "transform") {
              window.dispatchEvent(new CustomEvent("forge:transform-redo"));
            } else {
              redo(activeProjectId);
            }
          }
          break;

        case "add-layer":
          if (activeProjectId && !isInputFocused) {
            addLayer(activeProjectId, { type: "raster" });
          }
          break;

        case "duplicate-layer":
          if (!isInputFocused) {
            window.dispatchEvent(new CustomEvent("forge:duplicate-layer"));
          }
          break;

        case "merge-layers":
          if (
            activeProjectId &&
            activeProject &&
            !isInputFocused &&
            activeProject.selectedLayerIds.length > 0
          ) {
            await mergeLayers(activeProjectId, activeProject.selectedLayerIds);
          }
          break;

        case "remove-layer":
          if (
            activeProjectId &&
            activeProject &&
            (activeProject.selectedLayerIds?.length ?? 0) > 0
          ) {
            // Safety: Don't delete layer if typing in an input or textarea
            if (isInputFocused) {
              return;
            }
            removeLayers(activeProjectId, activeProject.selectedLayerIds);
          }
          break;

        case "close-project":
          window.dispatchEvent(new CustomEvent("forge:close-project"));
          break;

        case "toggle-rulers":
          setShowRulers(!showRulers);
          break;

        case "toggle-guides":
          setShowGuides(!showGuides);
          break;

        case "toggle-snap-guides":
          setSnapToGuides(!snapToGuides);
          break;

        case "toggle-snap-layers":
          setSnapToLayers(!snapToLayers);
          break;

        case "deselect":
          if (!isInputFocused) {
            window.dispatchEvent(new CustomEvent("forge:select-clear"));
          }
          break;

        case "select-all":
          if (isInputFocused) {
            if (
              document.activeElement instanceof HTMLInputElement ||
              document.activeElement instanceof HTMLTextAreaElement
            ) {
              document.activeElement.select();
            }
          } else {
            window.dispatchEvent(new CustomEvent("forge:select-all"));
          }
          break;

        case "zoom-in": {
          window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: 1 } }));
          break;
        }

        case "zoom-out": {
          window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { step: -1 } }));
          break;
        }

        case "zoom-100":
          if (activeProject) {
            window.dispatchEvent(new CustomEvent("forge:zoom-to", { detail: { zoom: 1 } }));
          }
          break;

        case "zoom-fit":
          window.dispatchEvent(
            new CustomEvent("forge:zoom-to", { detail: { zoom: -1 /* Trigger fit */ } }),
          );
          break;

        case "about":
          window.dispatchEvent(new CustomEvent("forge:open-about"));
          break;
      }
    };

    const cleanup = (window as any).electronAPI.onMenuAction(handleAction);
    const handleSaveRequest = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      void handleAction("save-project", projectId);
    };
    window.addEventListener("forge:save-project", handleSaveRequest);

    return () => {
      if (cleanup) cleanup();
      window.removeEventListener("forge:save-project", handleSaveRequest);
    };
  }, [
    activeProjectId,
    activeProject,
    addProject,
    updateProject,
    undo,
    redo,
    addLayer,
    duplicateLayer,
    mergeLayers,
    removeLayers,
    setActiveTab,
    showToast,
    showRulers,
    setShowRulers,
    showGuides,
    setShowGuides,
    snapToGuides,
    setSnapToGuides,
    snapToLayers,
    setSnapToLayers,
    addRecentProject,
    syncSmartObject,
    rotateProject,
    flipProject,
  ]);
};
