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
import { usePreferencesStore } from "./store/preferencesStore";
import { useAutosave } from "./hooks/useAutosave";
import { useToolStore } from "@store/toolStore";
import Toast from "./components/ui/Toast";
import { useMenuHandler } from "./hooks/useMenuHandler";

import { getClipboardImageDimensions } from "@utils/clipboardUtils";
import { forgeEvents, FORGE_EVENTS } from "@utils/events";
import { Box, X } from "lucide-react";

// ... (imports remain)

function App() {
  useMenuHandler();
  useAutosave();
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

  // Placeholder for update availability
  const [isUpdateAvailable, setIsUpdateAvailable] = React.useState(null as any);
  // const [isUpdateAvailable, setIsUpdateAvailable] = React.useState({
  //   version: "v0.1.1",
  //   channel: "stable",
  //   changelog_md: "https://example.com/changelog.md",
  //   isClosed: false,
  // });

  // (Placeholder) Simulate update check on mount
  React.useEffect(() => {
    // Simulate an update being available after 5 seconds
    // const updateTimeout = setTimeout(() => {
    //   setIsUpdateAvailable({
    //     version: "0.1.1",
    //     channel: "stable",
    //     changelog_md: "https://example.com/changelog.md",
    //     isClosed: false,
    //   });
    // }, 3500);
    // return () => clearTimeout(updateTimeout);
  }, []);

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
  const showToast = useUIStore((state) => state.showToast);
  const isInteracting = useToolStore((state) => state.isInteracting);
  const setShowRulers = useUIStore((state) => state.setShowRulers);
  const swapColors = useToolStore((state) => state.swapColors);
  const resetColors = useToolStore((state) => state.resetColors);

  const originalModeRef = React.useRef<any>(null);
  const pendingRestoreRef = React.useRef<boolean>(false);

  const activeProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === activeProjectId),
  );

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

    window.addEventListener("forge:new-project", handleNewProject);
    window.addEventListener("forge:open-export-modal", handleOpenExportModal as any);
    window.addEventListener("forge:open-preferences", handleOpenPreferences);
    window.addEventListener("forge:open-layer-styles", handleOpenLayerStyles);
    window.addEventListener("forge:open-color-fill-modal", handleOpenColorFill);
    window.addEventListener("forge:open-image-size-modal", handleOpenImageSize);

    return () => {
      window.removeEventListener("forge:new-project", handleNewProject);
      window.removeEventListener("forge:open-export-modal", handleOpenExportModal as any);
      window.removeEventListener("forge:open-preferences", handleOpenPreferences);
      window.removeEventListener("forge:open-layer-styles", handleOpenLayerStyles);
      window.removeEventListener("forge:open-color-fill-modal", handleOpenColorFill);
      window.removeEventListener("forge:open-image-size-modal", handleOpenImageSize);
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
      />
      <ColorFillModal
        isOpen={isColorFillModalOpen}
        onClose={() => setIsColorFillModalOpen(false)}
      />
      <ImageSizeModal
        isOpen={isImageSizeModalOpen}
        onClose={() => setIsImageSizeModalOpen(false)}
      />
      {/* Update Notification */}
      {isUpdateAvailable && !isUpdateAvailable.isClosed && (
        <div
          className="h-10 bg-accent overflow-hidden animate-banner-slide-down"
          id="banner-update-notification"
        >
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
              New patch <b>{isUpdateAvailable.version.trim()}</b> is available!
            </span>

            <button
              className="underline !cursor-pointer"
              onClick={() => {
                // TODO: Open changelog in a modal `ChangelogModal` rendering the markdown content
                showToast("(Placeholder) Opening changelog...", "info");
              }}
            >
              View Changelog
            </button>
            <button
              className="bg-white/90 text-accent px-3 py-1 rounded !cursor-pointer"
              onClick={() => {
                // TODO: Trigger actual update process
                showToast("(Placeholder) Downloading update...", "info");
              }}
            >
              Update Now
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
          <ToolOptions />
        </header>
      )}
      {/* 3. Main Area */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === "home" ? (
          <HomeScreen />
        ) : (
          <>
            <aside className="bg-[#222] border-r border-bg-tertiary">
              <Toolbar />
            </aside>

            <CanvasViewport key={activeProjectId || "empty"} />

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
