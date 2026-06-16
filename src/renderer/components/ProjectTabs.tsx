/**
 * Purpose: Tab-based navigation bar for switching between open projects and managing project closing with save confirmation.
 */
import React from "react";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { Home, X, Box } from "lucide-react";

const ProjectTabs: React.FC = () => {
  const { projects, removeProject, setActiveProject, reorderProjects } = useProjectStore();
  const { activeTab, setActiveTab, tabHistory, removeFromHistory } = useUIStore();

  const tabElementsRef = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  interface DragState {
    startIndex: number;
    currentIndex: number;
    startX: number;
    currentX: number;
    rects: { left: number; width: number }[];
  }

  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const [justDropped, setJustDropped] = React.useState(false);

  const handleTabClick = (id: "home" | string) => {
    // Only switch tabs if not dragging
    if (dragState) return;
    setActiveTab(id);
    if (id !== "home") {
      setActiveProject(id);
    }
  };

  const handleCloseTab = React.useCallback(
    async (e: React.MouseEvent | null, id: string) => {
      e?.stopPropagation();
      const project = projects.find((p) => p.id === id);
      if (!project) return;

      if (project.isDirty) {
        // @ts-expect-error - Electron API
        const result = await window.electronAPI.confirmClose(project.name);
        if (result === 2) return; // Cancel
        if (result === 0) {
          // Save before closing
          setActiveTab(id);
          setActiveProject(id);

          // Create a Promise that waits for the save completion event
          const savePromise = new Promise<boolean>((resolve) => {
            const listener = (e: any) => {
              window.removeEventListener("forge:save-project-finished", listener);
              resolve(e.detail.success);
            };
            window.addEventListener("forge:save-project-finished", listener);
            // Safety timeout in case saving fails unexpectedly
            setTimeout(() => {
              window.removeEventListener("forge:save-project-finished", listener);
              resolve(false);
            }, 10000);
          });

          window.dispatchEvent(new CustomEvent("forge:save-project"));

          const saved = await savePromise;
          if (!saved) {
            // If saving failed or was cancelled, we probably shouldn't close
            // To maintain safety, let's just stop here
            return;
          }
        }
      }

      removeFromHistory(id);
      removeProject(id);

      if (activeTab === id) {
        // Get the next best tab from history
        const newHistory = tabHistory.filter((tid) => tid !== id);
        const lastTab = newHistory[newHistory.length - 1] || "home";
        setActiveTab(lastTab);
        if (lastTab !== "home") {
          setActiveProject(lastTab);
        }
      }
    },
    [
      projects,
      removeFromHistory,
      removeProject,
      activeTab,
      tabHistory,
      setActiveTab,
      setActiveProject,
    ],
  );

  React.useEffect(() => {
    const handleCloseActive = () => {
      if (activeTab !== "home") {
        handleCloseTab(null, activeTab);
      }
    };
    window.addEventListener("forge:close-project", handleCloseActive);
    return () => window.removeEventListener("forge:close-project", handleCloseActive);
  }, [activeTab, handleCloseTab]);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>, id: string, index: number) => {
    if (e.button === 1) {
      // Middle click
      e.preventDefault();
      handleCloseTab(e, id);
      return;
    }
    if (e.button !== 0) return; // Left click only

    // Don't drag if clicking the close button
    const target = e.target as HTMLElement;
    if (target.closest(".close-tab-btn")) return;

    e.preventDefault();

    // Measure bounding boxes of all projects at drag start
    const rects = projects.map((p) => {
      const el = tabElementsRef.current.get(p.id);
      if (el) {
        const r = el.getBoundingClientRect();
        return { left: r.left, width: r.width };
      }
      return { left: 0, width: 150 };
    });

    setDragState({
      startIndex: index,
      currentIndex: index,
      startX: e.clientX,
      currentX: e.clientX,
      rects,
    });
  };

  React.useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragState((prev) => {
        if (!prev) return null;

        const deltaX = e.clientX - prev.startX;
        const draggedWidth = prev.rects[prev.startIndex].width;
        const draggedCenter = prev.rects[prev.startIndex].left + draggedWidth / 2 + deltaX;

        // Find which slot the dragged tab center is closest to
        let targetIndex = prev.startIndex;
        let minDistance = Infinity;

        for (let i = 0; i < prev.rects.length; i++) {
          const slotCenter = prev.rects[i].left + prev.rects[i].width / 2;
          const dist = Math.abs(draggedCenter - slotCenter);
          if (dist < minDistance) {
            minDistance = dist;
            targetIndex = i;
          }
        }

        return {
          ...prev,
          currentIndex: targetIndex,
          currentX: e.clientX,
        };
      });
    };

    const handleMouseUp = () => {
      setDragState((prev) => {
        if (prev) {
          if (prev.currentIndex !== prev.startIndex) {
            setJustDropped(true);
            const newProjects = [...projects];
            const draggedProject = newProjects[prev.startIndex];
            newProjects.splice(prev.startIndex, 1);
            newProjects.splice(prev.currentIndex, 0, draggedProject);
            reorderProjects(newProjects);
          }
        }
        return null;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, projects, reorderProjects]);

  React.useEffect(() => {
    if (justDropped) {
      const id = requestAnimationFrame(() => {
        setJustDropped(false);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [justDropped]);

  return (
    <div className="flex bg-[#111] h-[35px] border-b border-bg-tertiary px-[5px] items-end overflow-y-hidden overflow-x-auto gap-1">
      {dragState && (
        <style>{`
          body, button, div, span, svg {
            cursor: grabbing !important;
          }
        `}</style>
      )}
      <button
        onClick={() => handleTabClick("home")}
        tabIndex={-1}
        className={`flex items-center px-2 h-[30px] border-none rounded-t-[4px] cursor-pointer text-[0.8rem] flex-shrink-0 transition-colors ${
          activeTab === "home"
            ? "bg-[#222] text-accent"
            : "bg-transparent text-[#666] hover:bg-white/5"
        }`}
      >
        <Home size={14} />
      </button>

      {projects.map((project, index) => {
        const isDraggingThis = dragState && dragState.startIndex === index;

        let tx = 0;
        let transitionStyle = justDropped
          ? "none"
          : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.15s, border-color 0.15s, opacity 0.15s";

        if (dragState) {
          if (isDraggingThis) {
            tx = dragState.currentX - dragState.startX;
            transitionStyle = "background-color 0.15s, border-color 0.15s, opacity 0.15s"; // no transform transition while dragging
          } else {
            // Shift other elements out of the way
            const draggedWidth = dragState.rects[dragState.startIndex].width + 4; // width + gap
            if (dragState.currentIndex > dragState.startIndex) {
              if (index > dragState.startIndex && index <= dragState.currentIndex) {
                tx = -draggedWidth;
              }
            } else if (dragState.currentIndex < dragState.startIndex) {
              if (index < dragState.startIndex && index >= dragState.currentIndex) {
                tx = draggedWidth;
              }
            }
          }
        }

        return (
          <button
            key={project.id}
            ref={(el) => {
              if (el) tabElementsRef.current.set(project.id, el);
              else tabElementsRef.current.delete(project.id);
            }}
            onMouseDown={(e) => handleMouseDown(e, project.id, index)}
            style={{
              transform: tx !== 0 ? `translateX(${tx}px)` : undefined,
              transition: transitionStyle,
              zIndex: isDraggingThis ? 50 : undefined,
              position: isDraggingThis ? "relative" : undefined,
              cursor: dragState ? "grabbing" : "grab",
            }}
            className={`flex items-center px-3 pe-[5px] h-[30px] rounded-t-[4px] text-[0.8rem] gap-2 min-w-[150px] justify-between flex-shrink-0 border-b select-none ${
              activeTab === project.id
                ? "bg-bg-primary text-text border-accent"
                : "bg-transparent text-[#666] hover:bg-white/5 border-transparent cursor-grab"
            } ${project.parentLayerId ? "italic" : ""} ${isDraggingThis ? "opacity-70 shadow-lg" : ""}`}
            onClick={() => handleTabClick(project.id)}
          >
            <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
              {project.parentLayerId && <Box size={12} className="text-accent shrink-0" />}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {project.parentLayerId
                  ? `${project.name}`
                  : project.filePath
                    ? project.filePath.split(/[\\/]/).pop()
                    : `${project.name}.ocfd`}
              </span>
            </div>
            <div
              tabIndex={-1}
              className="close-tab-btn group relative bg-none border-none text-inherit flex p-[4px] rounded-[2px] cursor-pointer hover:bg-white/10 transition-colors w-[20px] h-[20px] items-center justify-center pointer-events-auto"
              onClick={(e) => handleCloseTab(e, project.id)}
            >
              {project.isDirty ? (
                <>
                  <div className="w-[10px] h-[10px] bg-white rounded-full group-hover:opacity-0 transition-opacity" />
                  <X
                    size={14}
                    className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </>
              ) : (
                <X size={14} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ProjectTabs;
