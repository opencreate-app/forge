/**
 * Purpose: Component that provides the main interactive canvas area, integrating the ForgeEngine and handling project-level events like file drops and zoom.
 */
import React, { useEffect, useRef } from "react";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { ForgeEngine } from "@core/engine/ForgeEngine";
import Ruler from "./Ruler";
import { RichTextToolbar } from "./tools/RichTextToolbar";
import type { ColorPickerOpenRequest } from "@utils/colorPicker";
import { getFileNameWithoutExtension, readFileAsDataUrl } from "@utils/fileDrop";

import { ColorSampleRequest, forgeEvents, FORGE_EVENTS } from "@utils/events";

interface CanvasViewportProps {
  onOpenColorPicker: (request: ColorPickerOpenRequest) => void;
}

const CanvasViewport: React.FC<CanvasViewportProps> = ({ onOpenColorPicker }) => {
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

  const RULER_SIZE = 25;

  // 1. Initializes the Engine only once
  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      // Ensure correct initial size before creating the engine
      const parent = canvasRef.current.parentElement;
      const engine = new ForgeEngine(canvasRef.current, (zoom, x, y) => {
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
      engineRef.current = engine;
      if (parent) engine.resizeViewport(parent.clientWidth, parent.clientHeight);
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

    const resizeViewport = () => {
      if (canvasRef.current && engineRef.current) {
        const newWidth = parent.clientWidth;
        const newHeight = parent.clientHeight;

        engineRef.current.resizeViewport(newWidth, newHeight);
        engineRef.current.render();
      }
    };

    const resizeObserver = new ResizeObserver(resizeViewport);

    resizeObserver.observe(parent);
    window.addEventListener("resize", resizeViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeViewport);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileDrop = React.useCallback(
    async (files: File[]) => {
      if (!activeProjectId || !project) return;

      for (const file of files) {
        if (file.type.startsWith("image/")) {
          try {
            const dataUrl = await readFileAsDataUrl(file);
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error(`Failed to load ${file.name}`));
              image.src = dataUrl;
            });

            // Viewport center coordinates
            const viewportWidth = canvasRef.current?.clientWidth || 0;
            const viewportHeight = canvasRef.current?.clientHeight || 0;

            // Convert screen center to project coordinates,
            // taking into account current zoom and pan
            const projCenterX = (viewportWidth / 2 - project.panX) / project.zoom;
            const projCenterY = (viewportHeight / 2 - project.panY) / project.zoom;

            // Position image centered at this project point
            const x = Math.round(projCenterX - img.naturalWidth / 2);
            const y = Math.round(projCenterY - img.naturalHeight / 2);

            useProjectStore.getState().addLayer(activeProjectId, {
              name: getFileNameWithoutExtension(file),
              type: "raster",
              data: dataUrl,
              width: img.naturalWidth,
              height: img.naturalHeight,
              x,
              y,
              visible: true,
              opacity: 100,
            });
          } catch (error) {
            console.error(`Failed to import image ${file.name}`, error);
            showToast(`Failed to import file "<b>${file.name}</b>".`, "error");
          }
        } else {
          showToast(`File "<b>${file.name}</b>" is not supported.`, "error");
        }
      }
    },
    [activeProjectId, project, showToast],
  );

  React.useEffect(() => {
    const handleEditorFileDrop = (event: Event) => {
      const files = (event as CustomEvent<{ files: File[] }>).detail?.files || [];
      void handleFileDrop(files);
    };

    window.addEventListener("forge:editor-file-drop", handleEditorFileDrop);
    return () => window.removeEventListener("forge:editor-file-drop", handleEditorFileDrop);
  }, [handleFileDrop]);

  return (
    <div
      className="relative isolate flex-1 overflow-hidden bg-[#111] transition-colors duration-200"
      onDragOver={handleDragOver}
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
          <RichTextToolbar onOpenColorPicker={onOpenColorPicker} />
        </div>
      </div>
    </div>
  );
};

export default CanvasViewport;
