/**
 * Purpose: Initial dashboard component shown when no projects are open, offering options to create new projects or open existing ones.
 */
import React, { useState, useEffect, useCallback } from "react";
// import { Plus, FolderOpen } from "lucide-react";
import { useProjectStore, Project } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { useRecentProjectsStore, RecentProject } from "@store/recentProjectsStore";
import { ShortcutSpan } from "./ui/Global";
import { createProjectFromImage, loadImage } from "@utils/projectUtils";
import { getRelativeTime, formatFileSize, formatFullDateTime } from "@utils/dateUtils";
import ContextMenu from "./ui/ContextMenu";
import { FolderOpen, Edit2, ImageDown, Images, Trash, XCircle } from "lucide-react";
import RenameModal from "./modals/RenameModal";
import { ForgeEngine } from "@core/engine/ForgeEngine";

const LogoDark = ({ width }: { width: number }) => {
  const originalWidth = 603;
  const originalHeight = 200;
  const height = (width * originalHeight) / originalWidth;

  return (
    <svg
      version="1.2"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 603 200"
      width={width}
      height={height}
    >
      <style>{`.a{fill:#ff6c00}.b{fill:#ccc}.c{fill:#fff}`}</style>
      <path
        className="a"
        d="m37.3 106h19.6q-0.9 4.5-0.9 9.3c0 7.2 1.6 14 4.5 20-6.4 5-14.4 8-23.2 8v46.7c-20.6 0-37.3-16.7-37.3-37.3v-65.4c0-20.6 16.7-37.3 37.3-37.3h62.3c0 7.1-2 13.8-5.5 19.4-11.7 2.2-21.8 8.7-28.7 17.8q-1.6 0.1-3.2 0.1h-24.9zm65.4 84h-37.4l12.5-37.3h24.9c-20.7 0-37.4-16.7-37.4-37.3 0-20.7 16.7-37.4 37.4-37.4 7.3 0 14.2 2.2 20 5.8l17.3-5.8v74.7c0 20.6-16.7 37.3-37.3 37.3zm9.3-74.6c0-5.2-4.2-9.4-9.3-9.4-5.2 0-9.4 4.2-9.4 9.4 0 5.1 4.2 9.3 9.4 9.3 5.1 0 9.3-4.2 9.3-9.3z"
      />
      <path
        className="b"
        d="m205 50c-13.8 0-25-11.2-25-25 0-13.8 11.2-25 25-25 13.8 0 25 11.2 25 25 0 13.8-11.2 25-25 25zm15-25c0-8.3-6.7-15-15-15-8.3 0-15 6.7-15 15 0 8.3 6.7 15 15 15 8.3 0 15-6.7 15-15zm35 25q0 0 0 0 0 0-0.1 0-2.4 0-4.8-0.6l2.5-9.7q1.1 0.3 2.4 0.3c5.5 0 10-4.5 10-10 0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10v30h-10v-50h10v2.7c2.9-1.7 6.4-2.7 10-2.7 11.1 0 20 8.9 20 20 0 11.1-8.9 20-20 20zm39.8-0.7c-10.7-2.8-17-13.8-14.1-24.5 2.8-10.7 13.8-17 24.5-14.1 9 2.4 14.9 10.6 14.8 19.6v-0.3h-10c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7c-3.2 0.8-6.7 0.8-10.1-0.1zm50.2-39.3c11.1 0 20 8.9 20 20v20h-10v-20c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10v20h-10v-20c0-11.1 8.9-20 20-20zm50 40c-13.8 0-25-11.2-25-25 0-13.8 11.2-25 25-25 6.9 0 13.2 2.8 17.7 7.3l-7.1 7.1c-2.7-2.7-6.5-4.4-10.6-4.4-8.3 0-15 6.7-15 15 0 8.3 6.7 15 15 15 4.1 0 7.9-1.7 10.6-4.4l7.1 7.1c-4.5 4.5-10.8 7.3-17.7 7.3zm42.5-40q2.5 0 4.9 0.6l-2.5 9.7q-1.1-0.3-2.4-0.3c-5.5 0-10 4.5-10 10v20h-10c0 0 0-20 0-20 0-11.1 8.9-20 20-20zm22.3 39.3c-10.7-2.8-17-13.8-14.1-24.5 2.8-10.7 13.8-17 24.5-14.1 9 2.4 14.9 10.6 14.8 19.6v-0.3h-10c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7c-3.2 0.8-6.7 0.8-10.1-0.1zm50.3 0.7c-11.1 0-20.1-8.9-20.1-20 0-11.1 8.9-20 20-20 11.1 0 20 8.9 20 20v20h-10v-20c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7q-2.4 0.6-4.8 0.6zm44.9 0c-11.1 0-20-8.9-20-20v-20h20v10h-10v10c0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7q-2.4 0.6-4.9 0.6zm22.3-0.7c-10.7-2.8-17-13.8-14.1-24.5 2.8-10.7 13.8-17 24.5-14.1 9 2.4 14.9 10.6 14.8 19.6v-0.3h-10c0-5.5-4.5-10-10-10-5.5 0-10 4.5-10 10 0 5.5 4.5 10 10 10q1.3 0 2.4-0.3l2.5 9.7c-3.2 0.8-6.7 0.8-10.1-0.1z"
      />
      <path
        className="c"
        d="m200 170h-20v-100h60l-5 20h-35v20h20v20h-20zm59.6-1.4c-21.3-5.7-34-27.6-28.2-49 5.7-21.3 27.6-34 49-28.2 21.3 5.7 34 27.6 28.2 49-5.7 21.3-27.6 34-49 28.2zm30.4-38.6c0-11.1-8.9-20-20-20-11.1 0-20 8.9-20 20 0 11.1 8.9 20 20 20 11.1 0 20-8.9 20-20zm65-40c3.3 0 6.6 0.4 9.7 1.2l-4.8 19.4q-2.4-0.6-4.9-0.6c-11.1 0-20 8.9-20 20v40h-20v-40c0-22.1 17.9-40 40-40zm50 90c9.3 0 17.2-6.4 19.4-15-8.8 4.8-19.3 6.4-29.8 3.6-21.3-5.7-34-27.6-28.2-49 5.7-21.3 27.6-34 49-28.2 3.4 0.9 6.6 2.3 9.6 4v-5.4h20v39.4q0 0.5 0 1.1v28.9c0.1 3.6-0.4 7.3-1.4 11-5.6 21.1-27.1 33.7-48.3 28.4l4.8-19.4q2.4 0.6 4.9 0.6zm20-50c0-11.1-8.9-20-20-20-11.1 0-20 8.9-20 20 0 11.1 8.9 20 20 20 11.1 0 20-8.9 20-20zm54.6 38.6c-21.3-5.7-34-27.6-28.2-49 5.7-21.3 27.6-34 49-28.2 18 4.8 29.9 21.2 29.6 39.1v-0.5h-20c0-11.1-8.9-20-20-20-11.1 0-20 8.9-20 20 0 11.1 8.9 20 20 20q2.5 0 4.9-0.6l4.8 19.4c-6.4 1.6-13.2 1.7-20.1-0.2z"
      />
    </svg>
  );
};

const RecentProjectItem: React.FC<{
  project: RecentProject;
  onClick: (project: RecentProject) => void;
  onContextMenu: (e: React.MouseEvent, project: RecentProject) => void;
}> = ({ project, onClick, onContextMenu }) => {
  return (
    <div
      onClick={() => onClick(project)}
      onContextMenu={(e) => onContextMenu(e, project)}
      className="flex flex-col gap-2 group cursor-pointer w-[150px] relative before:absolute before:inset-0 before:bg-bg-tertiary before:rounded-xl before:opacity-0 hover:before:opacity-50 hover:before:inset-[-8px] before:transition-all before:pointer-events-none"
    >
      <div className="relative z-1 w-[150px] h-[150px] bg-bg-tertiary rounded overflow-hidden border border-bg-tertiary transition-all group-hover:border-accent">
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-bg-quaternary">
            No Preview
          </div>
        )}
      </div>
      <div className="relative z-1 flex flex-col">
        <span
          className="text-[0.85rem] font-medium truncate group-hover:text-accent transition-colors"
          title={project.filePath}
        >
          {project.name}
        </span>
        <div className="flex justify-between items-center text-[0.7rem] text-text-secondary">
          <span title={formatFullDateTime(project.lastModified)}>
            {getRelativeTime(project.lastModified)}
          </span>
          <span>{formatFileSize(project.fileSize)}</span>
        </div>
      </div>
    </div>
  );
};

const HomeScreen: React.FC = () => {
  const addProject = useProjectStore((state) => state.addProject);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const recentProjects = useRecentProjectsStore((state) => state.recentProjects);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [projectToRename, setProjectToRename] = useState<RecentProject | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    project: RecentProject;
  } | null>(null);

  const [appVersion, setAppVersion] = useState<string>("0.1.0");
  useEffect(() => {
    if ((window as any).electronAPI?.getAppVersion) {
      (window as any).electronAPI
        .getAppVersion()
        .then((v: string) => {
          if (v) setAppVersion(v);
        })
        .catch(() => {
          // Fallback to default
        });
    }
  }, []);

  const handleOpenRecent = async (recent: RecentProject) => {
    try {
      // We need to read the file from disk
      if (!(window as any).electronAPI) return;

      const result = await (window as any).electronAPI.openProjectFromPath(recent.filePath);
      if (result && result.success) {
        const projectData = JSON.parse(result.content);
        projectData.filePath = recent.filePath;
        projectData.isDirty = false;

        addProject(projectData);
        setActiveTab(projectData.id);
        useUIStore.getState().showToast("Project opened successfully", "info");
      } else {
        useUIStore
          .getState()
          .showToast(
            "Could not open recent project. It might have been moved or deleted.",
            "error",
          );
      }
    } catch (err) {
      console.error("Failed to open recent project", err);
      useUIStore.getState().showToast("Failed to open project", "error");
    }
  };

  const handleRenameRecent = (recent: RecentProject) => {
    setProjectToRename(recent);
    setIsRenameModalOpen(true);
  };

  const performRename = async (newName: string) => {
    if (!projectToRename || !newName || newName === projectToRename.name) return;
    const recent = projectToRename;

    if (!(window as any).electronAPI) return;

    try {
      // 1. Rename file on disk
      const oldPath = recent.filePath;
      const separator = oldPath.includes("/") ? "/" : "\\";
      const directory = oldPath.substring(0, oldPath.lastIndexOf(separator) + 1);
      const extension = oldPath.endsWith(".ocfd")
        ? ".ocfd"
        : oldPath.substring(oldPath.lastIndexOf("."));
      const newPath = `${directory}${newName}${extension}`;

      const renameResult = await (window as any).electronAPI.renameFile({
        oldPath,
        newPath,
      });

      if (renameResult.success) {
        // 2. Load and update internal name (only if it's an .ocfd file)
        if (extension === ".ocfd") {
          const openResult = await (window as any).electronAPI.openProjectFromPath(newPath);
          if (openResult.success) {
            const projectData = JSON.parse(openResult.content);
            projectData.name = newName;
            projectData.updatedAt = new Date().toISOString();

            await (window as any).electronAPI.saveProject({
              jsonString: JSON.stringify(projectData),
              filePath: newPath,
            });

            // Update recent projects store
            useRecentProjectsStore.getState().addRecentProject({
              ...recent,
              name: newName,
              filePath: newPath,
              lastModified: projectData.updatedAt,
            });
          }
        } else {
          // If not .ocfd (e.g. image), just update the recent list
          useRecentProjectsStore.getState().addRecentProject({
            ...recent,
            name: newName,
            filePath: newPath,
          });
        }

        // 3. Synchronize with projectStore if the project is open
        const openProject = useProjectStore.getState().projects.find((p) => p.filePath === oldPath);
        if (openProject) {
          useProjectStore.getState().updateProject(openProject.id, {
            name: newName,
            filePath: newPath,
          });
        }

        useUIStore.getState().showToast("Project renamed successfully", "info");
      } else {
        useUIStore.getState().showToast(`Failed to rename: ${renameResult.error}`, "error");
      }
    } catch (err) {
      console.error("Rename error:", err);
      useUIStore.getState().showToast("Failed to rename project", "error");
    }
  };

  const handleExportRecent = async (recent: RecentProject, toClipboard = false) => {
    try {
      if (!(window as any).electronAPI) return;

      const openResult = await (window as any).electronAPI.openProjectFromPath(recent.filePath);
      if (!openResult.success) {
        useUIStore.getState().showToast(`Failed to load project: ${openResult.error}`, "error");
        return;
      }

      const projectData: Project = JSON.parse(openResult.content);

      if (toClipboard) {
        // Silent copy to clipboard
        const dummyCanvas = document.createElement("canvas");
        dummyCanvas.width = 1;
        dummyCanvas.height = 1;
        const engine = new ForgeEngine(dummyCanvas, undefined, { headless: true });
        engine.setProject(projectData);
        await engine.exportToClipboard();
        engine.destroy();
      } else {
        // Open Export Modal with project data
        window.dispatchEvent(
          new CustomEvent("forge:open-export-modal", {
            detail: { project: projectData },
          }),
        );
      }
    } catch (err) {
      console.error("Export error:", err);
      useUIStore.getState().showToast("Failed to prepare export", "error");
    }
  };

  const handleTrashRecent = async (recent: RecentProject) => {
    if (!confirm(`Are you sure you want to move "${recent.name}" to trash?`)) {
      return;
    }

    if (!(window as any).electronAPI) return;

    try {
      const result = await (window as any).electronAPI.deleteFile(recent.filePath);
      if (result.success) {
        useRecentProjectsStore.getState().removeRecentProject(recent.id);
        useUIStore.getState().showToast("Project moved to trash", "info");
      } else {
        useUIStore.getState().showToast(`Failed to trash: ${result.error}`, "error");
      }
    } catch (err) {
      console.error("Trash error:", err);
      useUIStore.getState().showToast("Failed to trash project", "error");
    }
  };

  const handleContextMenu = (e: React.MouseEvent, project: RecentProject) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      project,
    });
  };

  const handleCreateFromImage = useCallback(
    (dataUrl: string, width: number, height: number, name: string, filePath?: string) => {
      const newProject = createProjectFromImage(dataUrl, width, height, name, filePath);
      addProject(newProject);
      setActiveTab(newProject.id);
    },
    [addProject, setActiveTab],
  );

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string;
            try {
              const img = await loadImage(dataUrl);
              handleCreateFromImage(dataUrl, img.naturalWidth, img.naturalHeight, "Pasted Image");
            } catch (err) {
              console.error("Failed to load pasted image", err);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleCreateFromImage]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const isProject = file.name.toLowerCase().endsWith(".ocfd");

      if (isProject) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const content = event.target?.result as string;
            const projectData = JSON.parse(content);

            // In Electron, File objects path should be retrieved via webUtils (exposed as getPathForFile)
            projectData.filePath = (window as any).electronAPI.getPathForFile(file);
            projectData.isDirty = false;

            addProject(projectData);
            setActiveTab(projectData.id);
            useUIStore.getState().showToast("Project opened successfully", "info");
          } catch (err) {
            console.error("Failed to parse project file", err);
            useUIStore.getState().showToast("Failed to open project file", "error");
          }
        };
        reader.readAsText(file);
        break;
      } else if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string;
          try {
            const img = await loadImage(dataUrl);
            const filePath = (window as any).electronAPI.getPathForFile(file);
            handleCreateFromImage(
              dataUrl,
              img.naturalWidth,
              img.naturalHeight,
              file.name.replace(/\.[^/.]+$/, ""),
              filePath,
            );
          } catch (err) {
            console.error("Failed to load dropped image", err);
          }
        };
        reader.readAsDataURL(file);
        break; // Just create one project for the first image
      } else {
        useUIStore.getState().showToast(`File "<b>${file.name}</b>" is not supported.`, "error");
      }
    }
  };

  const isMacOS = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center bg-bg-primary text-text gap-8 ${
        isDraggingOver
          ? "ring-2 ring-accent ring-inset relative after:absolute after:inset-0 after:bg-accent after:opacity-[20%]"
          : ""
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <style>
        {`@keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(24px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .animate-fade-in-up {
            opacity: 0;
            animation: fade-in-up 300ms ease-out forwards;
          }
        }`}
      </style>
      <div className="flex flex-row gap-8 animate-fade-in-up">
        <div className="flex flex-col gap-2">
          <LogoDark width={300} />
          <div className="text-[0.7rem] text-white/60 font-medium">Version {appVersion}</div>
          {/* <h1 className="text-[2rem] mb-2 font-bold text-text">
            OpenCreate <span className="text-accent">Forge</span>
          </h1> */}
        </div>
        <div className="border-l border-bg-tertiary h-full" />
        <div className="flex flex-col gap-2">
          <p className="mb-2">Free and Open Source Image Editor.</p>

          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-1">
              <ShortcutSpan shortcut={"Ctrl+N"} macos={isMacOS} />
              <span className="ml-1">to create a new project</span>
            </p>

            <p className="flex items-center gap-1">
              <ShortcutSpan shortcut={"Ctrl+O"} macos={isMacOS} />
              <span className="ml-1">to open an existing project</span>
            </p>
          </div>
        </div>
      </div>

      {recentProjects.length > 0 && (
        <div
          className="w-full max-w-[800px] mt-8 flex flex-col gap-4 animate-fade-in-up"
          style={{ animationDelay: "150ms" }}
        >
          <h2 className="text-[1rem] font-semibold text-text-secondary border-b border-bg-tertiary pb-2 flex items-center gap-2">
            Recent Projects
            <div
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to clear recent projects? This action cannot be undone.",
                  )
                ) {
                  useRecentProjectsStore.getState().clearRecentProjects();
                }
              }}
              className="text-[0.75rem] text-text-secondary hover:text-accent cursor-pointer transition-colors ml-auto"
            >
              Clear
            </div>
          </h2>
          <div className="grid grid-cols-5 gap-6">
            {recentProjects.map((project) => (
              <RecentProjectItem
                key={project.id}
                project={project}
                onClick={handleOpenRecent}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          key={`${contextMenu.x}-${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: "Open Project",
              icon: FolderOpen,
              onClick: () => handleOpenRecent(contextMenu.project),
            },
            {
              label: "Rename...",
              icon: Edit2,
              onClick: () => handleRenameRecent(contextMenu.project),
            },
            {
              isSeparator: true,
            },
            {
              label: "Export...",
              icon: ImageDown,
              onClick: () => handleExportRecent(contextMenu.project),
            },
            {
              label: "Export to Clipboard",
              icon: Images,
              onClick: () => handleExportRecent(contextMenu.project, true),
            },
            {
              isSeparator: true,
            },
            {
              label: "Remove from List",
              icon: XCircle,
              danger: true,
              onClick: () => {
                if (
                  confirm(
                    `Are you sure you want to remove "${contextMenu.project.name}" from the recent list? This will not delete the project file.`,
                  )
                ) {
                  useRecentProjectsStore.getState().removeRecentProject(contextMenu.project.id);
                }
              },
            },
            {
              label: "Trash Project",
              icon: Trash,
              danger: true,
              onClick: () => handleTrashRecent(contextMenu.project),
            },
          ]}
        />
      )}

      <RenameModal
        key={projectToRename ? projectToRename.id : "none"}
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onRename={performRename}
        initialValue={projectToRename?.name || ""}
        title="Rename Project"
      />

      {/* <div className="flex gap-6">
        <button
          onClick={handleNewProjectClick}
          className="flex flex-col items-center gap-4 p-8 bg-[#252525] border border-bg-tertiary rounded-lg cursor-pointer w-40 transition-all hover:border-accent hover:-translate-y-1"
        >
          <Plus size={32} className="text-accent" />
          <span className="text-[0.9rem] font-medium">New Project</span>
        </button>

        <button className="flex flex-col items-center gap-4 p-8 bg-[#252525] border border-bg-tertiary rounded-lg cursor-pointer w-40 transition-all hover:border-accent hover:-translate-y-1">
          <FolderOpen size={32} className="text-accent" />
          <span className="text-[0.9rem] font-medium">Open Project</span>
        </button>
      </div> */}
    </div>
  );
};

export default HomeScreen;
