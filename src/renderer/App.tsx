/**
 * Purpose: Root React component that defines the application layout, manages global keyboard shortcuts, and orchestrates the main UI components.
 */
import React from "react";
import { useUIStore } from "@store/uiStore";
import { useProjectStore, Project } from "@store/projectStore";
import CanvasViewport from "./components/CanvasViewport";
import RightSidebar from "./components/Sidebar/RightSidebar";
import Toolbar from "./components/Toolbar";
import ToolOptions from "./components/ToolOptions";
import ProjectTabs from "./components/ProjectTabs";
import HomeScreen from "./components/HomeScreen";
import NewProject from "./components/modals/NewProject";
import ExportModal from "./components/modals/ExportModal";
import { PreferencesModal } from "./components/modals/PreferencesModal";
import { LayerStylesModal } from "./components/modals/LayerStylesModal";
import { ColorFillModal } from "./components/modals/ColorFillModal";
import { ImageSizeModal } from "./components/modals/ImageSizeModal";
import { AboutModal } from "./components/modals/AboutModal";
import ColorPickerModal from "./components/modals/ColorPickerModal";
import GradientEditorModal from "./components/modals/GradientEditorModal";
import { usePreferencesStore } from "./store/preferencesStore";
import { useAutosave } from "./hooks/useAutosave";
import { useSessionGuard } from "./hooks/useSessionGuard";
import { useSafeQuit } from "./hooks/useSafeQuit";
import { useToolStore } from "@store/toolStore";
import Toast from "./components/ui/Toast";
import { useMenuHandler } from "./hooks/useMenuHandler";

import { getClipboardImageDimensions } from "@utils/clipboardUtils";
import { forgeEvents, FORGE_EVENTS } from "@utils/events";
import type { ColorPickerOpenRequest } from "@utils/colorPicker";
import type {
  GradientEditorLayerRequestDetail,
  GradientEditorOpenRequest,
} from "@utils/gradientEditor";
import { Box, X } from "lucide-react";

// ... (imports remain)

interface UpdateInfo {
  version: string;
  releaseUrl: string;
  isPortable: boolean;
  assetName: string | null;
  isClosed: boolean;
}

interface ColorFillPickerRequestDetail {
  projectId: string;
  layerId: string;
}

function App() {
  useMenuHandler();
  useAutosave();
  useSessionGuard();
  useSafeQuit();
  const theme = usePreferencesStore((state) => state.theme);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const activeTab = useUIStore((state) => state.activeTab);
  const initializeStore = useProjectStore((state) => state.initialize);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  React.useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = React.useState(false);
  const [newProjectInitialDimensions, setNewProjectInitialDimensions] = React.useState<
    { width: number; height: number } | undefined
  >(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = React.useState(false);
  const [isLayerStylesModalOpen, setIsLayerStylesModalOpen] = React.useState(false);
  const [isColorFillModalOpen, setIsColorFillModalOpen] = React.useState(false);
  const [isImageSizeModalOpen, setIsImageSizeModalOpen] = React.useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = React.useState(false);
  const [colorPickerRequest, setColorPickerRequest] = React.useState<ColorPickerOpenRequest | null>(
    null,
  );
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState(false);
  const [colorPickerSession, setColorPickerSession] = React.useState(0);
  const [gradientEditorRequest, setGradientEditorRequest] =
    React.useState<GradientEditorOpenRequest | null>(null);
  const [isGradientEditorOpen, setIsGradientEditorOpen] = React.useState(false);
  const [gradientEditorSession, setGradientEditorSession] = React.useState(0);

  // Auto-update state
  const [isUpdateAvailable, setIsUpdateAvailable] = React.useState<UpdateInfo | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = React.useState<number | null>(null);

  const showToast = useUIStore((state) => state.showToast);

  // Auto-update IPC listeners
  React.useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    const cleanups = [
      api.onUpdateAvailable((info: any) => {
        setIsUpdateAvailable({ ...info, isClosed: false });
      }),
      api.onUpdateDownloadProgress(({ percent }: { percent: number }) => {
        setUpdateDownloadProgress(percent);
      }),
      api.onUpdateDownloadComplete(({ filePath }: { filePath: string }) => {
        setUpdateDownloadProgress(null);
        api.installUpdate(filePath);
      }),
      api.onUpdateDownloadError(({ message }: { message: string }) => {
        setUpdateDownloadProgress(null);
        showToast(`Update failed: ${message}`, "error");
      }),
    ];

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [showToast]);

  const showRulers = useUIStore((state) => state.showRulers);
  const showGuides = useUIStore((state) => state.showGuides);
  const snapToGuides = useUIStore((state) => state.snapToGuides);
  const snapToLayers = useUIStore((state) => state.snapToLayers);

  React.useEffect(() => {
    if (!(window as any).electronAPI) return;
    const hasProject = projects.length > 0 && activeProjectId !== null && activeTab !== "home";
    (window as any).electronAPI.updateMenu({
      hasProject,
      showRulers,
      showGuides,
      snapToGuides,
      snapToLayers,
    });
  }, [
    projects.length,
    activeProjectId,
    activeTab,
    showRulers,
    showGuides,
    snapToGuides,
    snapToLayers,
  ]);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const activeToolId = useToolStore((state) => state.activeToolId);
  const toolSettings = useToolStore((state) => state.toolSettings);
  const updateToolSettings = useToolStore((state) => state.updateToolSettings);
  const transformSettings = useToolStore((state) => state.toolSettings.transform);
  const isInteracting = useToolStore((state) => state.isInteracting);
  const setShowRulers = useUIStore((state) => state.setShowRulers);
  const swapColors = useToolStore((state) => state.swapColors);
  const resetColors = useToolStore((state) => state.resetColors);
  const foregroundColor = useToolStore((state) => state.foregroundColor);
  const backgroundColor = useToolStore((state) => state.backgroundColor);
  const setForegroundColor = useToolStore((state) => state.setForegroundColor);
  const setBackgroundColor = useToolStore((state) => state.setBackgroundColor);

  const originalModeRef = React.useRef<any>(null);
  const pendingRestoreRef = React.useRef<boolean>(false);

  const activeProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === activeProjectId),
  );

  const openColorPicker = React.useCallback((request: ColorPickerOpenRequest) => {
    setColorPickerRequest(request);
    setColorPickerSession((session) => session + 1);
    setIsColorPickerOpen(true);
  }, []);

  const openGradientEditor = React.useCallback(
    (request: GradientEditorOpenRequest) => {
      if (request.target === "layer" && request.projectId && request.layerId) {
        const project = useProjectStore
          .getState()
          .projects.find((item) => item.id === request.projectId);
        const layer = project?.layers.find((item) => item.id === request.layerId);
        let parentId = layer?.parentId;
        let locked = layer?.locked ?? false;
        while (!locked && parentId && project) {
          const parent = project.layers.find((item) => item.id === parentId);
          if (!parent) break;
          locked = parent.locked;
          parentId = parent.parentId;
        }
        if (locked) {
          showToast("Unlock the layer to edit its gradient.", "warning");
          return;
        }
      }

      setGradientEditorRequest(request);
      setGradientEditorSession((session) => session + 1);
      setIsGradientEditorOpen(true);
    },
    [showToast],
  );

  const openGradientEditorForLayer = React.useCallback(
    (projectId: string, layerId: string) => {
      const project = useProjectStore.getState().projects.find((item) => item.id === projectId);
      const layer = project?.layers.find((item) => item.id === layerId);
      if (!project || !layer || layer.type !== "gradient_fill" || !layer.gradientFill) return;

      let parentId = layer.parentId;
      let locked = layer.locked;
      while (!locked && parentId) {
        const parent = project.layers.find((item) => item.id === parentId);
        if (!parent) break;
        locked = parent.locked;
        parentId = parent.parentId;
      }
      if (locked) {
        showToast("Unlock the layer to edit its gradient.", "warning");
        return;
      }

      useProjectStore.getState().setActiveLayer(projectId, layerId);
      openGradientEditor({
        target: "layer",
        projectId,
        layerId,
        initialPreset: {
          id: layer.id,
          name: layer.name,
          type: layer.gradientFill.type,
          colors: layer.gradientFill.colors.map((stop) => ({ ...stop })),
        },
      });
    },
    [openGradientEditor, showToast],
  );

  const openToolbarColorPicker = React.useCallback(
    (target: "foreground" | "background") => {
      const initialColor = target === "foreground" ? foregroundColor : backgroundColor;
      openColorPicker({
        initialColor,
        onApply: target === "foreground" ? setForegroundColor : setBackgroundColor,
      });
    },
    [backgroundColor, foregroundColor, openColorPicker, setBackgroundColor, setForegroundColor],
  );

  const openColorFillColorPicker = React.useCallback(
    (projectId: string, layerId: string) => {
      const project = useProjectStore.getState().projects.find((item) => item.id === projectId);
      const layer = project?.layers.find((item) => item.id === layerId);
      if (!project || !layer || layer.type !== "color_fill") return;

      openColorPicker({
        initialColor: layer.colorFill?.color || "#000000",
        onApply: (color) =>
          useProjectStore.getState().updateLayer(project.id, layer.id, {
            colorFill: { color },
          }),
      });
    },
    [openColorPicker],
  );

  React.useEffect(() => {
    if (activeTab === "home") setIsColorPickerOpen(false);
  }, [activeTab]);

  React.useEffect(() => {
    const handleOpenColorPickerForLayer = (event: Event) => {
      const { projectId, layerId } = (event as CustomEvent<ColorFillPickerRequestDetail>).detail;
      openColorFillColorPicker(projectId, layerId);
    };
    const handleOpenGradientEditorForLayer = (event: Event) => {
      const { projectId, layerId } = (event as CustomEvent<GradientEditorLayerRequestDetail>)
        .detail;
      openGradientEditorForLayer(projectId, layerId);
    };

    window.addEventListener("forge:open-color-picker-for-layer", handleOpenColorPickerForLayer);
    window.addEventListener(
      "forge:open-gradient-editor-for-layer",
      handleOpenGradientEditorForLayer,
    );
    return () => {
      window.removeEventListener(
        "forge:open-color-picker-for-layer",
        handleOpenColorPickerForLayer,
      );
      window.removeEventListener(
        "forge:open-gradient-editor-for-layer",
        handleOpenGradientEditorForLayer,
      );
    };
  }, [openColorFillColorPicker, openGradientEditorForLayer]);

  // Restore mode when interaction ends
  React.useEffect(() => {
    if (!isInteracting && pendingRestoreRef.current && originalModeRef.current) {
      updateToolSettings("select", { mode: originalModeRef.current });
      originalModeRef.current = null;
      pendingRestoreRef.current = false;
    }
  }, [isInteracting, updateToolSettings]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (useUIStore.getState().isAnyModalOpen()) return;
      if (e.key === "Alt") e.preventDefault(); // Prevent app menu focus

      // Handle SelectTool modifiers for visual feedback
      if (activeToolId === "select") {
        if ((e.shiftKey || e.altKey) && !originalModeRef.current) {
          originalModeRef.current = toolSettings.select.mode;
        }

        if (!isInteracting) {
          if (e.shiftKey && e.altKey) {
            updateToolSettings("select", { mode: "intersect" });
          } else if (e.shiftKey) {
            updateToolSettings("select", { mode: "unite" });
          } else if (e.altKey) {
            updateToolSettings("select", { mode: "subtract" });
          }
        }
      }

      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      // Ignore if typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        // Exception: allow shortcuts if it's the hidden text input and we're not actively editing
        if (document.activeElement.id === "forge-text-input" && !toolSettings.text.isEditing) {
          // Continue to global shortcuts
        } else {
          if (e.key === "Enter") {
            if (activeToolId === "transform")
              window.dispatchEvent(new CustomEvent("forge:transform-apply"));
            if (activeToolId === "crop") window.dispatchEvent(new CustomEvent("forge:crop-apply"));
          } else if (e.key === "Escape") {
            if (activeToolId === "transform")
              window.dispatchEvent(new CustomEvent("forge:transform-cancel"));
            if (activeToolId === "crop") window.dispatchEvent(new CustomEvent("forge:crop-cancel"));
          }
          return;
        }
      }

      const checkDirty = (nextToolId: string) => {
        if (
          activeToolId === "transform" &&
          transformSettings.isDirty &&
          nextToolId !== "transform"
        ) {
          return false;
        }
        return true;
      };

      if (isCmdOrCtrl && e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (checkDirty("transform")) setActiveTool("transform");
      } else if (e.key === "Enter") {
        if (activeToolId === "transform")
          window.dispatchEvent(new CustomEvent("forge:transform-apply"));
        if (activeToolId === "crop") window.dispatchEvent(new CustomEvent("forge:crop-apply"));
      } else if (e.key === "Escape") {
        if (activeToolId === "transform")
          window.dispatchEvent(new CustomEvent("forge:transform-cancel"));
        if (activeToolId === "crop") window.dispatchEvent(new CustomEvent("forge:crop-cancel"));
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        // Tool shortcuts - only if no modifiers
        if (e.key.toLowerCase() === "v") {
          if (checkDirty("move")) setActiveTool("move");
        } else if (e.key.toLowerCase() === "b") {
          if (checkDirty("brush")) setActiveTool("brush");
        } else if (e.key.toLowerCase() === "e") {
          if (checkDirty("eraser")) setActiveTool("eraser");
        } else if (e.key.toLowerCase() === "p") {
          if (checkDirty("pencil")) setActiveTool("pencil");
        } else if (e.key.toLowerCase() === "m") {
          if (checkDirty("select")) setActiveTool("select");
        } else if (e.key.toLowerCase() === "c") {
          if (checkDirty("crop")) setActiveTool("crop");
        } else if (e.key.toLowerCase() === "t") {
          if (checkDirty("text")) setActiveTool("text");
        } else if (e.key.toLowerCase() === "g") {
          if (checkDirty("paintBucket")) setActiveTool("paintBucket");
        } else if (e.key.toLowerCase() === "x") {
          swapColors();
        } else if (e.key.toLowerCase() === "d") {
          resetColors();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (useUIStore.getState().isAnyModalOpen()) return;
      if (activeToolId === "select" && originalModeRef.current) {
        if (!e.shiftKey && !e.altKey) {
          if (isInteracting) {
            pendingRestoreRef.current = true;
          } else {
            updateToolSettings("select", { mode: originalModeRef.current });
            originalModeRef.current = null;
            pendingRestoreRef.current = false;
          }
        } else if (!isInteracting) {
          if (e.shiftKey && !e.altKey) {
            updateToolSettings("select", { mode: "unite" });
          } else if (!e.shiftKey && e.altKey) {
            updateToolSettings("select", { mode: "subtract" });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    setActiveTool,
    activeToolId,
    transformSettings.isDirty,
    showToast,
    toolSettings.select.mode,
    toolSettings.text.isEditing,
    updateToolSettings,
    showRulers,
    setShowRulers,
    activeProjectId,
    isInteracting,
    swapColors,
    resetColors,
  ]);

  const [exportProject, setExportProject] = React.useState<Project | null>(null);

  React.useEffect(() => {
    const handleNewProject = async () => {
      const dimensions = await getClipboardImageDimensions();
      setNewProjectInitialDimensions(dimensions || undefined);
      setIsNewProjectModalOpen(true);
    };
    const handleOpenExportModal = (e: any) => {
      setExportProject(e.detail?.project || null);
      setIsExportModalOpen(true);
    };
    const handleOpenPreferences = () => setIsPreferencesModalOpen(true);
    const handleOpenLayerStyles = () => setIsLayerStylesModalOpen(true);
    const handleOpenColorFill = () => setIsColorFillModalOpen(true);
    const handleOpenImageSize = () => setIsImageSizeModalOpen(true);
    const handleOpenAbout = () => setIsAboutModalOpen(true);

    window.addEventListener("forge:new-project", handleNewProject);
    window.addEventListener("forge:open-export-modal", handleOpenExportModal as any);
    window.addEventListener("forge:open-preferences", handleOpenPreferences);
    window.addEventListener("forge:open-layer-styles", handleOpenLayerStyles);
    window.addEventListener("forge:open-color-fill-modal", handleOpenColorFill);
    window.addEventListener("forge:open-image-size-modal", handleOpenImageSize);
    window.addEventListener("forge:open-about", handleOpenAbout);

    return () => {
      window.removeEventListener("forge:new-project", handleNewProject);
      window.removeEventListener("forge:open-export-modal", handleOpenExportModal as any);
      window.removeEventListener("forge:open-preferences", handleOpenPreferences);
      window.removeEventListener("forge:open-layer-styles", handleOpenLayerStyles);
      window.removeEventListener("forge:open-color-fill-modal", handleOpenColorFill);
      window.removeEventListener("forge:open-image-size-modal", handleOpenImageSize);
      window.removeEventListener("forge:open-about", handleOpenAbout);
    };
  }, []);

  const fileName = activeProject?.filePath
    ? activeProject?.filePath.split(/[\\/]/).pop()
    : activeProject?.name || "Unknown";

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text overflow-hidden relative">
      <Toast />
      <NewProject
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        initialDimensions={newProjectInitialDimensions}
      />
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setExportProject(null);
        }}
        project={exportProject || undefined}
      />{" "}
      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
      />
      <LayerStylesModal
        isOpen={isLayerStylesModalOpen}
        onClose={() => setIsLayerStylesModalOpen(false)}
        onOpenColorPicker={openColorPicker}
      />
      <ColorFillModal
        isOpen={isColorFillModalOpen}
        onClose={() => setIsColorFillModalOpen(false)}
        onOpenColorPicker={openColorPicker}
      />
      <ImageSizeModal
        isOpen={isImageSizeModalOpen}
        onClose={() => setIsImageSizeModalOpen(false)}
      />
      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
      <ColorPickerModal
        key={colorPickerSession}
        isOpen={isColorPickerOpen && activeTab !== "home" && colorPickerRequest !== null}
        initialColor={colorPickerRequest?.initialColor || "#000000"}
        onPreview={colorPickerRequest?.onPreview}
        onApply={colorPickerRequest?.onApply || (() => undefined)}
        onCancel={colorPickerRequest?.onCancel}
        onClose={() => {
          setIsColorPickerOpen(false);
          setColorPickerRequest(null);
        }}
      />
      <GradientEditorModal
        key={gradientEditorSession}
        isOpen={isGradientEditorOpen && activeTab !== "home"}
        request={gradientEditorRequest}
        onOpenColorPicker={openColorPicker}
        onClose={() => {
          setIsGradientEditorOpen(false);
          setGradientEditorRequest(null);
        }}
      />
      {/* Update Notification */}
      {isUpdateAvailable && !isUpdateAvailable.isClosed && (
        <div
          className="h-10 bg-accent overflow-hidden animate-banner-slide-down relative"
          id="banner-update-notification"
        >
          {/* Progress Bar */}
          {updateDownloadProgress !== null && updateDownloadProgress >= 0 && (
            <div
              className="absolute bottom-0 left-0 h-1 bg-white/40 transition-all duration-300 z-10"
              style={{ width: `${updateDownloadProgress}%` }}
            />
          )}

          <style>
            {`@keyframes banner-fade-in {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .animate-banner-fade-in {
              animation: banner-fade-in 500ms 200ms ease forwards;
            }

            @keyframes banner-slide-down {
              from { margin-top: -40px; }
              to { margin-top: 0; }
            }
            @keyframes banner-slide-up {
              from { margin-top: 0; }
              to { margin-top: -40px; }
            }
            .animate-banner-slide-down {
              animation: banner-slide-down 0.5s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .animate-banner-slide-up {
              animation: banner-slide-up 0.5s cubic-bezier(0.25, 1, 0.5, 1);
            }
          `}
          </style>
          <div className="w-full h-full flex gap-3 items-center justify-center px-4 text-[0.85rem] text-text relative opacity-0 animate-banner-fade-in">
            <span className="mr-2">
              New version <b>{isUpdateAvailable.version.trim()}</b> is available!
            </span>

            {!isUpdateAvailable.isPortable && (
              <button
                className="underline !cursor-pointer"
                onClick={() => {
                  (window as any).electronAPI.openExternal(isUpdateAvailable.releaseUrl);
                }}
              >
                View Release Notes
              </button>
            )}
            <button
              className="bg-white/90 text-accent px-3 py-1 rounded !cursor-pointer flex items-center gap-2 disabled:opacity-50"
              disabled={updateDownloadProgress !== null}
              onClick={() => {
                if (isUpdateAvailable.isPortable) {
                  (window as any).electronAPI.openReleasePage(isUpdateAvailable.releaseUrl);
                } else {
                  if (isUpdateAvailable.assetName) {
                    (window as any).electronAPI.downloadUpdate({
                      version: isUpdateAvailable.version,
                      assetName: isUpdateAvailable.assetName,
                    });
                    setUpdateDownloadProgress(0);
                  } else {
                    (window as any).electronAPI.openReleasePage(isUpdateAvailable.releaseUrl);
                  }
                }
              }}
            >
              {updateDownloadProgress !== null
                ? `Downloading... ${updateDownloadProgress}%`
                : isUpdateAvailable.isPortable
                  ? "Go to Release Page"
                  : "Update Now"}
            </button>

            <button
              className="flex justify-center items-center text-sm text-text absolute right-3 top-0 bottom-0 my-auto w-6 h-6 rounded-full !cursor-pointer bg-transparent hover:bg-white/20 transition-all "
              onClick={() => {
                // Animate slide up before closing
                const updateNotification = document.getElementById("banner-update-notification");
                if (updateNotification) {
                  updateNotification.classList.remove("animate-banner-slide-down");
                  updateNotification.classList.add("animate-banner-slide-up");
                  const timeout = setTimeout(() => {
                    setIsUpdateAvailable({ ...isUpdateAvailable, isClosed: true });
                    clearTimeout(timeout);
                  }, 500); // Match the animation duration
                } else {
                  setIsUpdateAvailable({ ...isUpdateAvailable, isClosed: true });
                }
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {/* 1. Project Tabs */}
      <ProjectTabs />
      {/* 2. Dynamic Header (Tool Options) */}
      {activeTab !== "home" && (
        <header className="bg-[#222] border-b border-bg-tertiary flex items-center">
          <ToolOptions
            onOpenColorPicker={openColorPicker}
            onOpenGradientEditor={openGradientEditor}
          />
        </header>
      )}
      {/* 3. Main Area */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === "home" ? (
          <HomeScreen />
        ) : (
          <>
            <aside className="bg-[#222] border-r border-bg-tertiary">
              <Toolbar onOpenColorPicker={openToolbarColorPicker} />
            </aside>

            <CanvasViewport key={activeProjectId || "empty"} onOpenColorPicker={openColorPicker} />

            <RightSidebar />
          </>
        )}
      </main>
      {/* 4. Footer / Status Bar */}
      <footer className="h-[25px] px-4 bg-[#222] border-t border-bg-tertiary text-[0.75rem] flex items-center justify-between text-[#888]">
        <div
          className={`flex items-center gap-1 ${activeProject?.parentProjectId ? "italic" : ""} ${activeProject?.isDirty ? "font-bold" : ""}`}
        >
          {activeTab === "home" ? (
            "Welcome to OpenCreate Forge"
          ) : (
            <>
              {activeProject?.parentProjectId ? (
                <Box size={12} className="text-accent inline-block mb-[2px] mr-1" />
              ) : null}
              {`Editing ${fileName}`}
            </>
          )}
        </div>
        {activeProject && activeTab !== "home" && (
          <div className="flex gap-4">
            <span>
              {activeProject.width} x {activeProject.height} px
            </span>
            <button
              className="text-accent font-bold"
              onClick={() => {
                forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
              }}
            >
              Zoom: {Math.round(activeProject.zoom * 100)}%
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
