/**
 * Purpose: Tab-based navigation bar for switching between open projects and managing project closing with save confirmation.
 */
import React from "react";
import { createPortal } from "react-dom";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { ChevronLeft, ChevronRight, Home, X, Box } from "lucide-react";
import { createProjectFromImage, loadImage } from "@utils/projectUtils";
import { generateProjectThumbnail } from "@utils/projectThumbnail";
import {
  isFileDragEvent,
  isLayerDragEvent,
  LAYER_DRAG_MIME,
  parseLayerDragPayload,
} from "@utils/dragAndDrop";
import {
  getDroppedFilePath,
  getFileNameWithoutExtension,
  isForgeProjectFile,
  readFileAsDataUrl,
  readFileAsText,
} from "@utils/fileDrop";

const ProjectTabs: React.FC = () => {
  const { projects, addProject, removeProject, setActiveProject, reorderProjects } =
    useProjectStore();
  const { activeTab, setActiveTab, removeFromHistory, showToast } = useUIStore();

  const tabElementsRef = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const tabsViewportRef = React.useRef<HTMLDivElement>(null);
  const wheelScrollResetRef = React.useRef<number | null>(null);
  const hoverTimeoutRef = React.useRef<number | null>(null);
  const previewRequestRef = React.useRef(0);
  const previewCacheRef = React.useRef(
    new Map<string, { project: (typeof projects)[number]; thumbnail: string }>(),
  );

  const [tabPreview, setTabPreview] = React.useState<{
    id: string;
    thumbnail: string;
    left: number;
    top: number;
  } | null>(null);

  interface DragState {
    startIndex: number;
    currentIndex: number;
    startX: number;
    currentX: number;
    rects: { left: number; width: number }[];
  }

  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const [justDropped, setJustDropped] = React.useState(false);
  const [isFileDragOver, setIsFileDragOver] = React.useState(false);
  const [layerDropTarget, setLayerDropTarget] = React.useState<string | null>(null);
  const [hasTabOverflow, setHasTabOverflow] = React.useState(false);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = React.useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = React.useState(false);
  const [activeTabOverflowSide, setActiveTabOverflowSide] = React.useState<"left" | "right" | null>(
    null,
  );

  const updateTabScrollState = React.useCallback(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) return;

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const nextHasOverflow = maxScrollLeft > 1;
    const nextCanScrollLeft = viewport.scrollLeft > 1;
    const nextCanScrollRight = viewport.scrollLeft < maxScrollLeft - 1;
    setHasTabOverflow(nextHasOverflow);
    setCanScrollTabsLeft(nextCanScrollLeft);
    setCanScrollTabsRight(nextCanScrollRight);

    let nextActiveTabOverflowSide: "left" | "right" | null = null;
    if (nextHasOverflow && activeTab !== "home") {
      const activeTabElement = tabElementsRef.current.get(activeTab);
      if (activeTabElement) {
        const viewportRect = viewport.getBoundingClientRect();
        const activeTabRect = activeTabElement.getBoundingClientRect();
        if (activeTabRect.left < viewportRect.left - 1 && nextCanScrollLeft) {
          nextActiveTabOverflowSide = "left";
        } else if (activeTabRect.right > viewportRect.right + 1 && nextCanScrollRight) {
          nextActiveTabOverflowSide = "right";
        }
      }
    }
    setActiveTabOverflowSide(nextActiveTabOverflowSide);
  }, [activeTab]);

  const handleTabsWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const viewport = tabsViewportRef.current;
    if (!viewport || !hasTabOverflow) return;

    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    event.preventDefault();
    viewport.classList.add("is-wheel-scrolling");
    if (wheelScrollResetRef.current !== null) {
      window.clearTimeout(wheelScrollResetRef.current);
    }
    viewport.scrollLeft += delta;
    updateTabScrollState();
    wheelScrollResetRef.current = window.setTimeout(() => {
      viewport.classList.remove("is-wheel-scrolling");
      wheelScrollResetRef.current = null;
    }, 150);
  };

  const scrollTabs = (direction: -1 | 1) => {
    const viewport = tabsViewportRef.current;
    if (!viewport) return;

    const tabStarts = projects
      .map((project) => tabElementsRef.current.get(project.id))
      .filter((tab): tab is HTMLButtonElement => tab !== undefined)
      .map((tab) => tab.offsetLeft);
    const currentScrollLeft = viewport.scrollLeft;
    const targetStart =
      direction > 0
        ? tabStarts.find((start) => start > currentScrollLeft + 1)
        : [...tabStarts].reverse().find((start) => start < currentScrollLeft - 1);
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const targetScrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, targetStart ?? (direction > 0 ? maxScrollLeft : 0)),
    );

    viewport.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
  };

  const handleFileDrop = React.useCallback(
    async (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer.files);
      for (const file of files) {
        try {
          const filePath = getDroppedFilePath(file);

          if (isForgeProjectFile(file)) {
            const projectData = JSON.parse(await readFileAsText(file));
            projectData.filePath = filePath;
            projectData.isDirty = false;
            const projectId = addProject(projectData, true);
            setActiveTab(projectId);
            setActiveProject(projectId);
            showToast("Project opened successfully", "info");
            continue;
          }

          if (file.type.startsWith("image/")) {
            const dataUrl = await readFileAsDataUrl(file);
            const image = await loadImage(dataUrl);
            const project = createProjectFromImage(
              dataUrl,
              image.naturalWidth,
              image.naturalHeight,
              getFileNameWithoutExtension(file),
              filePath,
            );
            const projectId = addProject(project, true);
            setActiveTab(projectId);
            setActiveProject(projectId);
            continue;
          }

          showToast(`File "<b>${file.name}</b>" is not supported.`, "error");
        } catch (error) {
          console.error(`Failed to import dropped file ${file.name}`, error);
          showToast(`Failed to import file "<b>${file.name}</b>".`, "error");
        }
      }
    },
    [addProject, setActiveProject, setActiveTab, showToast],
  );

  const handleTabsDragEnter = (event: React.DragEvent) => {
    if (!isFileDragEvent(event) || isLayerDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragOver(true);
  };

  const handleTabsDragOver = (event: React.DragEvent) => {
    if (isLayerDragEvent(event)) return;
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsFileDragOver(true);
  };

  const handleTabsDragLeave = (event: React.DragEvent) => {
    if (!isFileDragEvent(event) || isLayerDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;

    setIsFileDragOver(false);
  };

  const handleTabsDrop = (event: React.DragEvent) => {
    if (isLayerDragEvent(event)) return;
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragOver(false);
    setLayerDropTarget(null);
    void handleFileDrop(event);
  };

  const handleTabDragOver = (event: React.DragEvent, projectId: string) => {
    if (!isLayerDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setLayerDropTarget(projectId);
  };

  const handleTabDragLeave = (event: React.DragEvent, projectId: string) => {
    if (!isLayerDragEvent(event)) return;
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
      setLayerDropTarget((currentTarget) => (currentTarget === projectId ? null : currentTarget));
    }
  };

  const handleTabDrop = (event: React.DragEvent, projectId: string) => {
    if (!isLayerDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const payload = parseLayerDragPayload(event.dataTransfer.getData(LAYER_DRAG_MIME));
    setLayerDropTarget(null);
    if (!payload || payload.sourceProjectId === projectId) return;

    useProjectStore
      .getState()
      .importLayersFromProject(payload.sourceProjectId, projectId, payload.layerIds);
    setActiveTab(projectId);
    setActiveProject(projectId);
  };

  const clearTabPreview = React.useCallback(() => {
    previewRequestRef.current += 1;
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setTabPreview(null);
  }, []);

  const handleTabMouseEnter = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, project: (typeof projects)[number]) => {
      clearTabPreview();
      if (dragState) return;

      if (activeTab === project.id) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const previewWidth = 220;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - previewWidth - 8));
      const requestId = previewRequestRef.current;

      hoverTimeoutRef.current = window.setTimeout(async () => {
        hoverTimeoutRef.current = null;

        try {
          const cachedPreview = previewCacheRef.current.get(project.id);
          const thumbnail =
            cachedPreview?.project === project
              ? cachedPreview.thumbnail
              : await generateProjectThumbnail(project);

          const currentProject = useProjectStore
            .getState()
            .projects.find((candidate) => candidate.id === project.id);
          if (previewRequestRef.current !== requestId || currentProject !== project) return;

          previewCacheRef.current.set(project.id, { project, thumbnail });
          setTabPreview({
            id: project.id,
            thumbnail,
            left,
            top: rect.bottom + 8,
          });
        } catch (error) {
          if (previewRequestRef.current === requestId) {
            console.warn(`Failed to generate preview for project ${project.id}`, error);
          }
        }
      }, 700);
    },
    [activeTab, clearTabPreview, dragState],
  );

  const handleTabMouseLeave = React.useCallback(() => {
    clearTabPreview();
  }, [clearTabPreview]);

  React.useEffect(() => clearTabPreview, [clearTabPreview]);

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
      clearTabPreview();
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
        const idx = projects.findIndex((p) => p.id === id);
        let nextTabId = "home";

        if (idx !== -1) {
          if (idx > 0) {
            nextTabId = projects[idx - 1].id;
          } else if (projects.length > 1) {
            nextTabId = projects[1].id;
          }
        }

        setActiveTab(nextTabId);
        if (nextTabId !== "home") {
          setActiveProject(nextTabId);
        }
      }
    },
    [
      projects,
      removeFromHistory,
      removeProject,
      activeTab,
      setActiveTab,
      setActiveProject,
      clearTabPreview,
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

    clearTabPreview();

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

  React.useEffect(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) return;

    updateTabScrollState();
    viewport.addEventListener("scroll", updateTabScrollState, { passive: true });
    window.addEventListener("resize", updateTabScrollState);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateTabScrollState) : null;
    resizeObserver?.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", updateTabScrollState);
      window.removeEventListener("resize", updateTabScrollState);
      resizeObserver?.disconnect();
    };
  }, [projects, updateTabScrollState]);

  React.useEffect(() => {
    return () => {
      if (wheelScrollResetRef.current !== null) {
        window.clearTimeout(wheelScrollResetRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative isolate flex h-[35px] items-end gap-1 overflow-hidden border-b border-bg-tertiary bg-[#111] px-[5px]"
      onDragEnter={handleTabsDragEnter}
      onDragOver={handleTabsDragOver}
      onDragLeave={handleTabsDragLeave}
      onDrop={handleTabsDrop}
    >
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
        aria-label="Home"
        className={`flex shrink-0 items-center rounded-t-[4px] border-none px-2 h-[30px] cursor-pointer text-[0.8rem] transition-colors ${
          activeTab === "home"
            ? "bg-[#222] text-accent"
            : "bg-transparent text-[#666] hover:bg-white/5"
        }`}
      >
        <Home size={14} />
      </button>

      <div className="relative flex min-w-0 flex-1 items-end">
        <div
          ref={tabsViewportRef}
          aria-label="Project tabs"
          className={
            "project-tabs-scrollbar flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden" +
            (activeTabOverflowSide ? ` active-tab-${activeTabOverflowSide}` : "")
          }
          onWheel={handleTabsWheel}
        >
          <div className="flex min-w-max items-end gap-1">
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
                  onMouseEnter={(e) => handleTabMouseEnter(e, project)}
                  onMouseLeave={handleTabMouseLeave}
                  onDragOver={(e) => handleTabDragOver(e, project.id)}
                  onDragLeave={(e) => handleTabDragLeave(e, project.id)}
                  onDrop={(e) => handleTabDrop(e, project.id)}
                  style={{
                    transform: tx !== 0 ? `translateX(${tx}px)` : undefined,
                    transition: transitionStyle,
                    zIndex: isDraggingThis ? 50 : undefined,
                    position: isDraggingThis ? "relative" : undefined,
                    cursor: dragState ? "grabbing" : "default",
                  }}
                  className={`project-tab flex items-center px-3 pe-[5px] h-[30px] snap-start rounded-t-[4px] text-[0.8rem] gap-2 min-w-[150px] justify-between flex-shrink-0 border-b select-none ${
                    activeTab === project.id
                      ? "bg-bg-primary text-text border-accent"
                      : "bg-transparent text-[#666] hover:bg-white/5 border-transparent"
                  } ${project.parentLayerId ? "italic" : ""} ${isDraggingThis ? "opacity-70 shadow-lg" : ""} ${
                    layerDropTarget === project.id
                      ? "outline-2 outline-accent outline-offset-[-2px] bg-accent/15"
                      : ""
                  }`}
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
        </div>
        {hasTabOverflow && canScrollTabsLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[#111] to-transparent"
          />
        )}
        {hasTabOverflow && canScrollTabsRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[#111] to-transparent"
          />
        )}
        {activeTabOverflowSide && (
          <div
            aria-hidden="true"
            className={`active-tab-indicator pointer-events-none absolute inset-y-0 z-999 w-[1px] bg-accent ${
              activeTabOverflowSide === "left" ? "left-0" : "right-0"
            }`}
          />
        )}
      </div>
      {hasTabOverflow && (
        <div className="flex shrink-0 items-center gap-0.5 pl-0.5">
          <button
            type="button"
            aria-label="Scroll project tabs left"
            disabled={!canScrollTabsLeft}
            onClick={() => scrollTabs(-1)}
            className="flex h-[28px] w-[24px] items-center justify-center rounded text-[#888] transition-colors hover:bg-white/10 hover:text-text disabled:cursor-default disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Scroll project tabs right"
            disabled={!canScrollTabsRight}
            onClick={() => scrollTabs(1)}
            className="flex h-[28px] w-[24px] items-center justify-center rounded text-[#888] transition-colors hover:bg-white/10 hover:text-text disabled:cursor-default disabled:opacity-30"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {isFileDragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[60] border-2 border-accent bg-accent/20"
        />
      )}
      {tabPreview &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-[150px] overflow-hidden rounded-lg border border-border"
            style={{ left: tabPreview.left, top: tabPreview.top }}
          >
            <img
              src={tabPreview.thumbnail}
              alt="Project preview"
              className="block aspect-square w-full object-contain"
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ProjectTabs;
