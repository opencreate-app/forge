/**
 * Purpose: Core engine class responsible for project rendering, viewport management (zoom/pan), tool orchestration, and selection handling.
 */
import { Layer, Project, useProjectStore } from "@/renderer/store/projectStore";
import { BaseTool, ToolContext } from "../tools/BaseTool";
import { MoveTool } from "../tools/MoveTool";
import { BrushTool } from "../tools/BrushTool";
import { PencilTool } from "../tools/PencilTool";
import { EraserTool } from "../tools/EraserTool";
import { TransformTool } from "../tools/TransformTool";
import { SelectTool } from "../tools/SelectTool";
import { CropTool } from "../tools/CropTool";
import { TextTool } from "../tools/TextTool";
import { PaintBucketTool } from "../tools/PaintBucketTool";
import { useToolStore } from "@/renderer/store/toolStore";
import { useUIStore } from "@/renderer/store/uiStore";
import UPNG from "upng-js";
import {
  getOptimizedBoundingBox,
  // quantizeImageData,
  safeBase64FromBuffer,
} from "../utils/imageUtils";
import { applyAlphaThreshold } from "../utils/imageUtils";
import { RasterLayer } from "../layers/RasterLayer";
import { TextLayer } from "../layers/TextLayer";
import { GroupLayer } from "../layers/GroupLayer";
import { SmartObjectLayer } from "../layers/SmartObjectLayer";

/**
 * Represents the current state of the canvas viewport.
 */
export interface ViewportState {
  /** The current zoom level (1.0 is 100%). */
  scale: number;
  /** The X coordinate of the viewport origin in project space. */
  originX: number;
  /** The Y coordinate of the viewport origin in project space. */
  originY: number;
}

export interface EngineOptions {
  headless?: boolean;
}

/**
 * Core engine class responsible for project rendering, viewport management (zoom/pan),
 * tool orchestration, and selection handling. It manages the main rendering loop
 * and coordinates interactions between the UI, tools, and the project state.
 */
export class ForgeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: Project | null = null;
  private options: EngineOptions;
  private checkerPattern: CanvasPattern | null = null;

  private ZOOM_SENSITIVITY = 0.05;
  private ZOOM_SMOOTHING = 0.15;
  private animationFrameId: number | null = null;
  private viewportAnimationId: number | null = null;
  private targetViewport: { zoom: number; panX: number; panY: number } | null = null;

  private isPanning = false;
  private startX = 0;
  private startY = 0;

  private layerCanvasCache: Map<string, HTMLCanvasElement> = new Map();
  private layerReadyCache: Map<string, boolean> = new Map();
  private imageCache: Map<string, HTMLImageElement> = new Map();

  private selectionCanvas: HTMLCanvasElement;
  private selectionCtx: CanvasRenderingContext2D;
  private selectionEdges: { horizontal: any[]; vertical: any[] } | null = null;
  private marchingAntsOffset = 0;
  private lastSelectionMask: string | undefined = undefined;
  private isCtrlPressed = false;

  private tools: Record<string, BaseTool>;

  private projectBuffer: HTMLCanvasElement;
  private projectCtx: CanvasRenderingContext2D;

  private currentToolId: string | null = null;
  private onViewportChange?: (zoom: number, x: number, y: number) => void;

  // private lastMouseEvent: MouseEvent | null = null;

  /**
   * Initializes the engine with a target canvas and optional settings.
   * @param canvas The HTML canvas element to render into.
   * @param onViewportChange Optional callback fired when zoom or pan changes.
   * @param options Engine configuration options.
   */
  constructor(
    canvas: HTMLCanvasElement,
    onViewportChange?: (zoom: number, x: number, y: number) => void,
    options: EngineOptions = {},
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.onViewportChange = onViewportChange;
    this.options = options;

    this.selectionCanvas = document.createElement("canvas");
    this.selectionCtx = this.selectionCanvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    this.projectBuffer = document.createElement("canvas");
    this.projectCtx = this.projectBuffer.getContext("2d")!;

    this.tools = {
      move: new MoveTool(),
      select: new SelectTool(),
      brush: new BrushTool(),
      pencil: new PencilTool(),
      eraser: new EraserTool(),
      paintBucket: new PaintBucketTool(),
      transform: new TransformTool(),
      crop: new CropTool(),
      text: new TextTool(),
    };

    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    if (!this.options.headless) {
      this.setupEventListeners();
      this.startRenderLoop();
    }

    // Export for DevTools access (for testing/debugging)
    (window as any).ForgeEngine = this;
  }

  private unsubscribeToolStore: (() => void) | null = null;

  /**
   * Clears the current project selection.
   */
  private handleClearSelection = () => {
    if (this.project) {
      this.clearSelection();
    }
  };

  /**
   * Exports the current project with the specified options.
   */
  private handleExport = async (e: any) => {
    const { format = "image/png", quality = 1, filename, filters, width, height } = e.detail || {};

    if (this.project) {
      const dataURL = await this.exportProject(format, quality, width, height);
      if ((window as any).electronAPI) {
        const result = await (window as any).electronAPI.saveFile({
          dataURL,
          defaultName: filename || `${this.project.name}.${format.split("/")[1]}`,
          filters,
        });
        if (result.success) {
          useUIStore
            .getState()
            .showToast(`Project exported as ${format.split("/")[1].toUpperCase()}`, "info");
        }
      }
    }
  };

  /**
   * Selects the entire canvas area.
   */
  private handleSelectAll = () => {
    this.selectAll();
  };

  /**
   * Duplicates the currently active layer.
   */
  private handleDuplicate = () => {
    this.duplicateLayer();
  };

  /**
   * Handles zoom requests from external events.
   * @param e Custom event containing zoom details.
   */
  private handleZoomTo = (e: any) => {
    const { zoom, panX, panY, step } = e.detail;
    if (!this.project) return;

    if (step !== undefined) {
      const baseZoom = this.targetViewport ? this.targetViewport.zoom : this.project.zoom;
      let nextZoom: number;

      // Define increment based on magnitude (1-9% -> 0.1, 10-99% -> 1.0, etc)
      // This keeps the perceived speed constant at high zoom levels
      const magnitude = Math.pow(10, Math.floor(Math.log10(baseZoom)));
      const factor = Math.max(0.1, magnitude * 0.1);

      if (step > 0) {
        // Zoom In: Snap to next multiple of factor
        nextZoom = (Math.floor(baseZoom / factor + 0.001) + 1) * factor;
        nextZoom = Math.min(nextZoom, 50);
      } else {
        // Zoom Out: Snap to previous multiple of factor
        nextZoom = (Math.ceil(baseZoom / factor - 0.001) - 1) * factor;
        nextZoom = Math.max(nextZoom, 0.01);
      }

      this.animateZoom(nextZoom);
      return;
    }

    if (zoom !== undefined) {
      if (zoom === -1) {
        this.animateFitToScreen();
      } else if (panX !== undefined && panY !== undefined) {
        this.animateToViewport(zoom, panX, panY);
      } else {
        this.animateZoom(zoom);
      }
    }
  };

  /**
   * Animates the viewport to a specific zoom level, centered on the current view.
   * @param targetZoom The target zoom level.
   */
  public animateZoom(targetZoom: number) {
    if (!this.project) return;

    // Use current target as base for pan calculation if animating to keep it consistent
    const baseZoom = this.targetViewport ? this.targetViewport.zoom : this.project.zoom;
    const basePanX = this.targetViewport ? this.targetViewport.panX : this.project.panX;
    const basePanY = this.targetViewport ? this.targetViewport.panY : this.project.panY;

    // Viewport-centered zoom
    const viewportWidth = this.canvas.width;
    const viewportHeight = this.canvas.height;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    const targetPanX = centerX - (centerX - basePanX) * (targetZoom / baseZoom);
    const targetPanY = centerY - (centerY - basePanY) * (targetZoom / baseZoom);

    this.animateToViewport(targetZoom, targetPanX, targetPanY);
  }

  /**
   * Attaches event listeners for user interaction.
   */
  private setupEventListeners() {
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mouseleave", () => {
      window.dispatchEvent(
        new CustomEvent("forge:mouse-move", {
          detail: { x: null, y: null },
        }),
      );
    });
    this.canvas.addEventListener("dblclick", this.handleDoubleClick);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("forge:select-clear", this.handleClearSelection);
    window.addEventListener("forge:select-all", this.handleSelectAll);
    window.addEventListener("forge:duplicate-layer", this.handleDuplicate);
    window.addEventListener("forge:export-project", this.handleExport as any);
    window.addEventListener("forge:save-image", this.handleSaveImage as any);
    window.addEventListener("forge:request-export-preview", this.handleRequestExportPreview as any);
    window.addEventListener("forge:request-thumbnail", this.handleRequestThumbnail as any);
    window.addEventListener("forge:zoom-to", this.handleZoomTo as any);
    window.addEventListener("forge:export-to-clipboard", this.handleExportToClipboard as any);
  }

  /**
   * Preloads all images and fonts for the project layers.
   * This is essential for headless mode to ensure everything is ready before rendering.
   */
  public async preloadImages(): Promise<void> {
    if (!this.project) return;

    // 1. Wait for fonts to be ready
    try {
      await (document as any).fonts.ready;
    } catch (e) {
      console.warn("Font preloading failed", e);
    }

    // 2. Wait for all raster and smart object images to be loaded and decoded
    const promises = this.project.layers.map(async (layer) => {
      const sourceData = (
        layer.type === "smart_object" ? layer.dataOriginal || layer.data : layer.data
      ) as string | undefined;

      if ((layer.type === "raster" || layer.type === "smart_object") && sourceData) {
        return new Promise<void>((resolve) => {
          let img = this.imageCache.get(sourceData);
          if (!img) {
            img = new Image();
            img.src = sourceData;
            this.imageCache.set(sourceData, img);
          }

          const onDone = async () => {
            img?.removeEventListener("load", onDone);
            img?.removeEventListener("error", onDone);

            // Wait for decoding to ensure it's ready for canvas drawing
            try {
              if (img?.decode) await img.decode();
            } catch (e) {
              console.warn("Image decode failed", e);
            }
            resolve();
          };

          if (img.complete && img.naturalWidth > 0) {
            onDone();
          } else {
            img.addEventListener("load", onDone);
            img.addEventListener("error", onDone);
            // Safety: if it failed and is complete, naturalWidth will be 0
            if (img.complete && img.naturalWidth === 0) resolve();
          }
        });
      }
      return Promise.resolve();
    });

    await Promise.all(promises);
  }

  /**
   * Handles exporting the full project to the clipboard.
   */
  private handleExportToClipboard = async () => {
    if (!this.project) return;
    await this.exportToClipboard();
  };

  /**
   * Copies the entire project to the system clipboard.
   */
  public async exportToClipboard() {
    if (!this.project) return;

    await this.preloadImages();

    // We avoid fetch(dataURL) due to CSP restrictions in some environments.
    // Instead, we'll manually render the project to a blob.
    const finalWidth = this.project.width;
    const finalHeight = this.project.height;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = finalWidth;
    exportCanvas.height = finalHeight;
    const exportCtx = exportCanvas.getContext("2d")!;
    exportCtx.imageSmoothingEnabled = false;

    for (const layer of this.project.layers) {
      if (layer.visible && !layer.parentId) {
        this.renderLayer(exportCtx, layer);
      }
    }

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        exportCanvas.toBlob(resolve, "image/png"),
      );

      if (!blob) throw new Error("Failed to create blob");

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      useUIStore.getState().showToast("Project copied to clipboard", "info");
    } catch (err) {
      console.error("Failed to export to clipboard:", err);
      useUIStore.getState().showToast("Failed to copy to clipboard", "error");
    }
  }

  /**
   * Handles direct image saving (Ctrl+S) for image-based projects.
   */
  private handleSaveImage = async (e: any) => {
    const { filePath } = e.detail || {};

    if (this.project && filePath) {
      const ext = filePath.split(".").pop().toLowerCase() || "";
      const formatMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        bmp: "image/bmp",
      };
      const format = formatMap[ext] || "image/png";

      const dataURL = await this.exportProject(
        format,
        1.0,
        this.project.width,
        this.project.height,
      );

      if ((window as any).electronAPI) {
        const result = await (window as any).electronAPI.saveImage({
          dataURL,
          filePath,
        });

        if (result.success) {
          useProjectStore.getState().updateProject(this.project.id, { isDirty: false });
          useUIStore.getState().showToast("Image saved successfully", "info");
        } else {
          useUIStore.getState().showToast(`Failed to save image: ${result.error}`, "error");
        }
      }
    }
  };

  /**
   * Handles a request for an export preview, generating a dataURL and calling the provided callback.
   */
  private handleRequestExportPreview = async (e: any) => {
    const { format, quality, callback, width, height } = e.detail;
    if (this.project) {
      const dataURL = await this.exportProject(format, quality, width, height);
      callback(dataURL);
    }
  };

  /**
   * Handles a request for a project thumbnail.
   */
  private handleRequestThumbnail = async (e: any) => {
    const { callback, size = 200 } = e.detail;
    if (this.project) {
      const dataURL = await this.generateThumbnail(size);
      callback(dataURL);
    }
  };

  /**
   * Generates a square thumbnail of the current project.
   */
  public async generateThumbnail(size: number = 200): Promise<string> {
    if (!this.project) return "";

    await this.preloadImages();
    this.render();

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const thumbCtx = thumbCanvas.getContext("2d")!;
    thumbCtx.imageSmoothingEnabled = true;

    // Dark background for the square
    thumbCtx.fillStyle = "#1a1a1a";
    thumbCtx.fillRect(0, 0, size, size);

    const projectRatio = this.project.width / this.project.height;
    let drawW, drawH, drawX, drawY;

    if (projectRatio > 1) {
      // Landscape: fit to height, crop horizontal
      drawH = size;
      drawW = size * projectRatio;
      drawX = (size - drawW) / 2;
      drawY = 0;
    } else {
      // Portrait or square: fit to width, crop vertical
      drawW = size;
      drawH = size / projectRatio;
      drawX = 0;
      drawY = (size - drawH) / 2;
    }

    thumbCtx.drawImage(this.projectBuffer, drawX, drawY, drawW, drawH);

    return thumbCanvas.toDataURL("image/jpeg", 0.9);
  }

  /**
   * Handles keyboard release events to track modifier keys.
   */
  private handleKeyUp = (e: KeyboardEvent) => {
    this.isCtrlPressed = e.ctrlKey || e.metaKey;
  };

  /**
   * Clears the current selection and commits any floating layers.
   */
  private async clearSelection() {
    if (!this.project) return;
    if (this.project.selection.hasSelection) {
      useProjectStore.getState().pushHistory(this.project.id, "Deselect");
    }
    if (this.project.selection.floatingLayer) {
      await this.commitFloatingLayer();
    }
    useProjectStore.getState().updateProject(this.project.id, {
      selection: { hasSelection: false, bounds: null, mask: undefined, floatingLayer: null },
    });
    this.selectionCanvas.width = 1;
    this.selectionCanvas.height = 1;
    this.selectionCtx.clearRect(0, 0, 1, 1);
    this.updateSelectionEdges();
  }

  /**
   * Handles keyboard press events for shortcuts and tool interactions.
   */
  private handleKeyDown = (e: KeyboardEvent) => {
    // Check if any modal is open before processing global shortcuts
    if (useUIStore.getState().isAnyModalOpen()) return;

    // Do not trigger global shortcuts if the user is typing in an input
    // const target = e.target as HTMLElement;
    // if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    //   return;

    this.isCtrlPressed = e.ctrlKey || e.metaKey;

    const tool = this.getActiveTool();
    const context = this.getToolContext();
    if (tool && context) {
      const consumed = tool.onKeyDown(e, context);
      if (consumed) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
    }

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key.toLowerCase() === "c") {
      this.copyToClipboard();
    } else if (isCtrl && e.key.toLowerCase() === "v") {
      this.pasteFromClipboard();
    } else if (isCtrl && e.key.toLowerCase() === "x") {
      this.cutToClipboard();
    }
  };

  /**
   * Cuts the selected area from the active layer to the clipboard.
   */
  public async cutToClipboard() {
    if (!this.project || !this.project.activeLayerId) return;

    // 1. Copy first
    await this.copyToClipboard();

    // 2. Clear selection
    const activeLayer = this.project.layers.find((l) => l.id === this.project?.activeLayerId);
    if (!activeLayer || activeLayer.type !== "raster" || !activeLayer.data) return;

    const layerCanvas = this.layerCanvasCache.get(activeLayer.id);
    if (!layerCanvas) return;

    if (this.project.selection.hasSelection && this.project.selection.bounds) {
      const { bounds } = this.project.selection;
      const ctx = layerCanvas.getContext("2d")!;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";

      // Draw selection mask relative to layer
      ctx.drawImage(this.selectionCanvas, bounds.x - activeLayer.x, bounds.y - activeLayer.y);
      ctx.restore();

      // Update project store
      useProjectStore.getState().updateLayer(this.project.id, activeLayer.id, {
        data: layerCanvas.toDataURL(),
      });
      this.invalidateLayerCache(activeLayer.id);
    } else {
      // If no selection, maybe clear whole layer?
      // Most editors "Cut" whole layer if no selection, but let's just do nothing for safety or clear it.
      // Standard behavior: Cut entire layer.
      useProjectStore.getState().updateLayer(this.project.id, activeLayer.id, {
        data: undefined,
      });
      this.invalidateLayerCache(activeLayer.id);
    }
  }

  /**
   * Copies the selected area (or entire active layer) to the system clipboard.
   */
  public async copyToClipboard() {
    if (!this.project || !this.project.activeLayerId) return;

    const activeLayer = this.project.layers.find((l) => l.id === this.project?.activeLayerId);
    if (!activeLayer || activeLayer.type !== "raster" || !activeLayer.data) return;

    // Check if layer is visible or locked
    if (!activeLayer.visible) {
      useUIStore.getState().showToast("Cannot copy from a hidden layer", "warning");
      return;
    }
    if (activeLayer.locked) {
      // For copy it might be okay, but user asked to prevent it for both
      useUIStore.getState().showToast("Cannot copy from a locked layer", "warning");
      return;
    }

    let sourceCanvas: HTMLCanvasElement;
    let finalX = activeLayer.x;
    let finalY = activeLayer.y;

    const layerCanvas = this.layerCanvasCache.get(activeLayer.id);
    if (!layerCanvas) return;

    if (!this.project.selection.hasSelection || !this.project.selection.bounds) {
      sourceCanvas = layerCanvas;
    } else {
      const { bounds } = this.project.selection;

      // 1. First, check if there are ANY pixels in this selection on the current layer
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = bounds.width;
      tempCanvas.height = bounds.height;
      const tempCtx = tempCanvas.getContext("2d")!;

      const layerOffsetX = activeLayer.x - bounds.x;
      const layerOffsetY = activeLayer.y - bounds.y;

      tempCtx.drawImage(layerCanvas, layerOffsetX, layerOffsetY);
      tempCtx.globalCompositeOperation = "destination-in";
      tempCtx.drawImage(this.selectionCanvas, 0, 0);

      const optimizedBounds = getOptimizedBoundingBox(tempCanvas, {
        x: 0,
        y: 0,
        width: tempCanvas.width,
        height: tempCanvas.height,
      });

      // Selection is empty for this layer
      if (!optimizedBounds) {
        useUIStore.getState().showToast("The selection is empty on this layer", "warning");
        return;
      }

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = optimizedBounds.width;
      finalCanvas.height = optimizedBounds.height;
      const finalCtx = finalCanvas.getContext("2d")!;
      finalCtx.drawImage(
        tempCanvas,
        optimizedBounds.x,
        optimizedBounds.y,
        optimizedBounds.width,
        optimizedBounds.height,
        0,
        0,
        optimizedBounds.width,
        optimizedBounds.height,
      );
      sourceCanvas = finalCanvas;
      finalX = bounds.x + optimizedBounds.x;
      finalY = bounds.y + optimizedBounds.y;
    }

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        sourceCanvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;

      const metadata = {
        source: "forge-editor",
        projectId: this.project.id,
        x: finalX,
        y: finalY,
      };

      const metadataBlob = new Blob([JSON.stringify(metadata)], {
        type: "text/plain",
      });

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
          "text/plain": metadataBlob,
        }),
      ]);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  }

  /**
   * Pastes an image from the system clipboard into a new layer.
   */
  public async pasteFromClipboard() {
    if (!this.project) return;

    // Deselect if selection is empty (standard QoL behavior)
    if (this.project.selection.hasSelection) {
      // If we have a selection, let's just clear it to paste normally
      // Usually editors paste INSIDE if there's a selection, but here the request is:
      // "paste and if there is a selection, remove the selection and paste normally"
      // If the selection has NO pixels it's redundant to keep it.
      // Most users actually want to paste as new layer and ignore selection if it's just a rectangle.
      useProjectStore.getState().updateProject(this.project.id, {
        selection: { hasSelection: false, bounds: null, mask: undefined },
      });
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;

        let pasteX: number | null = null;
        let pasteY: number | null = null;

        if (item.types.includes("text/plain")) {
          const textBlob = await item.getType("text/plain");
          const text = await textBlob.text();
          try {
            const metadata = JSON.parse(text);
            if (metadata.source === "forge-editor" && metadata.projectId === this.project.id) {
              pasteX = metadata.x;
              pasteY = metadata.y;
            }
          } catch (_) {
            // Not our metadata
          }
        }

        const imageBlob = await item.getType(imageType);
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const img = new Image();
          img.onload = () => {
            if (pasteX === null || pasteY === null) {
              // Center in viewport
              const viewportWidth = this.canvas.width;
              const viewportHeight = this.canvas.height;
              const projCenterX = (viewportWidth / 2 - this.project!.panX) / this.project!.zoom;
              const projCenterY = (viewportHeight / 2 - this.project!.panY) / this.project!.zoom;
              pasteX = Math.round(projCenterX - img.naturalWidth / 2);
              pasteY = Math.round(projCenterY - img.naturalHeight / 2);
            }

            useProjectStore.getState().addLayer(this.project!.id, {
              name: "Pasted Layer",
              type: "raster",
              data: dataUrl,
              width: img.naturalWidth,
              height: img.naturalHeight,
              x: pasteX,
              y: pasteY,
            });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(imageBlob);
        break; // Only paste the first image found
      }
    } catch (err) {
      console.error("Failed to paste from clipboard:", err);
    }
  }

  /**
   * Handles mouse release events.
   */
  private handleMouseUp(e: MouseEvent) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = "default";
      return;
    }

    const tool = this.getActiveTool();
    const context = this.getToolContext();
    if (tool && context) {
      tool.onMouseUp(e, context);
    }
  }

  /**
   * Retrieves the currently active tool instance.
   */
  private getActiveTool(): BaseTool | null {
    const activeToolId = useToolStore.getState().activeToolId;
    return this.tools[activeToolId] || null;
  }

  /**
   * Creates the tool context object provided to tools during interaction.
   */
  private getToolContext(): ToolContext | null {
    if (!this.project) return null;
    const toolStore = useToolStore.getState();

    const context = {
      activeToolId: toolStore.activeToolId,
      previousToolId: toolStore.previousToolId,
      get settings() {
        return useToolStore.getState().toolSettings;
      },
      canvas: this.canvas,
      ctx: this.ctx,
      updateProject: (updates: Partial<Project>) => {
        if (this.project) {
          useProjectStore.getState().updateProject(this.project.id, updates);
        }
      },
      pushHistory: (description: string) => {
        if (this.project) {
          useProjectStore.getState().pushHistory(this.project.id, description);
        }
      },
      addHistoryEntry: (entry: any) => {
        if (this.project) {
          useProjectStore.getState().addHistoryEntry(this.project.id, entry);
        }
      },
      invalidateCache: (layerId: string) => this.invalidateLayerCache(layerId),
      screenToProject: (x: number, y: number) => this.screenToProject(x, y),
      get foregroundColor() {
        return useToolStore.getState().foregroundColor;
      },
      get backgroundColor() {
        return useToolStore.getState().backgroundColor;
      },
      getSelectionCanvas: () => ({
        canvas: this.selectionCanvas,
        ctx: this.selectionCtx,
      }),
      updateSelectionEdges: () => this.updateSelectionEdges(),
      setLastSelectionMask: (mask: string | undefined) => {
        this.lastSelectionMask = mask;
      },
      floatSelection: (layerId: string) => this.floatSelection(layerId),
      commitFloatingLayer: () => this.commitFloatingLayer(),
      clearSelection: () => this.clearSelection(),
      setInteracting: (isInteracting: boolean) =>
        useToolStore.getState().setInteracting(isInteracting),
      setActiveTool: (id: any) => useToolStore.getState().setActiveTool(id),
      updateToolSettings: (id: any, settings: any) =>
        useToolStore.getState().updateToolSettings(id, settings),
      subscribe: (listener: any) => useToolStore.subscribe((state) => listener(state.toolSettings)),
      setLayerCache: (layerId: string, canvas: HTMLCanvasElement) => {
        this.layerCanvasCache.set(layerId, canvas);
        this.layerReadyCache.set(layerId, true);
      },
      getLayerCanvas: (layerId: string) => {
        const canvas = this.layerCanvasCache.get(layerId);
        if (!canvas) return null;
        return { canvas, ready: !!this.layerReadyCache.get(layerId) };
      },
      ensureLayerCanvas: (layer: Layer) => this.ensureLayerCanvas(layer),
      animateFitToScreen: (ow?: number, oh?: number) => this.animateFitToScreen(ow, oh),
      isLayerLocked: (layerId: string) => {
        const layer = this.project?.layers.find((l) => l.id === layerId);
        if (!layer) return false;
        return layer.locked || this.isAncestorLocked(layer);
      },
      isLayerVisible: (layerId: string) => {
        const layer = this.project?.layers.find((l) => l.id === layerId);
        if (!layer) return false;
        return layer.visible && this.isAncestorVisible(layer);
      },
    };

    Object.defineProperty(context, "project", {
      get: () => this.project,
      enumerable: true,
      configurable: true,
    });

    return context as any as ToolContext;
  }

  /**
   * Ensures that a layer has a cached canvas representation.
   * @param layer The layer to cache.
   */
  public async ensureLayerCanvas(layer: Layer): Promise<HTMLCanvasElement> {
    const cached = this.layerCanvasCache.get(layer.id);
    if (
      cached &&
      this.layerReadyCache.get(layer.id) &&
      cached.width === layer.width &&
      cached.height === layer.height
    ) {
      return cached;
    }

    // Create and populate if not ready or not matching
    const canvas = document.createElement("canvas");
    canvas.width = layer.width;
    canvas.height = layer.height;
    const ctx = canvas.getContext("2d")!;

    if (layer.data) {
      const img = await this.loadImage(layer.data);
      ctx.drawImage(img, 0, 0);
    }

    // We don't necessarily want to update the main cache here as it might
    // conflict with the render loop, but for tools it's fine.
    return canvas;
  }

  /**
   * Helper to load an image from a source string.
   */
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  /**
   * Converts screen coordinates to project space coordinates.
   */
  public screenToProject(x: number, y: number) {
    if (!this.project) return { x, y };
    return {
      x: (x - this.project.panX) / this.project.zoom,
      y: (y - this.project.panY) / this.project.zoom,
    };
  }

  /**
   * Handles mouse wheel events for zooming and panning.
   */
  private handleWheel(e: WheelEvent) {
    if (!this.project) return;
    this.stopViewportAnimation();
    e.preventDefault();

    let newScale = this.project.zoom;
    let newOriginX = this.project.panX;
    let newOriginY = this.project.panY;

    if (e.ctrlKey || e.metaKey) {
      const mx = e.offsetX;
      const my = e.offsetY;
      const wheelDelta = -e.deltaY;
      const normalizedDelta =
        Math.sign(wheelDelta) * Math.min(Math.abs(wheelDelta * this.ZOOM_SENSITIVITY), 0.5);

      const zoomFactor = Math.exp(normalizedDelta);
      const targetScale = Math.min(Math.max(this.project.zoom * zoomFactor, 0.05), 50);

      const scaleChange = (targetScale - this.project.zoom) * this.ZOOM_SMOOTHING;
      newScale = this.project.zoom + scaleChange;

      newOriginX = mx - (mx - this.project.panX) * (newScale / this.project.zoom);
      newOriginY = my - (my - this.project.panY) * (newScale / this.project.zoom);
    } else {
      newOriginX = this.project.panX - e.deltaX;
      newOriginY = this.project.panY - e.deltaY;
    }

    this.project.zoom = newScale;
    this.project.panX = newOriginX;
    this.project.panY = newOriginY;

    this.onViewportChange?.(newScale, newOriginX, newOriginY);
  }

  /**
   * Handles mouse down events.
   */
  private handleMouseDown(e: MouseEvent) {
    if (!this.project) return;
    this.stopViewportAnimation();

    if (e.button === 1) {
      this.isPanning = true;
      this.startX = e.clientX - this.project.panX;
      this.startY = e.clientY - this.project.panY;
      this.canvas.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }

    const tool = this.getActiveTool();
    const context = this.getToolContext();
    if (tool && context) {
      tool.onMouseDown(e, context);
    }
  }

  /**
   * Handles mouse double click events.
   */
  private handleDoubleClick(e: MouseEvent) {
    if (!this.project) return;
    const tool = this.getActiveTool();
    const context = this.getToolContext();
    if (tool && context) {
      tool.onDoubleClick(e, context);
    }
  }

  /**
   * Stops any ongoing viewport animation.
   */
  private stopViewportAnimation() {
    if (this.viewportAnimationId) {
      cancelAnimationFrame(this.viewportAnimationId);
      this.viewportAnimationId = null;
    }
  }

  /**
   * Handles mouse movement events.
   */
  private handleMouseMove(e: MouseEvent) {
    if (!this.project) return;

    const rect = this.canvas.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    window.dispatchEvent(
      new CustomEvent("forge:mouse-move", {
        detail: { x: offsetX, y: offsetY },
      }),
    );

    if (this.isPanning) {
      const newPanX = e.clientX - this.startX;
      const newPanY = e.clientY - this.startY;

      this.project.panX = newPanX;
      this.project.panY = newPanY;

      this.onViewportChange?.(this.project.zoom, newPanX, newPanY);
      return;
    }

    const tool = this.getActiveTool();
    const context = this.getToolContext();
    if (tool && context) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseEvent =
        e.target === this.canvas
          ? e
          : ({
              ...e,
              offsetX: e.clientX - rect.left,
              offsetY: e.clientY - rect.top,
            } as MouseEvent);

      tool.onMouseMove(mouseEvent, context);
    }
  }

  /**
   * Starts the main rendering loop.
   */
  private startRenderLoop() {
    const loop = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Completely stops the engine and removes all event listeners.
   */
  public destroy() {
    this.stopRenderLoop();
  }

  /**
   * Stops the animation loop and removes event listeners from the canvas and window.
   */
  public stopRenderLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("forge:select-clear", this.handleClearSelection);
    window.removeEventListener("forge:select-all", this.handleSelectAll);
    window.removeEventListener("forge:duplicate-layer", this.handleDuplicate);
    window.removeEventListener("forge:export-project", this.handleExport as any);
    window.removeEventListener("forge:save-image", this.handleSaveImage as any);
    window.removeEventListener(
      "forge:request-export-preview",
      this.handleRequestExportPreview as any,
    );
    window.removeEventListener("forge:zoom-to", this.handleZoomTo as any);

    // if (this.unsubscribeToolStore) {
    //   this.unsubscribeToolStore();
    // }
  }

  /**
   * Generates or retrieves the checkerboard pattern used for the background.
   */
  private getCheckerPattern(): CanvasPattern {
    if (!this.checkerPattern) {
      const size = 8;
      const patternCanvas = document.createElement("canvas");
      patternCanvas.width = size * 2;
      patternCanvas.height = size * 2;
      const pctx = patternCanvas.getContext("2d")!;
      pctx.imageSmoothingEnabled = false;
      pctx.fillStyle = "#333";
      pctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
      pctx.fillStyle = "#444";
      pctx.fillRect(0, 0, size, size);
      pctx.fillRect(size, size, size, size);
      this.checkerPattern = this.ctx.createPattern(patternCanvas, "repeat")!;
    }
    return this.checkerPattern;
  }

  /**
   * Sets the current project and invalidates caches if necessary.
   */
  public setProject(project: Project) {
    const prevProjectId = this.project?.id;
    const prevLayers = this.project?.layers;
    const maskChanged = project.selection.mask !== this.lastSelectionMask;
    this.project = project;

    if (prevProjectId !== project.id) {
      // Clear caches for new project
      this.layerCanvasCache.clear();
      this.layerReadyCache.clear();
      this.imageCache.clear();
    } else if (prevLayers !== project.layers) {
      // Invalidate specific layer caches only if data/size changed
      for (const layer of project.layers) {
        const prevLayer = prevLayers?.find((l) => l.id === layer.id);
        if (
          !prevLayer ||
          prevLayer.data !== layer.data ||
          prevLayer.width !== layer.width ||
          prevLayer.height !== layer.height
        ) {
          this.invalidateLayerCache(layer.id);
        }
      }
    }

    if (maskChanged || prevProjectId !== project.id) {
      this.lastSelectionMask = project.selection.mask;
      // Reset selection canvas
      if (project.selection.bounds && project.selection.mask) {
        this.selectionCanvas.width = project.selection.bounds.width;
        this.selectionCanvas.height = project.selection.bounds.height;
        const img = new Image();
        img.onload = () => {
          this.selectionCtx.clearRect(
            0,
            0,
            this.selectionCanvas.width,
            this.selectionCanvas.height,
          );
          this.selectionCtx.drawImage(img, 0, 0);
          this.updateSelectionEdges();
        };
        img.src = project.selection.mask;
      } else {
        this.selectionCanvas.width = 1;
        this.selectionCanvas.height = 1;
        this.selectionCtx.clearRect(0, 0, 1, 1);
        this.selectionEdges = null;
      }
    } else if (project.selection.hasSelection && !this.selectionEdges) {
      // In case the mask hasn't changed (already synchronized by the Tool), but the edges don't exist yet
      this.updateSelectionEdges();
    }
  }

  /**
   * Recalculates the selection edges for rendering the marching ants effect.
   */
  private updateSelectionEdges() {
    if (!this.project || !this.project.selection.hasSelection) {
      this.selectionEdges = null;
      return;
    }

    const w = this.selectionCanvas.width;
    const h = this.selectionCanvas.height;
    if (w <= 0 || h <= 0) {
      this.selectionEdges = null;
      return;
    }

    const imageData = this.selectionCtx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const horizontal: any[] = [];
    const vertical: any[] = [];

    const isSelected = (x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return false;
      return data[(y * w + x) * 4 + 3] > 0;
    };

    for (let y = -1; y < h; y++) {
      for (let x = -1; x < w; x++) {
        const current = isSelected(x, y);
        if (current !== isSelected(x, y + 1)) {
          horizontal.push({ x: x, y: y + 1, length: 1 });
        }
        if (current !== isSelected(x + 1, y)) {
          vertical.push({ x: x + 1, y: y, length: 1 });
        }
      }
    }

    const mergeSegments = (segments: any[], orientation: "horizontal" | "vertical") => {
      if (segments.length === 0) return [];
      const isHorizontal = orientation === "horizontal";
      if (isHorizontal) {
        segments.sort((a, b) => a.y - b.y || a.x - b.x);
      } else {
        segments.sort((a, b) => a.x - b.x || a.y - b.y);
      }
      const merged = [segments[0]];
      for (let i = 1; i < segments.length; i++) {
        const last = merged[merged.length - 1];
        const current = segments[i];
        if (isHorizontal) {
          if (current.y === last.y && current.x === last.x + last.length) {
            last.length += current.length;
          } else {
            merged.push(current);
          }
        } else {
          if (current.x === last.x && current.y === last.y + last.length) {
            last.length += current.length;
          } else {
            merged.push(current);
          }
        }
      }
      return merged;
    };

    this.selectionEdges = {
      horizontal: mergeSegments(horizontal, "horizontal"),
      vertical: mergeSegments(vertical, "vertical"),
    };
  }

  /**
   * Renders the marching ants effect around the selection.
   */
  private renderSelection() {
    if (
      !this.project ||
      !this.project.selection.hasSelection ||
      !this.selectionEdges ||
      !this.project.selection.bounds
    ) {
      return;
    }

    this.ctx.save();
    this.ctx.setTransform(
      this.project.zoom,
      0,
      0,
      this.project.zoom,
      this.project.panX,
      this.project.panY,
    );

    // If we have a floating layer, use its coordinates for the selection border
    const bounds = this.project.selection.floatingLayer || this.project.selection.bounds;
    const { x: bx, y: by } = bounds;
    const zoom = this.project.zoom;

    this.marchingAntsOffset = (Date.now() / 100) % 8;

    this.ctx.lineWidth = 1 / zoom;

    // Render horizontal edges
    for (const seg of this.selectionEdges.horizontal) {
      this.ctx.beginPath();
      this.ctx.setLineDash([4 / zoom, 4 / zoom]);
      this.ctx.lineDashOffset = -this.marchingAntsOffset / zoom;

      // Draw white line
      this.ctx.strokeStyle = "white";
      this.ctx.moveTo(bx + seg.x, by + seg.y);
      this.ctx.lineTo(bx + seg.x + seg.length, by + seg.y);
      this.ctx.stroke();

      // Draw interlaced black line (contrast)
      this.ctx.beginPath();
      this.ctx.strokeStyle = "black";
      this.ctx.lineDashOffset = -(this.marchingAntsOffset + 4) / zoom;
      this.ctx.moveTo(bx + seg.x, by + seg.y);
      this.ctx.lineTo(bx + seg.x + seg.length, by + seg.y);
      this.ctx.stroke();
    }

    // Render vertical edges
    for (const seg of this.selectionEdges.vertical) {
      this.ctx.beginPath();
      this.ctx.setLineDash([4 / zoom, 4 / zoom]);
      this.ctx.lineDashOffset = -this.marchingAntsOffset / zoom;

      this.ctx.strokeStyle = "white";
      this.ctx.moveTo(bx + seg.x, by + seg.y);
      this.ctx.lineTo(bx + seg.x, by + seg.y + seg.length);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.strokeStyle = "black";
      this.ctx.lineDashOffset = -(this.marchingAntsOffset + 4) / zoom;
      this.ctx.moveTo(bx + seg.x, by + seg.y);
      this.ctx.lineTo(bx + seg.x, by + seg.y + seg.length);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Resizes the viewport to fit the project on screen.
   */
  public fitToScreen() {
    if (!this.project || !this.canvas.parentElement) return;
    const cw = this.canvas.parentElement.clientWidth;
    const ch = this.canvas.parentElement.clientHeight;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const padding = 40;
    const scaleX = (cw - padding * 2) / this.project.width;
    const scaleY = (ch - padding * 2) / this.project.height;
    const scale = Math.min(scaleX, scaleY);
    const originX = (cw - this.project.width * scale) / 2;
    const originY = (ch - this.project.height * scale) / 2;
    this.project.zoom = scale;
    this.project.panX = originX;
    this.project.panY = originY;
    this.onViewportChange?.(scale, originX, originY);
  }

  /**
   * Animates the viewport to fit the project (or override dimensions) on screen.
   */
  public animateFitToScreen(overrideWidth?: number, overrideHeight?: number) {
    if (!this.project || !this.canvas.parentElement) return;
    const cw = this.canvas.parentElement.clientWidth;
    const ch = this.canvas.parentElement.clientHeight;

    const targetW = overrideWidth ?? this.project.width;
    const targetH = overrideHeight ?? this.project.height;

    const padding = 40;
    const scaleX = (cw - padding * 2) / targetW;
    const scaleY = (ch - padding * 2) / targetH;
    const scale = Math.min(scaleX, scaleY);
    const originX = (cw - targetW * scale) / 2;
    const originY = (ch - targetH * scale) / 2;

    this.animateToViewport(scale, originX, originY);
  }

  /**
   * Animates the viewport to a specific zoom and pan position.
   */
  private animateToViewport(targetZoom: number, targetPanX: number, targetPanY: number) {
    if (!this.project) return;

    this.targetViewport = { zoom: targetZoom, panX: targetPanX, panY: targetPanY };

    if (this.viewportAnimationId) {
      cancelAnimationFrame(this.viewportAnimationId);
    }

    const startZoom = this.project.zoom;
    const startPanX = this.project.panX;
    const startPanY = this.project.panY;

    // We want to interpolate the "project point" that is at the center of the viewport
    const viewportWidth = this.canvas.width;
    const viewportHeight = this.canvas.height;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    const startCenterProjX = (centerX - startPanX) / startZoom;
    const startCenterProjY = (centerY - startPanY) / startZoom;
    const targetCenterProjX = (centerX - targetPanX) / targetZoom;
    const targetCenterProjY = (centerY - targetPanY) / targetZoom;

    const duration = 400; // Snappier duration
    const startTime = performance.now();

    const animate = (now: number) => {
      if (!this.project) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: starts fast, slows down at the end
      const ease = 1 - Math.pow(1 - progress, 3);

      // EXPONENTIAL interpolation for Zoom
      const currentZoom = Math.exp(
        Math.log(startZoom) + (Math.log(targetZoom) - Math.log(startZoom)) * ease,
      );

      // Interpolate the project point at the center of the viewport
      const currentCenterProjX = startCenterProjX + (targetCenterProjX - startCenterProjX) * ease;
      const currentCenterProjY = startCenterProjY + (targetCenterProjY - startCenterProjY) * ease;

      // Calculate new Pan based on the interpolated center point
      const currentPanX = centerX - currentCenterProjX * currentZoom;
      const currentPanY = centerY - currentCenterProjY * currentZoom;

      this.project.zoom = currentZoom;
      this.project.panX = currentPanX;
      this.project.panY = currentPanY;
      this.onViewportChange?.(currentZoom, currentPanX, currentPanY);

      if (progress < 1) {
        this.viewportAnimationId = requestAnimationFrame(animate);
      } else {
        this.viewportAnimationId = null;
        this.targetViewport = null;
      }
    };

    this.viewportAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Checks if a layer intersects with the project dimensions.
   */
  private intersects(layer: Layer, projectWidth: number, projectHeight: number): boolean {
    return !(
      layer.x >= projectWidth ||
      layer.x + layer.width <= 0 ||
      layer.y >= projectHeight ||
      layer.y + layer.height <= 0
    );
  }

  /**
   * Checks if all ancestors of a layer are visible.
   */
  private isAncestorVisible(layer: Layer): boolean {
    if (!this.project || !layer.parentId) return true;
    const parent = this.project.layers.find((l) => l.id === layer.parentId);
    if (!parent) return true;
    if (!parent.visible) return false;
    return this.isAncestorVisible(parent);
  }

  /**
   * Checks if any ancestor of a layer is locked.
   */
  private isAncestorLocked(layer: Layer): boolean {
    if (!this.project || !layer.parentId) return false;
    const parent = this.project.layers.find((l) => l.id === layer.parentId);
    if (!parent) return false;
    if (parent.locked) return true;
    return this.isAncestorLocked(parent);
  }

  /**
   * Main render function that clears the canvas and draws the project, tools, and UI.
   */
  public render() {
    if (!this.project) return;

    // Detect tool change
    const activeToolId = useToolStore.getState().activeToolId;
    if (activeToolId !== this.currentToolId) {
      const context = this.getToolContext();
      if (context) {
        if (this.currentToolId && this.tools[this.currentToolId]) {
          this.tools[this.currentToolId].onDeactivate(context);
        }
        this.currentToolId = activeToolId;
        if (this.currentToolId && this.tools[this.currentToolId]) {
          this.tools[this.currentToolId].onActivate(context);
        }
        // Reset default cursor when switching
        this.canvas.style.cursor = "default";
      }
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;

    // --- STEP 1: COMPOSITE PROJECT IN 1:1 BUFFER ---
    if (
      this.projectBuffer.width !== this.project.width ||
      this.projectBuffer.height !== this.project.height
    ) {
      this.projectBuffer.width = this.project.width;
      this.projectBuffer.height = this.project.height;
    }
    this.projectCtx.clearRect(0, 0, this.projectBuffer.width, this.projectBuffer.height);
    this.projectCtx.imageSmoothingEnabled = false;

    for (const layer of this.project.layers) {
      if (layer.visible && !layer.parentId && this.isAncestorVisible(layer)) {
        // Groups should always be rendered to the buffer if they are top-level,
        // as they act as containers and their 0-dimension bounds shouldn't cause them to be skipped.
        if (
          layer.type === "group" ||
          this.intersects(layer, this.project.width, this.project.height)
        ) {
          this.renderLayer(this.projectCtx, layer);
        }
      }
    }

    // Render floating layer if it exists
    if (this.project.selection.floatingLayer && this.project.selection.floatingLayer.visible) {
      this.renderLayer(this.projectCtx, this.project.selection.floatingLayer);
    }

    // --- STEP 2: DRAW BUFFER TO VIEWPORT ---
    this.ctx.save();
    this.ctx.setTransform(
      this.project.zoom,
      0,
      0,
      this.project.zoom,
      this.project.panX,
      this.project.panY,
    );

    // Draw checkerboard background
    this.ctx.fillStyle = this.getCheckerPattern();
    this.ctx.fillRect(0, 0, this.project.width, this.project.height);

    // Draw the composited project
    this.ctx.drawImage(this.projectBuffer, 0, 0);

    // Render layers that are outside the project (no clipping)
    for (const layer of this.project.layers) {
      if (
        layer.visible &&
        !layer.parentId &&
        layer.type !== "group" && // Groups are already handled in the buffer loop
        this.isAncestorVisible(layer) &&
        !this.intersects(layer, this.project.width, this.project.height)
      ) {
        this.renderLayer(this.ctx, layer);
      }
    }

    if (this.project.zoom >= 10) {
      this.renderPixelGrid();
    }

    // --- STEP 3: RENDER TOOLS AND UI ---
    const tool = this.getActiveTool();
    const context = this.getToolContext();
    if (tool && context) tool.onRender(this.ctx, context);

    const editingLayerId = tool?.getEditingLayerId();

    if (this.project.activeLayerId && activeToolId !== "transform" && activeToolId !== "crop") {
      const activeLayer = this.project.layers.find((l) => l.id === this.project?.activeLayerId);
      if (activeLayer && activeLayer.id !== editingLayerId) {
        this.ctx.save();

        const effectivelyVisible = activeLayer.visible && this.isAncestorVisible(activeLayer);
        const effectivelyLocked = activeLayer.locked || this.isAncestorLocked(activeLayer);

        if (!effectivelyVisible) {
          this.ctx.strokeStyle = "rgba(150, 150, 150, 0.7)";
        } else if (effectivelyLocked) {
          this.ctx.strokeStyle = "rgba(255, 204, 0, 0.9)";
        } else {
          this.ctx.strokeStyle = "rgba(0, 120, 255, 0.9)";
        }

        this.ctx.lineWidth = 1 / this.project.zoom;
        this.ctx.setLineDash([4 / this.project.zoom, 2 / this.project.zoom]);

        if (activeLayer.rotation) {
          const centerX = activeLayer.x + activeLayer.width / 2;
          const centerY = activeLayer.y + activeLayer.height / 2;
          this.ctx.translate(centerX, centerY);
          this.ctx.rotate((activeLayer.rotation * Math.PI) / 180);
          this.ctx.strokeRect(
            -activeLayer.width / 2,
            -activeLayer.height / 2,
            activeLayer.width,
            activeLayer.height,
          );
        } else {
          this.ctx.strokeRect(activeLayer.x, activeLayer.y, activeLayer.width, activeLayer.height);
        }

        this.ctx.restore();
      }
    }
    this.ctx.restore();

    this.renderSelection();
  }

  /**
   * Renders a single layer to a given context.
   */
  private renderLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
    ctx.save();
    ctx.globalAlpha = (layer.opacity / 100) * ((layer.fill ?? 100) / 100);
    ctx.globalCompositeOperation = layer.blendMode;

    const tool = this.getActiveTool();
    const isEditing = tool?.getEditingLayerId() === layer.id;
    const editingState = isEditing ? (tool as any).getEditingState?.() : undefined;

    if (editingState) {
      editingState.isCtrlPressed = this.isCtrlPressed;
    }

    let renderLayerTarget = layer;

    if (isEditing && tool?.id === "transform") {
      const transform = useToolStore.getState().toolSettings.transform;
      ctx.translate(transform.x, transform.y);
      ctx.rotate((transform.rotation * Math.PI) / 180);

      if (layer.type === "smart_object") {
        // High-quality preview for Smart Objects: render at transformed size from original data
        const targetWidth = Math.round(transform.width * Math.abs(transform.scaleX));
        const targetHeight = Math.round(transform.height * Math.abs(transform.scaleY));

        // Flip context if scale is negative, but SmartObjectLayer will render at targetWidth/Height
        ctx.scale(transform.scaleX < 0 ? -1 : 1, transform.scaleY < 0 ? -1 : 1);

        renderLayerTarget = {
          ...layer,
          width: targetWidth,
          height: targetHeight,
          data: layer.dataOriginal || layer.data,
          x: -targetWidth * transform.anchor.x,
          y: -targetHeight * transform.anchor.y,
          rotation: 0,
        };
      } else {
        ctx.scale(transform.scaleX, transform.scaleY);
        renderLayerTarget = {
          ...layer,
          x: -transform.width * transform.anchor.x,
          y: -transform.height * transform.anchor.y,
          rotation: 0,
        };
      }
    } else if (layer.rotation) {
      const centerX = Math.round(layer.x + layer.width / 2);
      const centerY = Math.round(layer.y + layer.height / 2);
      ctx.translate(centerX, centerY);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    const drawingCanvas = isEditing ? tool?.getDrawingCanvas() : null;
    const hasStroke = layer.styles?.stroke?.enabled && layer.styles.stroke.size > 0;

    if (drawingCanvas) {
      ctx.drawImage(drawingCanvas.canvas, drawingCanvas.x, drawingCanvas.y);
    } else if (hasStroke && layer.type !== "text") {
      // Generic stroke implementation for non-text layers (Raster, Group, Smart Object)
      this.renderLayerWithStroke(ctx, renderLayerTarget, editingState);
    } else {
      this.renderLayerToContext(ctx, renderLayerTarget, editingState);
    }
    ctx.restore();
  }

  /**
   * Helper to render the core content of a layer to a specific context.
   */
  private renderLayerToContext(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    editingState?: any,
  ) {
    switch (layer.type) {
      case "raster":
        RasterLayer.render(
          ctx,
          layer,
          this.layerCanvasCache,
          this.layerReadyCache,
          this.imageCache,
          () => this.render(),
        );
        break;
      case "text":
        TextLayer.render(
          ctx,
          layer,
          this.layerCanvasCache,
          this.layerReadyCache,
          editingState,
        );
        break;
      case "group":
        GroupLayer.render(
          ctx,
          layer,
          this.project!.layers,
          (c, l) => this.renderLayer(c, l),
          this.project!.width,
          this.project!.height,
        );
        break;
      case "smart_object":
        SmartObjectLayer.render(
          ctx,
          layer,
          this.layerCanvasCache,
          this.layerReadyCache,
          this.imageCache,
          () => this.render(),
        );
        break;
    }
  }

  /**
   * Helper to render a layer with a stroke effect using a generic buffer approach.
   */
  private renderLayerWithStroke(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    editingState?: any,
  ) {
    const stroke = layer.styles!.stroke!;
    const size = stroke.size;

    // 1. Render layer content into an offscreen buffer
    const buffer = document.createElement("canvas");
    // Expand buffer to accommodate the stroke. Padding should be at least the size of the stroke.
    const padding = Math.ceil(size) + 2; // Extra 2px safety margin
    buffer.width = Math.ceil(layer.width + padding * 2);
    buffer.height = Math.ceil(layer.height + padding * 2);
    const bctx = buffer.getContext("2d")!;
    bctx.imageSmoothingEnabled = false;

    // Adjust layer coordinates for the buffer
    const bufferLayer = { ...layer, x: padding, y: padding };
    this.renderLayerToContext(bctx, bufferLayer, editingState);

    // 2. Apply Stroke effect
    const strokeBuffer = document.createElement("canvas");
    strokeBuffer.width = buffer.width;
    strokeBuffer.height = buffer.height;
    const sctx = strokeBuffer.getContext("2d")!;
    sctx.imageSmoothingEnabled = true; // Enable smoothing for the softening phase
    
    sctx.save();
    
    // Create the mask for the stroke
    if (stroke.position === "outside" || stroke.position === "center") {
      const dilation = stroke.position === "outside" ? size : size / 2;

      if (stroke.rounded) {
        // Circular dilation for rounded corners
        const radii = [dilation];
        if (dilation > 2) radii.push(dilation * 0.5);
        if (dilation > 6) radii.push(dilation * 0.75, dilation * 0.25);

        radii.forEach((r) => {
          const steps = Math.max(16, Math.min(128, Math.ceil(r * 6)));
          for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            sctx.drawImage(buffer, Math.cos(angle) * r, Math.sin(angle) * r);
          }
        });
      } else {
        // Square dilation for sharp corners
        // We use a separable approach for efficiency: horizontal then vertical
        const tempBuffer = document.createElement("canvas");
        tempBuffer.width = buffer.width;
        tempBuffer.height = buffer.height;
        const tctx = tempBuffer.getContext("2d")!;

        // 1. Horizontal dilation
        for (let x = -dilation; x <= dilation; x++) {
          tctx.drawImage(buffer, x, 0);
        }

        // 2. Vertical dilation (using the horizontally dilated buffer)
        for (let y = -dilation; y <= dilation; y++) {
          sctx.drawImage(tempBuffer, 0, y);
        }
      }
    } else if (stroke.position === "inside") {
      // Inside stroke: start with content, then subtract eroded version
      sctx.drawImage(buffer, 0, 0);
      sctx.globalCompositeOperation = "source-in";

      // Create erosion mask
      const erosionBuffer = document.createElement("canvas");
      erosionBuffer.width = buffer.width;
      erosionBuffer.height = buffer.height;
      const ectx = erosionBuffer.getContext("2d")!;

      const erosion = size;

      if (stroke.rounded) {
        const steps = Math.max(16, Math.min(128, Math.ceil(erosion * 6)));
        // To erode, we draw the content shifted in all directions and use 'destination-in'
        ectx.drawImage(buffer, 0, 0);
        ectx.globalCompositeOperation = "destination-in";
        for (let i = 0; i < steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          ectx.drawImage(buffer, Math.cos(angle) * erosion, Math.sin(angle) * erosion);
        }
      } else {
        // Square erosion
        const tempErosionBuffer = document.createElement("canvas");
        tempErosionBuffer.width = buffer.width;
        tempErosionBuffer.height = buffer.height;
        const tetctx = tempErosionBuffer.getContext("2d")!;

        // 1. Horizontal erosion
        tetctx.drawImage(buffer, 0, 0);
        tetctx.globalCompositeOperation = "destination-in";
        for (let x = -erosion; x <= erosion; x++) {
          tetctx.drawImage(buffer, x, 0);
        }

        // 2. Vertical erosion
        ectx.drawImage(tempErosionBuffer, 0, 0);
        ectx.globalCompositeOperation = "destination-in";
        for (let y = -erosion; y <= erosion; y++) {
          ectx.drawImage(tempErosionBuffer, 0, y);
        }
      }

      sctx.globalCompositeOperation = "destination-out";
      sctx.drawImage(erosionBuffer, 0, 0);
    }

    // Fill the stroke mask with color and opacity
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = stroke.color;
    sctx.globalAlpha = stroke.opacity / 100;
    
    // Softening phase for raster AA
    if (stroke.antiAlias && layer.type !== "text") {
       sctx.shadowColor = stroke.color;
       sctx.shadowBlur = 0.5;
    }

    sctx.fillRect(0, 0, strokeBuffer.width, strokeBuffer.height);

    if (!stroke.antiAlias) {
      applyAlphaThreshold(strokeBuffer);
    }
    sctx.restore();

    // 3. Composite final result back to the main context
    ctx.save();
    // Use Math.round for pixel-perfect alignment
    const destX = Math.round(layer.x - padding);
    const destY = Math.round(layer.y - padding);
    
    if (stroke.position === "inside") {
      ctx.drawImage(buffer, destX, destY);
      ctx.drawImage(strokeBuffer, destX, destY);
    } else {
      // Outside/Center: draw stroke first, then content on top (fixes halos)
      ctx.drawImage(strokeBuffer, destX, destY);
      ctx.drawImage(buffer, destX, destY);
    }
    ctx.restore();
  }

  /**
   * Renders a pixel grid when the zoom level is high enough.
   */
  private renderPixelGrid() {
    if (!this.project) return;
    this.ctx.save();
    this.ctx.setTransform(
      this.project.zoom,
      0,
      0,
      this.project.zoom,
      this.project.panX,
      this.project.panY,
    );
    this.ctx.lineWidth = 0.5 / this.project.zoom;
    this.ctx.strokeStyle = "rgba(128, 128, 128, 0.4)";
    this.ctx.beginPath();
    for (let x = 0; x <= this.project.width; x++) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.project.height);
    }
    for (let y = 0; y <= this.project.height; y++) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.project.width, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Invalidates the cache for a specific layer.
   */
  public invalidateLayerCache(layerId: string) {
    this.layerCanvasCache.delete(layerId);
    this.layerReadyCache.delete(layerId);
  }

  /**
   * Extracts the selection into a floating layer.
   */
  private async floatSelection(layerId: string): Promise<boolean> {
    if (!this.project || !this.project.selection.hasSelection || !this.project.selection.bounds)
      return false;

    if (this.project.selection.floatingLayer) return true;

    const layer = this.project.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== "raster" || !layer.data) return false;

    const { bounds } = this.project.selection;
    const layerCanvas = await this.ensureLayerCanvas(layer);

    // 1. Extract content
    const floatCanvas = document.createElement("canvas");
    floatCanvas.width = bounds.width;
    floatCanvas.height = bounds.height;
    const fctx = floatCanvas.getContext("2d")!;

    fctx.drawImage(layerCanvas, layer.x - bounds.x, layer.y - bounds.y);
    fctx.globalCompositeOperation = "destination-in";
    fctx.drawImage(this.selectionCanvas, 0, 0);

    // 2. Remove from original layer
    const newLayerCanvas = document.createElement("canvas");
    newLayerCanvas.width = layer.width;
    newLayerCanvas.height = layer.height;
    const nlctx = newLayerCanvas.getContext("2d")!;
    nlctx.drawImage(layerCanvas, 0, 0);
    nlctx.globalCompositeOperation = "destination-out";
    nlctx.drawImage(this.selectionCanvas, bounds.x - layer.x, bounds.y - layer.y);

    const floatingLayer: Layer = {
      id: "floating-selection",
      name: "Floating Selection",
      type: "raster",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      data: floatCanvas.toDataURL(), // We still need this for the store, but we'll use cache for rendering
      blendMode: "source-over",
    };

    // Cache the new canvases immediately
    this.layerCanvasCache.set(floatingLayer.id, floatCanvas);
    this.layerReadyCache.set(floatingLayer.id, true);
    this.layerCanvasCache.set(layer.id, newLayerCanvas);
    this.layerReadyCache.set(layer.id, true);

    // Update Store
    useProjectStore.getState().updateLayer(this.project.id, layer.id, {
      data: newLayerCanvas.toDataURL(),
    });

    useProjectStore.getState().updateProject(this.project.id, {
      selection: {
        ...this.project.selection,
        floatingLayer: floatingLayer,
      },
    });

    // Update local project reference immediately to avoid stale reads in the same frame
    this.project.selection.floatingLayer = floatingLayer;

    return true;
  }

  /**
   * Commits the floating selection back to its source layer.
   */
  private async commitFloatingLayer() {
    if (!this.project || !this.project.selection.floatingLayer || !this.project.activeLayerId)
      return;

    const activeLayer = this.project.layers.find((l) => l.id === this.project?.activeLayerId);
    if (!activeLayer || activeLayer.type !== "raster") return;

    const floatingLayer = this.project.selection.floatingLayer;
    const activeCanvas = await this.ensureLayerCanvas(activeLayer);
    const floatCanvas = await this.ensureLayerCanvas(floatingLayer);

    const minX = Math.min(activeLayer.x, floatingLayer.x);
    const minY = Math.min(activeLayer.y, floatingLayer.y);
    const maxX = Math.max(activeLayer.x + activeLayer.width, floatingLayer.x + floatingLayer.width);
    const maxY = Math.max(
      activeLayer.y + activeLayer.height,
      floatingLayer.y + floatingLayer.height,
    );

    const newW = Math.ceil(maxX - minX);
    const newH = Math.ceil(maxY - minY);

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = newW;
    finalCanvas.height = newH;
    const fctx = finalCanvas.getContext("2d")!;

    fctx.drawImage(
      activeCanvas,
      Math.round(activeLayer.x - minX),
      Math.round(activeLayer.y - minY),
    );
    fctx.drawImage(
      floatCanvas,
      Math.round(floatingLayer.x - minX),
      Math.round(floatingLayer.y - minY),
    );

    this.layerCanvasCache.set(activeLayer.id, finalCanvas);
    this.layerReadyCache.set(activeLayer.id, true);

    useProjectStore.getState().updateLayer(this.project.id, activeLayer.id, {
      x: minX,
      y: minY,
      width: newW,
      height: newH,
      data: finalCanvas.toDataURL(),
    });

    useProjectStore.getState().updateProject(this.project.id, {
      selection: {
        ...this.project.selection,
        floatingLayer: null,
      },
    });

    this.project.selection.floatingLayer = null;
  }

  /**
   * Selects all pixels in the project.
   */
  public selectAll() {
    if (!this.project) return;

    useProjectStore.getState().pushHistory(this.project.id, "Select All");

    const rect = {
      x: 0,
      y: 0,
      width: this.project.width,
      height: this.project.height,
    };

    this.selectionCanvas.width = rect.width;
    this.selectionCanvas.height = rect.height;
    this.selectionCtx.fillStyle = "white";
    this.selectionCtx.fillRect(0, 0, rect.width, rect.height);

    const mask = this.selectionCanvas.toDataURL();
    this.lastSelectionMask = mask;

    useProjectStore.getState().updateProject(this.project.id, {
      selection: {
        hasSelection: true,
        bounds: rect,
        mask,
      },
    });

    this.updateSelectionEdges();
  }

  /**
   * Duplicates the active layers or the selection within the active layer.
   */
  public async duplicateLayer() {
    if (!this.project || !this.project.activeLayerId) return;

    // If there is NO selection, duplicate all selected layers via Store
    if (!this.project.selection.hasSelection || !this.project.selection.bounds) {
      useProjectStore.getState().duplicateLayers(this.project.id, this.project.selectedLayerIds);
      return;
    }

    const activeLayer = this.project.layers.find((l) => l.id === this.project?.activeLayerId);
    if (!activeLayer) return;

    // If there IS a selection, perform "Layer via Copy" (Photoshop style)
    if (activeLayer.type !== "raster" || !activeLayer.data) {
      useUIStore
        .getState()
        .showToast("Selection duplication only works on raster layers", "warning");
      return;
    }

    const layerCanvas = this.layerCanvasCache.get(activeLayer.id);
    if (!layerCanvas) return;

    const { bounds } = this.project.selection;

    // 1. Extract pixels from the selection
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = bounds.width;
    tempCanvas.height = bounds.height;
    const tempCtx = tempCanvas.getContext("2d")!;

    const layerOffsetX = activeLayer.x - bounds.x;
    const layerOffsetY = activeLayer.y - bounds.y;

    tempCtx.drawImage(layerCanvas, layerOffsetX, layerOffsetY);
    tempCtx.globalCompositeOperation = "destination-in";
    tempCtx.drawImage(this.selectionCanvas, 0, 0);

    const optimizedBounds = getOptimizedBoundingBox(tempCanvas, {
      x: 0,
      y: 0,
      width: tempCanvas.width,
      height: tempCanvas.height,
    });

    if (!optimizedBounds) {
      useUIStore.getState().showToast("The selection is empty on this layer", "warning");
      return;
    }

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = optimizedBounds.width;
    finalCanvas.height = optimizedBounds.height;
    const finalCtx = finalCanvas.getContext("2d")!;
    finalCtx.drawImage(
      tempCanvas,
      optimizedBounds.x,
      optimizedBounds.y,
      optimizedBounds.width,
      optimizedBounds.height,
      0,
      0,
      optimizedBounds.width,
      optimizedBounds.height,
    );

    // 2. Create a new layer with the extracted pixels
    const finalX = bounds.x + optimizedBounds.x;
    const finalY = bounds.y + optimizedBounds.y;

    useProjectStore.getState().addLayer(this.project.id, {
      name: `${activeLayer.name} copy`,
      type: "raster",
      data: finalCanvas.toDataURL(),
      width: optimizedBounds.width,
      height: optimizedBounds.height,
      x: finalX,
      y: finalY,
    });
  }

  /**
   * Exports the project to a data URL with specific format and quality.
   */
  public async exportProject(
    format: string = "image/png",
    quality: number = 1,
    targetWidth?: number,
    targetHeight?: number,
  ): Promise<string> {
    if (!this.project) return "";

    await this.preloadImages();

    const finalWidth = targetWidth || this.project.width;
    const finalHeight = targetHeight || this.project.height;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = finalWidth;
    exportCanvas.height = finalHeight;
    const exportCtx = exportCanvas.getContext("2d")!;
    exportCtx.imageSmoothingEnabled = false;

    // Scale to target dimensions if provided
    if (targetWidth || targetHeight) {
      exportCtx.scale(finalWidth / this.project.width, finalHeight / this.project.height);
    }

    // Fill background with white for JPEG exports if they don't have a background layer
    // (JPEG doesn't support transparency)
    if (format === "image/jpeg") {
      exportCtx.fillStyle = "#FFFFFF";
      exportCtx.fillRect(0, 0, this.project.width, this.project.height);
    }

    for (const layer of this.project.layers) {
      if (layer.visible && !layer.parentId) {
        this.renderLayer(exportCtx, layer);
      }
    }

    if (format === "image/png" && quality < 1) {
      // 1. Pega os pixels originais e INTACTOS
      const imageData = exportCtx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);

      // 2. Calcula o número de cores usando uma curva exponencial.
      // - 1: 3 cores (muito agressivo, quase posterização)
      // - 0.5: ~50 cores (redução significativa, mas ainda reconhecível)
      // - 0.25: ~150 cores (redução leve, boa para fotos)
      const numColors = 3 + Math.floor(253 * Math.pow(quality, 1));

      // 3. Deixa o UPNG fazer a magia dele com os dados puros
      const encoded = UPNG.encode(
        [imageData.data.buffer],
        imageData.width,
        imageData.height,
        numColors,
      );

      const base64 = safeBase64FromBuffer(encoded);
      return `data:image/png;base64,${base64}`;
    }

    return exportCanvas.toDataURL(format, quality);
  }
}
