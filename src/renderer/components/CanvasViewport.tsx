/**
 * Purpose: Component that provides the main interactive canvas area, integrating the ForgeEngine and handling project-level events like file drops and zoom.
 */
import React, { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { ForgeEngine } from "@core/engine/ForgeEngine";
import Ruler from "./Ruler";

import {
  ColorSampleRequest,
  forgeEvents,
  FORGE_EVENTS,
} from "@utils/events";

const CanvasViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ForgeEngine | null>(null);

  useEffect(() => {
    const handleFitToScreen = () => {
      engineRef.current?.animateFitToScreen();
    };

    forgeEvents.addEventListener(FORGE_EVENTS.FIT_TO_SCREEN, handleFitToScreen);
    return () => {
      forgeEvents.removeEventListener(FORGE_EVENTS.FIT_TO_SCREEN, handleFitToScreen);
    };
  }, []);

  useEffect(() => {
    const handleColorSampleRequest = (event: Event) => {
      const { x, y } = (event as CustomEvent<ColorSampleRequest>).detail;
      const color = engineRef.current?.sampleColorAtScreen(x, y);
      if (color) forgeEvents.emit(FORGE_EVENTS.COLOR_SAMPLED, color);
    };

    forgeEvents.addEventListener(FORGE_EVENTS.REQUEST_COLOR_SAMPLE, handleColorSampleRequest);
    return () => {
      forgeEvents.removeEventListener(FORGE_EVENTS.REQUEST_COLOR_SAMPLE, handleColorSampleRequest);
    };
  }, []);

  const project = useProjectStore(
    (state) => state.projects.find((p) => p.id === state.activeProjectId) || null,
  );
  const activeProjectId = project?.id || null;

  const showToast = useUIStore((state) => state.showToast);
  const showRulers = useUIStore((state) => state.showRulers);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const RULER_SIZE = 25;

  // 1. Initializes the Engine only once
  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      // Ensure correct initial size before creating the engine
      const parent = canvasRef.current.parentElement;
      if (parent) {
        canvasRef.current.width = parent.clientWidth;
        canvasRef.current.height = parent.clientHeight;
      }

      engineRef.current = new ForgeEngine(canvasRef.current, (zoom, x, y) => {
        const id = useProjectStore.getState().activeProjectId;
        if (id) {
          // Updates the store ONLY when zoom/pan changes via interaction
          useProjectStore.getState().updateProject(id, {
            zoom,
            panX: x,
            panY: y,
          });
        }
      });
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.stopRenderLoop();
        engineRef.current = null;
      }
    };
  }, []);

  // 2. Synchronizes the active project with the engine
  const lastProjectRef = useRef<{ id: string; layers: any } | null>(null);

  useEffect(() => {
    if (engineRef.current && project) {
      engineRef.current.setProject(project);

      const layersChanged = lastProjectRef.current?.layers !== project.layers;
      const idChanged = lastProjectRef.current?.id !== project.id;

      if (idChanged || layersChanged) {
        // Preload project assets (including Google Fonts) as soon as the project changes/opens
        engineRef.current.preloadImages().then(() => {
          engineRef.current?.render();
        });
      }

      lastProjectRef.current = { id: project.id, layers: project.layers };
    }
  }, [project]);

  // 3. Initial centering (Fit to Screen) - ONLY THE FIRST TIME per project
  const centeredProjectsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (engineRef.current && project && !centeredProjectsRef.current.has(project.id)) {
      // If the project was newly created (at default 1:1 and 0:0 state) or simply hasn't been centered in this session yet
      if (project.zoom === 1 && project.panX === 0 && project.panY === 0) {
        engineRef.current.fitToScreen();
        centeredProjectsRef.current.add(project.id);
      } else {
        // If it already has values (e.g., loaded project), mark as already centered to avoid forcing it
        centeredProjectsRef.current.add(project.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]); // Only when project changes, not when zoom changes

  // 4. Handle resize (via ResizeObserver for better precision during transitions)
  useEffect(() => {
    if (!canvasRef.current) return;

    const parent = canvasRef.current.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver(() => {
      if (canvasRef.current && engineRef.current) {
        const newWidth = parent.clientWidth;
        const newHeight = parent.clientHeight;

        // Only change size (and consequently clear canvas) if it really changed
        if (canvasRef.current.width !== newWidth || canvasRef.current.height !== newHeight) {
          canvasRef.current.width = newWidth;
          canvasRef.current.height = newHeight;

          // FORCE immediate synchronous render to avoid black/white screen
          engineRef.current.render();
        }
      }
    });

    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (!activeProjectId || !project) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
            // Viewport center coordinates
            const viewportWidth = canvasRef.current?.width || 0;
            const viewportHeight = canvasRef.current?.height || 0;

            // Convert screen center to project coordinates,
            // taking into account current zoom and pan
            const projCenterX = (viewportWidth / 2 - project.panX) / project.zoom;
            const projCenterY = (viewportHeight / 2 - project.panY) / project.zoom;

            // Position image centered at this project point
            const x = Math.round(projCenterX - img.naturalWidth / 2);
            const y = Math.round(projCenterY - img.naturalHeight / 2);

            useProjectStore.getState().addLayer(activeProjectId, {
              name: file.name.replace(/\.[^/.]+$/, ""),
              type: "raster",
              data: dataUrl,
              width: img.naturalWidth,
              height: img.naturalHeight,
              x: x,
              y: y,
              visible: true,
              opacity: 100,
            });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      } else {
        showToast(`File "<b>${file.name}</b>" is not supported.`, "error");
      }
    }
  };

  return (
    <div
      className={`flex-1 relative overflow-hidden bg-[#111] transition-colors duration-200 ${
        isDraggingOver
          ? "ring-2 ring-accent ring-inset relative after:absolute after:inset-0 after:bg-accent after:opacity-[20%] after:pointer-events-none"
          : ""
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="w-full h-full grid"
        style={{
          gridTemplateColumns: showRulers ? `${RULER_SIZE}px 1fr` : "1fr",
          gridTemplateRows: showRulers ? `${RULER_SIZE}px 1fr` : "1fr",
        }}
      >
        {showRulers && (
          <>
            <div className="bg-[#222] border-r border-b border-[#333] z-10" />
            <div className="bg-[#222] border-b border-[#333] z-10 overflow-hidden">
              <Ruler orientation="horizontal" size={RULER_SIZE} />
            </div>
            <div className="bg-[#222] border-r border-[#333] z-10 overflow-hidden">
              <Ruler orientation="vertical" size={RULER_SIZE} />
            </div>
          </>
        )}
        <div className="relative overflow-hidden">
          <canvas ref={canvasRef} id="forge-canvas" className="block w-full h-full" />
        </div>
      </div>
    </div>
  );
};

export default CanvasViewport;
