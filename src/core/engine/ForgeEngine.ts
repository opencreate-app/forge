/**
 * Purpose: Core engine class responsible for project rendering, viewport management (zoom/pan), tool orchestration, and selection handling.
 */
import { Layer, Project, useProjectStore, Guide } from "@/renderer/store/projectStore";
import { StrokeStyle, DropShadowStyle, InnerShadowStyle } from "@/renderer/store/layerStylesStore";
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
import { GradientTool } from "../tools/GradientTool";
import { ColorPickerTool } from "../tools/ColorPickerTool";
import { useToolStore } from "@/renderer/store/toolStore";
import { useUIStore } from "@/renderer/store/uiStore";
import UPNG from "upng-js";
import {
  getOptimizedBoundingBox,
  // quantizeImageData,
  safeBase64FromBuffer,
} from "../utils/imageUtils";
import { FORGE_CLIPBOARD_METADATA_KEY, ClipboardMetadata } from "@/renderer/utils/clipboardUtils";
import { getCombinedStyledBounds, getLayerGeometryBounds } from "@/renderer/utils/projectUtils";
import { RasterLayer } from "../layers/RasterLayer";
import { TextLayer } from "../layers/TextLayer";
import { GroupLayer, GroupRenderTransform } from "../layers/GroupLayer";
import { SmartObjectLayer } from "../layers/SmartObjectLayer";
import { ColorFillLayer } from "../layers/ColorFillLayer";
import { GradientFillLayer } from "../layers/GradientFillLayer";

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

interface MaskCanvasCacheEntry {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  alphaCanvas?: HTMLCanvasElement;
}

interface LayerRenderBufferCacheEntry {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
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
  private viewportWidth = 0;
  private viewportHeight = 0;
  private devicePixelRatio = 1;

  private isPanning = false;
  private startX = 0;
  private startY = 0;

  private layerCanvasCache: Map<string, HTMLCanvasElement> = new Map();
  private layerReadyCache: Map<string, boolean> = new Map();
  private maskCanvasCache: Map<string, MaskCanvasCacheEntry> = new Map();
  private layerRenderBufferCache: Map<string, LayerRenderBufferCacheEntry> = new Map();
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
  private sceneCanvas: HTMLCanvasElement;
  private sceneCtx: CanvasRenderingContext2D;
  private sceneSnapshotReady = false;

  private currentToolId: string | null = null;
  private onViewportChange?: (zoom: number, x: number, y: number) => void;
  private temporaryColorPickerActive = false;
  private lastPointerPosition: { x: number; y: number } | null = null;

  private draggingGuide: {
    id?: string;
    type: "horizontal" | "vertical";
    position: number;
    isNew: boolean;
  } | null = null;
  private snappedLayerGuide: {
    type: "horizontal" | "vertical";
    position: number;
  } | null = null;
  private hoveredGuide: { id: string; type: "horizontal" | "vertical" } | null = null;

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

    this.sceneCanvas = document.createElement("canvas");
    this.sceneCtx = this.sceneCanvas.getContext("2d", { willReadFrequently: true })!;
    this.resizeViewport(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);

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
      gradient: new GradientTool(),
      transform: new TransformTool(),
      crop: new CropTool(),
      text: new TextTool(),
      colorPicker: new ColorPickerTool(),
    };

    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFontsLoaded = this.handleFontsLoaded.bind(this);

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

  private handleEditTextLayer = (event: Event) => {
    const detail = (event as CustomEvent<{ projectId?: string; layerId?: string }>).detail;
    if (!detail?.layerId || (detail.projectId && detail.projectId !== this.project?.id)) return;

    const context = this.getToolContext();
    const textTool = this.tools.text as TextTool;
    if (!context || !this.project) return;

    if (this.currentToolId === "text") {
      textTool.beginEditingLayer(detail.layerId, context);
    } else {
      textTool.requestEditLayer(detail.layerId);
      useToolStore.getState().setActiveTool("text");
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

  private handleFontsLoaded() {
    this.invalidateAllTextLayers();
  }

  /**
   * Invalidates the cache for all text layers in the current project.
   * Useful when fonts finish loading in the background.
   */
  public invalidateAllTextLayers() {
    if (!this.project) return;
    let hasText = false;
    for (const layer of this.project.layers) {
      if (layer.type === "text") {
        this.invalidateLayerCache(layer.id);
        hasText = true;
      }
    }
    if (hasText && !this.options.headless) {
      this.render();
    }
  }

  /**
   * Handles zoom requests from external events.
   * @param e Custom event containing zoom details.
   */
  private handleZoomTo = (e: any) => {
    const { zoom, panX, panY, step, immediate } = e.detail;
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
      } else if (immediate) {
        this.setZoom(zoom);
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
    const viewportWidth = this.viewportWidth;
    const viewportHeight = this.viewportHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    const targetPanX = centerX - (centerX - basePanX) * (targetZoom / baseZoom);
    const targetPanY = centerY - (centerY - basePanY) * (targetZoom / baseZoom);

    this.animateToViewport(targetZoom, targetPanX, targetPanY);
  }

  /**
   * Updates the viewport zoom immediately, preserving the project point at the viewport center.
   * @param targetZoom The target zoom level.
   */
  public setZoom(targetZoom: number) {
    if (!this.project) return;

    this.stopViewportAnimation();
    this.targetViewport = null;

    const baseZoom = this.project.zoom;
    const centerX = this.viewportWidth / 2;
    const centerY = this.viewportHeight / 2;
    const targetPanX = centerX - (centerX - this.project.panX) * (targetZoom / baseZoom);
    const targetPanY = centerY - (centerY - this.project.panY) * (targetZoom / baseZoom);

    this.project.zoom = targetZoom;
    this.project.panX = targetPanX;
    this.project.panY = targetPanY;
    this.onViewportChange?.(targetZoom, targetPanX, targetPanY);
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
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("forge:select-clear", this.handleClearSelection);
    window.addEventListener("forge:edit-text-layer", this.handleEditTextLayer);
    window.addEventListener("forge:select-all", this.handleSelectAll);
    window.addEventListener("forge:duplicate-layer", this.handleDuplicate);
    window.addEventListener("forge:export-project", this.handleExport as any);
    window.addEventListener("forge:save-image", this.handleSaveImage as any);
    window.addEventListener("forge:request-export-preview", this.handleRequestExportPreview as any);
    window.addEventListener("forge:request-thumbnail", this.handleRequestThumbnail as any);
    window.addEventListener("forge:zoom-to", this.handleZoomTo as any);
    window.addEventListener("forge:export-to-clipboard", this.handleExportToClipboard as any);
    window.addEventListener("forge:guide-drag-new", this.handleGuideDragNew as any);

    if ((document as any).fonts) {
      (document as any).fonts.addEventListener("loadingdone", this.handleFontsLoaded);
    }
  }

  /**
   * Handles starting a new guide drag initiated from a ruler.
   */
  private handleGuideDragNew = (e: CustomEvent) => {
    if (!this.project) return;
    const { type, originalEvent } = e.detail;

    const rect = this.canvas.getBoundingClientRect();
    const projPos = this.screenToProject(
      originalEvent.clientX - rect.left,
      originalEvent.clientY - rect.top,
    );
    const position = type === "horizontal" ? projPos.y : projPos.x;

    this.draggingGuide = {
      type,
      position: Math.round(position),
      isNew: true,
    };
  };

  /**
   * Preloads all images and fonts for the project layers.
   * This is essential for headless mode to ensure everything is ready before rendering.
   */
  public async preloadImages(): Promise<void> {
    if (!this.project) return;

    // 1. Wait for fonts to be ready
    try {
      // Find all unique font/weight combinations used in text layers (including inside textSpans)
      const uniqueFonts = new Map<string, Set<string | number>>();
      const textLayerIds: string[] = [];

      for (const layer of this.project.layers) {
        if (layer.type === "text") {
          textLayerIds.push(layer.id);
          const family = layer.fontFamily || "Arial";
          const weight = layer.fontWeight || "400";

          if (!uniqueFonts.has(family)) uniqueFonts.set(family, new Set());
          uniqueFonts.get(family)!.add(weight);

          if (layer.textSpans) {
            for (const span of layer.textSpans) {
              const spanFamily = span.fontFamily || family;
              const spanWeight = span.fontWeight || weight;
              if (!uniqueFonts.has(spanFamily)) uniqueFonts.set(spanFamily, new Set());
              uniqueFonts.get(spanFamily)!.add(spanWeight);
            }
          }
        }
      }

      // Import useFontStore dynamically to avoid circular dependency or import issues in headless canvas contexts
      const { useFontStore } = await import("@/renderer/store/fontStore");
      const fontStore = useFontStore.getState();

      // Ensure all google fonts are initialized in the store
      await fontStore.loadGoogleFonts();

      // Load each unique font face (family + weight)
      const fontPromises: Promise<any>[] = [];
      for (const [family, weights] of uniqueFonts.entries()) {
        for (const weight of weights) {
          fontPromises.push(fontStore.ensureFontLoaded(family, weight));
        }
      }
      await Promise.all(fontPromises);

      if ((document as any).fonts) {
        // Wait for all loaded fonts to be fully loaded/ready in document.fonts
        const loadWaitPromises: Promise<any>[] = [];
        for (const [family, weights] of uniqueFonts.entries()) {
          for (const weight of weights) {
            try {
              loadWaitPromises.push((document as any).fonts.load(`${weight} 1em "${family}"`));
            } catch (e) {
              console.warn(`Failed waiting for font ready: ${family} (${weight})`, e);
            }
          }
        }
        await Promise.allSettled(loadWaitPromises);
        await (document as any).fonts.ready;
      }

      // Give a tiny safety window (e.g., 50ms) for the browser to register the font face in the drawing context
      await new Promise((resolve) => setTimeout(resolve, 50));

      // CRITICAL: Invalidate all text layer caches now that fonts are definitively loaded and registered.
      // This is done AFTER the safety window to ensure the render loop doesn't re-cache a fallback font
      // during the registration period.
      for (const id of textLayerIds) {
        this.invalidateLayerCache(id);
      }
    } catch (e) {
      console.warn("Font preloading failed", e);
    }

    // 2. Wait for all raster, smart object images, and masks to be loaded and decoded
    const promises = this.project.layers.map(async (layer) => {
      const sourceData = (
        layer.type === "smart_object" ? layer.dataOriginal || layer.data : layer.data
      ) as string | undefined;

      const maskData = layer.mask?.data;

      const tasks: Promise<void>[] = [];

      if ((layer.type === "raster" || layer.type === "smart_object") && sourceData) {
        tasks.push(this.preloadImage(sourceData));
      }

      if (maskData) {
        tasks.push(this.preloadImage(maskData));
      }

      await Promise.all(tasks);
    });

    await Promise.all(promises);
  }

  /**
   * Internal helper to load and decode an image for caching.
   * @param src The image source (DataURL or URL).
   */
  private preloadImage(src: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let img = this.imageCache.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        this.imageCache.set(src, img);
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
    const { filePath, projectId } = e.detail || {};

    if (this.project && filePath) {
      const saveProjectId = projectId || this.project.id;

      try {
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

        if (!(window as any).electronAPI) {
          window.dispatchEvent(
            new CustomEvent("forge:save-project-finished", {
              detail: { projectId: saveProjectId, success: false },
            }),
          );
          return;
        }

        const result = await (window as any).electronAPI.saveImage({
          dataURL,
          filePath,
        });

        if (result.success) {
          useProjectStore.getState().updateProject(saveProjectId, { isDirty: false });
          useUIStore.getState().showToast("Image saved successfully", "info");
        } else {
          useUIStore.getState().showToast(`Failed to save image: ${result.error}`, "error");
        }

        window.dispatchEvent(
          new CustomEvent("forge:save-project-finished", {
            detail: { projectId: saveProjectId, success: result.success },
          }),
        );
      } catch (error) {
        console.error("Image save error:", error);
        useUIStore.getState().showToast("Failed to save image", "error");
        window.dispatchEvent(
          new CustomEvent("forge:save-project-finished", {
            detail: { projectId: saveProjectId, success: false },
          }),
        );
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
    const isPixelArt = this.project.width < 32 && this.project.height < 32;
    let thumbnailSource: HTMLCanvasElement = this.projectBuffer;
    let thumbnailFormat = "image/jpeg";

    if (isPixelArt) {
      const pixelScale = 10;
      const pixelCanvas = document.createElement("canvas");
      pixelCanvas.width = this.project.width * pixelScale;
      pixelCanvas.height = this.project.height * pixelScale;
      const pixelCtx = pixelCanvas.getContext("2d")!;
      pixelCtx.imageSmoothingEnabled = false;
      pixelCtx.drawImage(
        this.projectBuffer,
        0,
        0,
        this.project.width,
        this.project.height,
        0,
        0,
        pixelCanvas.width,
        pixelCanvas.height,
      );
      thumbnailSource = pixelCanvas;
      thumbnailFormat = "image/png";
    }

    thumbCtx.imageSmoothingEnabled = !isPixelArt;

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

    thumbCtx.drawImage(thumbnailSource, drawX, drawY, drawW, drawH);

    return thumbCanvas.toDataURL(thumbnailFormat, isPixelArt ? undefined : 0.9);
  }

  /**
   * Handles keyboard release events to track modifier keys.
   */
  private handleKeyUp = (e: KeyboardEvent) => {
    this.isCtrlPressed = e.ctrlKey || e.metaKey;

    if (e.key === "Alt" && this.temporaryColorPickerActive) {
      const context = this.getToolContext();
      if (context) this.getColorPickerTool().commitTemporaryPreview(context);
      this.temporaryColorPickerActive = false;
    }
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
   * Deletes the current selection from the active layer without deleting the layer itself.
   * Raster layers are cleared destructively; procedural layers receive a non-destructive mask.
   */
  public async deleteSelectionContents(): Promise<boolean> {
    if (!this.project || !this.project.selection.hasSelection || !this.project.selection.bounds) {
      return false;
    }

    const { activeLayerId, selection } = this.project;
    const bounds = selection.bounds;
    if (!bounds) return false;
    if (!activeLayerId) return false;

    const layer = this.project.layers.find((candidate) => candidate.id === activeLayerId);
    if (!layer) return false;

    if (layer.locked || this.isAncestorLocked(layer)) {
      useUIStore.getState().showToast("Unlock the layer to delete the selection.", "warning");
      return false;
    }

    useProjectStore.getState().pushHistory(this.project.id, "Delete Selection");

    if (this.project.activeMaskId === layer.id && layer.mask) {
      const mask = await this.createSelectionDeletionMask(layer.mask);
      useProjectStore.getState().updateLayer(this.project.id, layer.id, { mask });
      return true;
    }

    if (layer.type === "raster" && layer.data) {
      const layerCanvas = await this.ensureLayerCanvas(layer);
      const layerCtx = layerCanvas.getContext("2d")!;
      layerCtx.save();
      layerCtx.globalCompositeOperation = "destination-out";
      layerCtx.drawImage(this.selectionCanvas, bounds.x - layer.x, bounds.y - layer.y);
      layerCtx.restore();

      const data = layerCanvas.toDataURL("image/png");
      this.layerCanvasCache.set(layer.id, layerCanvas);
      this.layerReadyCache.set(layer.id, true);
      useProjectStore.getState().updateLayer(this.project.id, layer.id, { data });
      return true;
    }

    const mask = await this.createSelectionDeletionMask(layer.mask);
    useProjectStore.getState().updateLayer(this.project.id, layer.id, { mask });
    return true;
  }

  private async createSelectionDeletionMask(
    existingMask?: Layer["mask"],
  ): Promise<NonNullable<Layer["mask"]>> {
    if (!this.project || !this.project.selection.bounds) {
      throw new Error("Cannot create a deletion mask without an active project selection.");
    }

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = this.project.width;
    maskCanvas.height = this.project.height;
    const maskCtx = maskCanvas.getContext("2d")!;
    maskCtx.fillStyle = "white";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    if (existingMask?.data) {
      const existingImage = await this.loadImage(existingMask.data);
      // Clear the existing mask bounds first so transparent pixels in the mask
      // remain transparent instead of revealing the white fallback underneath.
      maskCtx.globalCompositeOperation = "destination-out";
      maskCtx.fillRect(existingMask.x, existingMask.y, existingMask.width, existingMask.height);
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.drawImage(
        existingImage,
        existingMask.x,
        existingMask.y,
        existingMask.width,
        existingMask.height,
      );
    }

    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.drawImage(
      this.selectionCanvas,
      this.project.selection.bounds.x,
      this.project.selection.bounds.y,
    );

    return {
      data: maskCanvas.toDataURL("image/png"),
      x: 0,
      y: 0,
      width: this.project.width,
      height: this.project.height,
      enabled: true,
      linked: existingMask?.linked ?? true,
    };
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

    if (e.key === "Alt") {
      const context = this.getToolContext();
      if (context) this.beginTemporaryColorPicker(context);
      return;
    }

    const tool = this.getInteractionTool();
    const context = this.getToolContext();
    if (tool && context) {
      if (this.temporaryColorPickerActive && e.key === "Escape") {
        this.getColorPickerTool().cancelTemporaryPreview(context);
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }

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

      const metadata: ClipboardMetadata = {
        source: "forge-editor",
        projectId: this.project.id,
        x: finalX,
        y: finalY,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        // blobSize: blob.size,
        timestamp: Date.now(),
      };

      localStorage.setItem(FORGE_CLIPBOARD_METADATA_KEY, JSON.stringify(metadata));

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
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

        const imageBlob = await item.getType(imageType);

        // Try to retrieve and verify metadata from localStorage
        const storedMetadata = localStorage.getItem(FORGE_CLIPBOARD_METADATA_KEY);
        if (storedMetadata) {
          try {
            const metadata = JSON.parse(storedMetadata) as ClipboardMetadata;
            // Verify source and project (dimensions will be verified in img.onload)
            if (metadata.source === "forge-editor" && metadata.projectId === this.project.id) {
              pasteX = metadata.x;
              pasteY = metadata.y;
            }
          } catch (_) {
            // Invalid metadata
          }
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const img = new Image();
          img.onload = () => {
            // Final verification with dimensions and relaxed blob size
            const metadata = storedMetadata
              ? (JSON.parse(storedMetadata) as ClipboardMetadata)
              : null;
            const isVerified =
              metadata &&
              pasteX !== null &&
              pasteY !== null &&
              metadata.width === img.naturalWidth &&
              metadata.height === img.naturalHeight; // &&
            // Relaxed blob size: allow up to 2KB difference for re-encoding/metadata
            // Math.abs(metadata.blobSize - imageBlob.size) < 2048;

            if (!isVerified) {
              // Reset coordinates if verification fails
              pasteX = null;
              pasteY = null;
            }

            if (pasteX === null || pasteY === null) {
              // Center in viewport
              const viewportWidth = this.viewportWidth;
              const viewportHeight = this.viewportHeight;
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

    if (this.draggingGuide && this.project) {
      const rect = this.canvas.getBoundingClientRect();
      // We consider it "deleted" if dragged back to the ruler area (outside the canvas in its orientation)
      const isOutside =
        this.draggingGuide.type === "horizontal"
          ? e.clientY < rect.top || e.clientY > rect.bottom
          : e.clientX < rect.left || e.clientX > rect.right;

      if (isOutside) {
        if (!this.draggingGuide.isNew && this.draggingGuide.id) {
          useProjectStore.getState().removeGuide(this.project.id, this.draggingGuide.id);
        }
      } else {
        if (this.draggingGuide.isNew) {
          useProjectStore.getState().addGuide(this.project.id, {
            id: Math.random().toString(36).substr(2, 9),
            type: this.draggingGuide.type,
            position: this.draggingGuide.position,
          });
        } else if (this.draggingGuide.id) {
          useProjectStore.getState().updateGuide(this.project.id, this.draggingGuide.id, {
            position: this.draggingGuide.position,
          });
        }
      }

      this.draggingGuide = null;
      this.snappedLayerGuide = null;
      return;
    }

    const tool = this.getInteractionTool();
    const context = this.getToolContext();
    if (tool && context) {
      if (this.temporaryColorPickerActive) {
        this.getColorPickerTool().finishTemporarySampling(context);
      } else {
        tool.onMouseUp(e, context);
      }
    }
  }

  /**
   * Retrieves the currently active tool instance.
   */
  private getActiveTool(): BaseTool | null {
    const activeToolId = useToolStore.getState().activeToolId;
    return this.tools[activeToolId] || null;
  }

  /** Returns the tool that should receive pointer events and render previews. */
  private getInteractionTool(): BaseTool | null {
    return this.temporaryColorPickerActive ? this.getColorPickerTool() : this.getActiveTool();
  }

  private getColorPickerTool(): ColorPickerTool {
    return this.tools.colorPicker as ColorPickerTool;
  }

  private beginTemporaryColorPicker(context: ToolContext): void {
    if (this.temporaryColorPickerActive) return;

    const activeTool = this.getActiveTool();
    if (!activeTool || !this.canUseTemporaryColorPicker(activeTool)) return;
    if (activeTool.getEditingLayerId()) return;

    this.temporaryColorPickerActive = true;
    const colorPicker = this.getColorPickerTool();
    colorPicker.beginTemporaryPreview(context);
    if (this.lastPointerPosition) {
      colorPicker.setPointerPosition(
        this.lastPointerPosition.x,
        this.lastPointerPosition.y,
        context,
      );
    }
  }

  private canUseTemporaryColorPicker(tool: BaseTool): boolean {
    return tool.id === "brush" || tool.id === "pencil" || tool.id === "paintBucket";
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
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      devicePixelRatio: this.devicePixelRatio,
      setViewportTransform: (zoom: number, panX: number, panY: number) =>
        this.setViewportTransform(zoom, panX, panY),
      updateViewport: (zoom: number, panX: number, panY: number) => {
        if (!this.project) return;
        this.project.zoom = zoom;
        this.project.panX = panX;
        this.project.panY = panY;
        this.onViewportChange?.(zoom, panX, panY);
      },
      updateProject: (updates: Partial<Project>) => {
        if (this.project) {
          const projectId = this.project.id;
          useProjectStore.getState().updateProject(projectId, updates);
          const updatedProject = useProjectStore
            .getState()
            .projects.find((project) => project.id === projectId);
          if (updatedProject) this.applyProjectUpdate(updatedProject);
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
      sampleColorAtScreen: (x: number, y: number) => {
        const rect = this.canvas.getBoundingClientRect();
        return this.sampleColorAtScreen(rect.left + x, rect.top + y);
      },
      setForegroundColor: (color: string) => useToolStore.getState().setForegroundColor(color),
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
      deleteSelectionContents: () => this.deleteSelectionContents(),
      setInteracting: (isInteracting: boolean) =>
        useToolStore.getState().setInteracting(isInteracting),
      setActiveTool: (id: any) => useToolStore.getState().setActiveTool(id),
      updateToolSettings: (id: any, settings: any) =>
        useToolStore.getState().updateToolSettings(id, settings),
      subscribe: (listener: any) => useToolStore.subscribe((state) => listener(state.toolSettings)),
      setLayerCache: (layerId: string, canvas: HTMLCanvasElement, dataUrl?: string) => {
        if (dataUrl !== undefined) {
          (canvas as HTMLCanvasElement & { _dataUrl?: string })._dataUrl = dataUrl;
        }
        this.layerCanvasCache.set(layerId, canvas);
        this.layerReadyCache.set(layerId, true);
      },
      setMaskCache: (layerId: string, canvas: HTMLCanvasElement, dataUrl: string) => {
        this.maskCanvasCache.set(layerId, { canvas, dataUrl });
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
   * Samples the most recently rendered scene at viewport coordinates.
   *
   * The scene snapshot is captured before tool overlays are rendered, preventing tools such as
   * the ColorPicker from sampling their own visual feedback.
   * @param clientX The pointer X coordinate in window space.
   * @param clientY The pointer Y coordinate in window space.
   */
  public sampleColorAtScreen(
    clientX: number,
    clientY: number,
  ): { r: number; g: number; b: number; a: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = Math.floor(((clientX - rect.left) / rect.width) * this.canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.canvas.height);

    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return null;

    const sampleContext = this.sceneSnapshotReady ? this.sceneCtx : this.ctx;
    const pixel = sampleContext.getImageData(x, y, 1, 1).data;
    return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
  }

  /**
   * Resizes the main viewport canvas for CSS pixels and device pixels separately.
   * @param width The logical viewport width in CSS pixels.
   * @param height The logical viewport height in CSS pixels.
   * @param dpr The device pixel ratio, defaulting to the current browser value.
   */
  public resizeViewport(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.viewportWidth = Math.max(0, Math.round(width));
    this.viewportHeight = Math.max(0, Math.round(height));
    this.devicePixelRatio = Math.max(1, dpr);

    const pixelWidth = Math.round(this.viewportWidth * this.devicePixelRatio);
    const pixelHeight = Math.round(this.viewportHeight * this.devicePixelRatio);

    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    if (this.sceneCanvas.width !== pixelWidth) this.sceneCanvas.width = pixelWidth;
    if (this.sceneCanvas.height !== pixelHeight) this.sceneCanvas.height = pixelHeight;

    this.sceneSnapshotReady = false;

    this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
  }

  /** Applies a project-space transform to the HiDPI viewport canvas. */
  private setViewportTransform(zoom: number, panX: number, panY: number) {
    this.ctx.setTransform(
      this.devicePixelRatio * zoom,
      0,
      0,
      this.devicePixelRatio * zoom,
      this.devicePixelRatio * panX,
      this.devicePixelRatio * panY,
    );
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

    if (e.button === 0) {
      this.lastPointerPosition = { x: e.offsetX, y: e.offsetY };
      if (e.altKey) {
        const context = this.getToolContext();
        if (context) this.beginTemporaryColorPicker(context);
      }
    }

    if (e.button === 1) {
      this.isPanning = true;
      this.startX = e.clientX - this.project.panX;
      this.startY = e.clientY - this.project.panY;
      this.canvas.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }

    if (this.hoveredGuide && e.button === 0) {
      const guide = this.project.guides.find((g) => g.id === this.hoveredGuide!.id);
      if (guide) {
        this.draggingGuide = {
          ...guide,
          isNew: false,
        };
        return;
      }
    }

    if (this.temporaryColorPickerActive && e.button === 2) {
      const context = this.getToolContext();
      if (context) this.getColorPickerTool().cancelTemporaryPreview(context);
      e.preventDefault();
      return;
    }

    const tool = this.getInteractionTool();
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
    const context = this.getToolContext();
    const tool = this.getActiveTool();
    if (!context || !tool) return;

    if (tool.id === "move") {
      const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
      const textTool = this.tools.text as TextTool;
      const hitLayer = textTool.getTextLayerAtPoint(x, y, context);
      if (hitLayer) {
        textTool.requestEditLayer(hitLayer.id, x, y, true);
        useToolStore.getState().setActiveTool("text");
        return;
      }
    }

    tool.onDoubleClick(e, context);
  }

  private handleContextMenu(e: MouseEvent) {
    if (!this.project) return;
    if (this.temporaryColorPickerActive) {
      const context = this.getToolContext();
      if (context) this.getColorPickerTool().cancelTemporaryPreview(context);
      e.preventDefault();
      return;
    }

    const tool = this.getInteractionTool();
    const context = this.getToolContext();
    if (tool && context && tool.onContextMenu(e, context)) {
      e.preventDefault();
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
    this.lastPointerPosition = { x: offsetX, y: offsetY };

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

    if (this.draggingGuide) {
      const projPos = this.screenToProject(offsetX, offsetY);
      let position = this.draggingGuide.type === "horizontal" ? projPos.y : projPos.x;

      // --- SNAP GUIDE TO LAYERS ---
      const snapMargin = 4 / this.project.zoom;
      let snapped = false;
      this.snappedLayerGuide = null;

      for (const layer of this.project.layers) {
        if (!this.isAncestorVisible(layer)) continue;

        if (this.draggingGuide.type === "vertical") {
          const points = [layer.x, layer.x + layer.width, layer.x + layer.width / 2];
          for (const pt of points) {
            if (Math.abs(position - pt) < snapMargin) {
              position = pt;
              snapped = true;
              this.snappedLayerGuide = { type: "vertical", position: pt };
              break;
            }
          }
        } else {
          const points = [layer.y, layer.y + layer.height, layer.y + layer.height / 2];
          for (const pt of points) {
            if (Math.abs(position - pt) < snapMargin) {
              position = pt;
              snapped = true;
              this.snappedLayerGuide = { type: "horizontal", position: pt };
              break;
            }
          }
        }
        if (snapped) break;
      }

      if (!snapped) {
        position = Math.round(position);
      }
      // --- END SNAP GUIDE TO LAYERS ---

      this.draggingGuide.position = position;
      this.canvas.style.cursor =
        this.draggingGuide.type === "horizontal" ? "ns-resize" : "ew-resize";
      return;
    }

    // Guide Hover Detection
    const showGuides = useUIStore.getState().showGuides;
    const projPos = this.screenToProject(offsetX, offsetY);
    const threshold = 5 / this.project.zoom; // 5 screen pixels tolerance
    let foundHover: { id: string; type: "horizontal" | "vertical" } | null = null;

    // Only check for hover if we're not dragging a guide and guides are enabled
    // And only if MoveTool is active to prevent interference with other tools that require precise mouse movement
    if (showGuides && this.project.guides.length > 0 && this.getActiveTool()?.id === "move") {
      for (const guide of this.project.guides) {
        if (guide.type === "horizontal") {
          if (Math.abs(projPos.y - guide.position) < threshold) {
            foundHover = { id: guide.id, type: "horizontal" };
            break;
          }
        } else {
          if (Math.abs(projPos.x - guide.position) < threshold) {
            foundHover = { id: guide.id, type: "vertical" };
            break;
          }
        }
      }
    }

    this.hoveredGuide = foundHover;
    if (this.hoveredGuide) {
      this.canvas.style.cursor = foundHover?.type === "horizontal" ? "ns-resize" : "ew-resize";
    } else {
      // Default tool cursor will be handled later if not hovered
      this.canvas.style.cursor = "default";
    }

    if (e.altKey && !this.temporaryColorPickerActive) {
      const context = this.getToolContext();
      if (context) this.beginTemporaryColorPicker(context);
    }

    const tool = this.getInteractionTool();
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
    if ((document as any).fonts) {
      (document as any).fonts.removeEventListener("loadingdone", this.handleFontsLoaded);
    }
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("forge:select-clear", this.handleClearSelection);
    window.removeEventListener("forge:edit-text-layer", this.handleEditTextLayer);
    window.removeEventListener("forge:select-all", this.handleSelectAll);
    window.removeEventListener("forge:duplicate-layer", this.handleDuplicate);
    window.removeEventListener("forge:export-project", this.handleExport as any);
    window.removeEventListener("forge:save-image", this.handleSaveImage as any);
    window.removeEventListener(
      "forge:request-export-preview",
      this.handleRequestExportPreview as any,
    );
    window.removeEventListener("forge:zoom-to", this.handleZoomTo as any);
    window.removeEventListener("forge:export-to-clipboard", this.handleExportToClipboard as any);
    window.removeEventListener("forge:guide-drag-new", this.handleGuideDragNew as any);

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
      this.maskCanvasCache.clear();
      this.layerRenderBufferCache.clear();
      this.imageCache.clear();
      this.draggingGuide = null;
      this.snappedLayerGuide = null;
      this.hoveredGuide = null;
    } else if (prevLayers !== project.layers) {
      // Invalidate specific layer caches only if data/size changed
      for (const layer of project.layers) {
        const prevLayer = prevLayers?.find((l) => l.id === layer.id);
        if (
          !prevLayer ||
          prevLayer.data !== layer.data ||
          prevLayer.width !== layer.width ||
          prevLayer.height !== layer.height ||
          prevLayer.mask?.data !== layer.mask?.data ||
          prevLayer.mask?.x !== layer.mask?.x ||
          prevLayer.mask?.y !== layer.mask?.y ||
          prevLayer.mask?.width !== layer.mask?.width ||
          prevLayer.mask?.height !== layer.mask?.height
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
   * Applies a store update to the engine before React delivers the next render.
   * Painting tools populate their caches before calling updateProject, so those
   * caches can be retained when their metadata matches the new layer state.
   */
  private applyProjectUpdate(project: Project) {
    const previousProject = this.project;
    if (!previousProject || previousProject.id !== project.id) {
      this.project = project;
      return;
    }

    for (const layer of project.layers) {
      const previousLayer = previousProject.layers.find((candidate) => candidate.id === layer.id);
      const layerChanged =
        !previousLayer ||
        previousLayer.data !== layer.data ||
        previousLayer.width !== layer.width ||
        previousLayer.height !== layer.height;

      if (layerChanged) {
        const cachedCanvas = this.layerCanvasCache.get(layer.id);
        const cachedDataUrl = (
          cachedCanvas as (HTMLCanvasElement & { _dataUrl?: string }) | undefined
        )?._dataUrl;
        const hasMatchingLayerCache =
          !!cachedCanvas &&
          cachedCanvas.width === layer.width &&
          cachedCanvas.height === layer.height &&
          cachedDataUrl === layer.data;

        if (!hasMatchingLayerCache) this.invalidateLayerCache(layer.id);
      }

      const maskChanged =
        previousLayer?.mask?.data !== layer.mask?.data ||
        previousLayer?.mask?.x !== layer.mask?.x ||
        previousLayer?.mask?.y !== layer.mask?.y ||
        previousLayer?.mask?.width !== layer.mask?.width ||
        previousLayer?.mask?.height !== layer.mask?.height;
      if (maskChanged) {
        const cachedMask = this.maskCanvasCache.get(layer.id);
        if (!cachedMask || cachedMask.dataUrl !== layer.mask?.data) {
          this.maskCanvasCache.delete(layer.id);
        } else if (
          previousLayer?.mask?.width !== layer.mask?.width ||
          previousLayer?.mask?.height !== layer.mask?.height
        ) {
          cachedMask.alphaCanvas = undefined;
        }
      }
    }

    this.project = project;
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
    this.setViewportTransform(this.project.zoom, this.project.panX, this.project.panY);

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
   * Renders the project's guides and any currently being dragged.
   */
  private renderGuides() {
    if (!this.project) return;

    const showGuides = useUIStore.getState().showGuides;
    if (!showGuides && !this.draggingGuide) return;

    this.ctx.save();
    this.setViewportTransform(this.project.zoom, this.project.panX, this.project.panY);

    this.ctx.lineWidth = 1 / this.project.zoom;
    this.ctx.strokeStyle = "#00ffff"; // Cyan guides

    const guides: Guide[] = [];

    if (showGuides) {
      guides.push(...(this.project.guides || []));
    }

    if (this.draggingGuide) {
      if (!this.draggingGuide.isNew) {
        const index = guides.findIndex((g) => g.id === this.draggingGuide!.id);
        if (index !== -1) {
          guides[index] = { ...guides[index], position: this.draggingGuide.position };
        } else {
          // If hidden but dragging existing, add it back to render
          guides.push({
            id: this.draggingGuide.id!,
            type: this.draggingGuide.type,
            position: this.draggingGuide.position,
          });
        }
      } else {
        guides.push({
          id: "ghost",
          type: this.draggingGuide.type,
          position: this.draggingGuide.position,
        });
      }
    }

    // Viewport bounds in project space
    const viewportWidth = this.viewportWidth / this.project.zoom;
    const viewportHeight = this.viewportHeight / this.project.zoom;
    const startX = -this.project.panX / this.project.zoom;
    const startY = -this.project.panY / this.project.zoom;

    for (const guide of guides) {
      this.ctx.beginPath();
      if (guide.type === "horizontal") {
        this.ctx.moveTo(startX, guide.position);
        this.ctx.lineTo(startX + viewportWidth, guide.position);
      } else {
        this.ctx.moveTo(guide.position, startY);
        this.ctx.lineTo(guide.position, startY + viewportHeight);
      }
      this.ctx.stroke();
    }

    // Render red snap line if guide is snapped to a layer
    if (this.snappedLayerGuide) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = "red";
      if (this.snappedLayerGuide.type === "horizontal") {
        this.ctx.moveTo(startX, this.snappedLayerGuide.position);
        this.ctx.lineTo(startX + viewportWidth, this.snappedLayerGuide.position);
      } else {
        this.ctx.moveTo(this.snappedLayerGuide.position, startY);
        this.ctx.lineTo(this.snappedLayerGuide.position, startY + viewportHeight);
      }
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
    this.resizeViewport(cw, ch);
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
    this.resizeViewport(cw, ch);

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
    const viewportWidth = this.viewportWidth;
    const viewportHeight = this.viewportHeight;
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
        if (this.temporaryColorPickerActive) {
          this.getColorPickerTool().cancelTemporaryPreview(context);
          this.temporaryColorPickerActive = false;
        }

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

    this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
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
    this.setViewportTransform(this.project.zoom, this.project.panX, this.project.panY);

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

    this.renderGuides();

    this.captureSceneSnapshot();

    // --- STEP 3: RENDER TOOLS AND UI ---
    const tool = this.getInteractionTool();
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

  /** Captures the rendered scene before tool overlays are drawn on the main canvas. */
  private captureSceneSnapshot(): void {
    this.sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.sceneCtx.clearRect(0, 0, this.sceneCanvas.width, this.sceneCanvas.height);
    this.sceneCtx.drawImage(this.canvas, 0, 0);
    this.sceneSnapshotReady = true;
  }

  /**
   * Renders a single layer to a given context.
   */
  private renderLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = layer.blendMode;

    const tool = this.getActiveTool();
    const isEditing = tool?.getEditingLayerId() === layer.id;
    const editingState = isEditing ? (tool as any).getEditingState?.() : undefined;

    if (editingState) {
      editingState.isCtrlPressed = this.isCtrlPressed;
    }

    let renderLayerTarget = layer;

    if (isEditing && tool?.id === "transform" && layer.type !== "group") {
      const transform = useToolStore.getState().toolSettings.transform;
      const isRotated = Math.abs(transform.rotation % 360) >= 0.01;

      if (!isRotated) {
        // Pixel-perfect rendering when not rotated
        const targetWidth = Math.round(transform.width * Math.abs(transform.scaleX));
        const targetHeight = Math.round(transform.height * Math.abs(transform.scaleY));
        const finalX = Math.round(transform.x - targetWidth * transform.anchor.x);
        const finalY = Math.round(transform.y - targetHeight * transform.anchor.y);

        if (layer.type === "smart_object") {
          renderLayerTarget = {
            ...layer,
            width: targetWidth,
            height: targetHeight,
            data: layer.dataOriginal || layer.data,
            x: finalX,
            y: finalY,
            rotation: 0,
          };
        } else {
          const canvas = this.layerCanvasCache.get(layer.id);
          const ready = this.layerReadyCache.get(layer.id);
          if (canvas && ready) {
            ctx.save();
            ctx.scale(transform.scaleX < 0 ? -1 : 1, transform.scaleY < 0 ? -1 : 1);
            const drawX = transform.scaleX < 0 ? -(finalX + targetWidth) : finalX;
            const drawY = transform.scaleY < 0 ? -(finalY + targetHeight) : finalY;

            ctx.drawImage(canvas, drawX, drawY, targetWidth, targetHeight);
            ctx.restore();
            ctx.restore(); // Restore layer global state
            return;
          }
        }
      } else {
        // Rotated preview
        ctx.translate(transform.x, transform.y);
        ctx.rotate((transform.rotation * Math.PI) / 180);

        if (layer.type === "smart_object") {
          const targetWidth = Math.round(transform.width * Math.abs(transform.scaleX));
          const targetHeight = Math.round(transform.height * Math.abs(transform.scaleY));
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
          const lx = -transform.width * transform.anchor.x;
          const ly = -transform.height * transform.anchor.y;
          renderLayerTarget = {
            ...layer,
            x: lx,
            y: ly,
            rotation: 0,
          };
        }
      }
    } else if (layer.rotation) {
      const centerX = Math.round(layer.x + layer.width / 2);
      const centerY = Math.round(layer.y + layer.height / 2);
      ctx.translate(centerX, centerY);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    const drawingCanvas = isEditing ? tool?.getDrawingCanvas() : null;
    const isEditingMask = isEditing && this.project?.activeMaskId === layer.id;

    const hasStyles = layer.styles
      ? Object.values(layer.styles).some((s: any) => s?.enabled)
      : false;
    const hasMask = layer.mask?.enabled || isEditingMask;

    if (drawingCanvas && !isEditingMask) {
      ctx.save();
      ctx.globalAlpha *= (layer.fill ?? 100) / 100;
      ctx.drawImage(drawingCanvas.canvas, drawingCanvas.x, drawingCanvas.y);
      ctx.restore();
    } else if (hasStyles || hasMask) {
      // Generic styles and mask implementation for all layer types (Raster, Text, Group, Smart Object)
      this.renderLayerWithStyles(
        ctx,
        renderLayerTarget,
        editingState,
        isEditingMask ? drawingCanvas : undefined,
      );
    } else {
      ctx.globalAlpha *= (layer.fill ?? 100) / 100;
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
    options?: { skipStyles?: boolean; groupTransformOrigin?: { x: number; y: number } },
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
          options,
        );
        break;
      case "group": {
        const groupTransform = this.getGroupRenderTransform(layer, options?.groupTransformOrigin);
        GroupLayer.render(
          ctx,
          layer,
          this.project!.layers,
          (c, l) => this.renderLayer(c, l),
          this.project!.width,
          this.project!.height,
          groupTransform,
        );
        break;
      }
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
      case "color_fill":
        ColorFillLayer.render(ctx, layer);
        break;
      case "gradient_fill":
        GradientFillLayer.render(ctx, layer);
        break;
    }
  }

  /**
   * Helper to render a layer with multiple styles (Stroke, Drop Shadow, etc.)
   */
  private renderLayerWithStyles(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    editingState?: any,
    maskPreview?: { canvas: HTMLCanvasElement; x: number; y: number } | null,
  ) {
    const stroke = layer.styles?.stroke;
    const dropShadow = layer.styles?.dropShadow;
    const innerShadow = layer.styles?.innerShadow;

    let { x, y, width, height } = layer;

    // Groups are containers, so their style bounds come from their descendants. This is
    // especially important while transforming a child: the child is rendered using its
    // preview transform, but the group's old bounds would otherwise clip that preview.
    if (layer.type === "group") {
      const allDescendantIds = this.getGroupDescendants(layer.id);
      const visibleDescendants = this.project!.layers.filter(
        (l) => allDescendantIds.has(l.id) && l.visible,
      );

      if (visibleDescendants.length > 0) {
        const boundsLayer = this.getCurrentRenderBoundsLayer(layer);
        const bounds =
          boundsLayer !== layer
            ? getCombinedStyledBounds([boundsLayer])
            : getCombinedStyledBounds(
                visibleDescendants.map((descendant) =>
                  this.getCurrentRenderBoundsLayer(descendant),
                ),
              );
        x = bounds.x;
        y = bounds.y;
        width = bounds.width;
        height = bounds.height;
      }
    }

    // Calculate padding needed for all effects
    let padding = 0;
    if (stroke?.enabled) padding = Math.max(padding, Math.ceil(stroke.size) + 2);
    if (dropShadow?.enabled) {
      const shadowPadding = Math.ceil(dropShadow.distance + dropShadow.size) + 10;
      padding = Math.max(padding, shadowPadding);
    }
    // Inner shadow doesn't usually need padding outside the layer, but we use the same buffer logic.

    const hasStyles =
      stroke?.enabled === true || dropShadow?.enabled === true || innerShadow?.enabled === true;

    // A static mask without styles does not need the full generic composition pipeline.
    // Reuse one buffer and apply the precomputed alpha mask directly to it.
    if (layer.mask?.enabled && !maskPreview && !hasStyles) {
      const buffer = this.getLayerRenderBuffer(layer.id, width + padding * 2, height + padding * 2);
      const bctx = buffer.getContext("2d")!;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, buffer.width, buffer.height);
      bctx.imageSmoothingEnabled = false;

      bctx.save();
      bctx.translate(padding - x, padding - y);
      const renderOptions: {
        skipStyles: boolean;
        groupTransformOrigin?: { x: number; y: number };
      } = { skipStyles: true };
      if (layer.type === "group") {
        renderOptions.groupTransformOrigin = { x: 0, y: 0 };
      }
      this.renderLayerToContext(bctx, layer, editingState, renderOptions);
      bctx.restore();

      this.applyLayerMask(bctx, layer.id, layer.mask, buffer.width, buffer.height, padding, x, y);

      const fillAlpha = (layer.fill ?? 100) / 100;
      ctx.save();
      ctx.globalAlpha *= fillAlpha;
      ctx.drawImage(buffer, Math.round(x - padding), Math.round(y - padding));
      ctx.restore();
      return;
    }

    // 1. Render layer content into an offscreen buffer
    const buffer = this.getLayerRenderBuffer(layer.id, width + padding * 2, height + padding * 2);
    const bctx = buffer.getContext("2d")!;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, buffer.width, buffer.height);
    bctx.imageSmoothingEnabled = false;

    // Adjust layer coordinates for the buffer
    // We need to translate the context so that the group's "content origin"
    // aligns with 'padding, padding' in the buffer.
    bctx.save();
    bctx.translate(padding - x, padding - y);
    const renderOptions: { skipStyles: boolean; groupTransformOrigin?: { x: number; y: number } } =
      {
        skipStyles: true,
      };
    if (layer.type === "group") {
      // GroupLayer composites its children in project coordinates into its own
      // project-sized buffer. The outer buffer translation happens only when
      // that completed image is drawn, so applying this offset here would shift
      // the preview a second time.
      renderOptions.groupTransformOrigin = { x: 0, y: 0 };
    }
    this.renderLayerToContext(bctx, layer, editingState, renderOptions);
    bctx.restore();

    // --- LAYER MASK (Applied to content before styles so styles adapt) ---
    if (layer.mask?.enabled || maskPreview) {
      this.applyLayerMask(
        bctx,
        layer.id,
        layer.mask,
        buffer.width,
        buffer.height,
        padding,
        x,
        y,
        maskPreview,
      );
    }

    // 2. Prepare Composition Buffer
    // We render everything into a single offscreen buffer to avoid sub-pixel gaps (halos)
    // when multiple semi-transparent pieces are drawn to the main context.
    const compCanvas = document.createElement("canvas");
    compCanvas.width = buffer.width;
    compCanvas.height = buffer.height;
    const compCtx = compCanvas.getContext("2d")!;
    compCtx.imageSmoothingEnabled = true;

    const destX = Math.round(x - padding);
    const destY = Math.round(y - padding);
    const fillAlpha = (layer.fill ?? 100) / 100;

    // Render order (bottom to top): Drop Shadow -> Content (Fill) -> Inner Shadow -> Stroke

    // --- DROP SHADOW ---
    if (dropShadow?.enabled) {
      // Use a temporary canvas for the shadow so we can mask it (Knock out)
      const dsCanvas = document.createElement("canvas");
      dsCanvas.width = buffer.width;
      dsCanvas.height = buffer.height;
      const dsCtx = dsCanvas.getContext("2d")!;

      this.renderDropShadow(dsCtx, buffer, dropShadow, 0, 0, layer.id, padding, padding);

      // MASKING: "Layer Knocks Out Drop Shadow"
      // Optimization: If Fill is 100%, we draw shadow behind without a hole to avoid anti-aliasing gaps (halos)
      if (fillAlpha < 0.99) {
        dsCtx.save();
        dsCtx.globalCompositeOperation = "destination-out";
        // Use a single draw for the mask to avoid over-erasing (halos)
        dsCtx.drawImage(buffer, 0, 0);
        dsCtx.restore();
      }

      compCtx.drawImage(dsCanvas, 0, 0);
    }

    // --- STROKE (OUTSIDE) ---
    if (stroke?.enabled && stroke.size > 0 && stroke.position === "outside") {
      this.renderStroke(compCtx, buffer, stroke, layer.type === "text", fillAlpha);
    }

    // --- CONTENT (FILL) ---
    compCtx.save();
    compCtx.globalAlpha = fillAlpha;
    compCtx.drawImage(buffer, 0, 0);
    compCtx.restore();

    // --- INNER SHADOW ---
    if (innerShadow?.enabled) {
      this.renderInnerShadow(compCtx, buffer, innerShadow, 0, 0, layer.id, padding, padding);
    }

    // --- STROKE (CENTER / INSIDE) ---
    if (stroke?.enabled && stroke.size > 0 && stroke.position !== "outside") {
      this.renderStroke(compCtx, buffer, stroke, layer.type === "text", fillAlpha);
    }

    // 3. Final Draw to main context
    ctx.drawImage(compCanvas, destX, destY);
  }

  /**
   * Returns a layer copy with the bounds currently used by the transform preview.
   * Group styles use these bounds to size their offscreen buffer before descendants
   * are rendered, preventing transformed children from being clipped to stale bounds.
   */
  private getCurrentRenderBoundsLayer(layer: Layer): Layer {
    const tool = this.getActiveTool();
    if (tool?.id !== "transform" || tool.getEditingLayerId() !== layer.id) return layer;

    const transform = useToolStore.getState().toolSettings.transform;
    const width = transform.width * Math.abs(transform.scaleX);
    const height = transform.height * Math.abs(transform.scaleY);
    const rotation = (transform.rotation * Math.PI) / 180;

    if (Math.abs(transform.rotation % 360) < 0.01) {
      return {
        ...layer,
        x: transform.x - width * transform.anchor.x,
        y: transform.y - height * transform.anchor.y,
        width,
        height,
        rotation: 0,
      };
    }

    const corners = [
      { x: -width * transform.anchor.x, y: -height * transform.anchor.y },
      { x: width * (1 - transform.anchor.x), y: -height * transform.anchor.y },
      { x: width * (1 - transform.anchor.x), y: height * (1 - transform.anchor.y) },
      { x: -width * transform.anchor.x, y: height * (1 - transform.anchor.y) },
    ].map(({ x, y }) => ({
      x: transform.x + x * Math.cos(rotation) - y * Math.sin(rotation),
      y: transform.y + x * Math.sin(rotation) + y * Math.cos(rotation),
    }));

    const minX = Math.min(...corners.map((corner) => corner.x));
    const minY = Math.min(...corners.map((corner) => corner.y));
    const maxX = Math.max(...corners.map((corner) => corner.x));
    const maxY = Math.max(...corners.map((corner) => corner.y));

    return {
      ...layer,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      rotation: 0,
    };
  }

  private getGroupContentBounds(groupId: string) {
    const descendantIds = this.getGroupDescendants(groupId);
    const descendants = this.project!.layers.filter(
      (candidate) => descendantIds.has(candidate.id) && candidate.visible,
    );
    const contentLayers = descendants.filter((candidate) => candidate.type !== "group");
    if (contentLayers.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

    const bounds = contentLayers.map((candidate) => getLayerGeometryBounds(candidate));
    const minX = Math.min(...bounds.map((candidate) => candidate.x));
    const minY = Math.min(...bounds.map((candidate) => candidate.y));
    const maxX = Math.max(...bounds.map((candidate) => candidate.x + candidate.width));
    const maxY = Math.max(...bounds.map((candidate) => candidate.y + candidate.height));

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  private getGroupRenderTransform(
    layer: Layer,
    origin = { x: 0, y: 0 },
  ): GroupRenderTransform | undefined {
    const tool = this.getActiveTool();
    if (tool?.id !== "transform" || tool.getEditingLayerId() !== layer.id) return undefined;

    const transform = useToolStore.getState().toolSettings.transform;
    const bounds = this.getGroupContentBounds(layer.id);
    return {
      ...transform,
      baseX: bounds.x,
      baseY: bounds.y,
      originX: origin.x,
      originY: origin.y,
    };
  }

  /**
   * Applies a layer mask to a context.
   */
  private getLayerRenderBuffer(layerId: string, width: number, height: number): HTMLCanvasElement {
    const targetWidth = Math.max(1, Math.ceil(width));
    const targetHeight = Math.max(1, Math.ceil(height));
    const cached = this.layerRenderBufferCache.get(layerId);

    if (cached && cached.width === targetWidth && cached.height === targetHeight) {
      return cached.canvas;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    this.layerRenderBufferCache.set(layerId, {
      canvas,
      width: targetWidth,
      height: targetHeight,
    });
    return canvas;
  }

  /**
   * Converts a grayscale layer mask into a reusable alpha canvas.
   * The conversion is intentionally keyed by the mask data and dimensions so it
   * never runs as part of the steady-state render loop.
   */
  private getMaskAlphaCanvas(layerId: string, mask: Layer["mask"]): HTMLCanvasElement | null {
    if (!mask?.data || mask.width <= 0 || mask.height <= 0) return null;

    const cached = this.maskCanvasCache.get(layerId);
    if (
      cached?.dataUrl === mask.data &&
      cached.alphaCanvas?.width === mask.width &&
      cached.alphaCanvas.height === mask.height
    ) {
      return cached.alphaCanvas;
    }

    let sourceCanvas = cached?.dataUrl === mask.data ? cached.canvas : null;
    if (!sourceCanvas) {
      const image = this.imageCache.get(mask.data);
      if (!image || !image.complete || image.naturalWidth <= 0) return null;

      sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = mask.width;
      sourceCanvas.height = mask.height;
      sourceCanvas.getContext("2d")!.drawImage(image, 0, 0, mask.width, mask.height);
    }

    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = mask.width;
    alphaCanvas.height = mask.height;
    const alphaCtx = alphaCanvas.getContext("2d")!;
    alphaCtx.drawImage(sourceCanvas, 0, 0, mask.width, mask.height);

    const imageData = alphaCtx.getImageData(0, 0, mask.width, mask.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const luminosity = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i + 3] = (data[i + 3] * luminosity) / 255;
    }
    alphaCtx.putImageData(imageData, 0, 0);

    if (cached?.dataUrl === mask.data) {
      cached.alphaCanvas = alphaCanvas;
    } else {
      this.maskCanvasCache.set(layerId, {
        canvas: sourceCanvas,
        dataUrl: mask.data,
        alphaCanvas,
      });
    }

    return alphaCanvas;
  }

  private applyLayerMask(
    ctx: CanvasRenderingContext2D,
    layerId: string,
    mask: any,
    width: number,
    height: number,
    padding: number,
    layerX: number,
    layerY: number,
    maskPreview?: { canvas: HTMLCanvasElement; x: number; y: number } | null,
  ) {
    if (mask?.enabled && !maskPreview) {
      const alphaCanvas = this.getMaskAlphaCanvas(layerId, mask);
      if (alphaCanvas) {
        const drawX = padding + (mask.x - layerX);
        const drawY = padding + (mask.y - layerY);

        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(alphaCanvas, drawX, drawY, mask.width, mask.height);
        ctx.restore();
        return;
      }

      if (mask.data && !this.imageCache.has(mask.data)) {
        void this.preloadImage(mask.data).then(() => this.render());
      }
      return;
    }

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const mctx = maskCanvas.getContext("2d")!;

    // 1. Draw base mask data
    if (mask?.enabled) {
      const cachedMask = this.maskCanvasCache.get(layerId);
      const cachedMaskMatches = cachedMask?.dataUrl === mask.data;
      const img = this.imageCache.get(mask.data);
      if (cachedMaskMatches) {
        const drawX = padding + (mask.x - layerX);
        const drawY = padding + (mask.y - layerY);
        mctx.drawImage(cachedMask!.canvas, drawX, drawY, mask.width, mask.height);
      } else if (img) {
        // Align mask with the layer content in buffer space
        // mask.x, mask.y are in project coordinates
        // layerX, layerY are also project coordinates
        const drawX = padding + (mask.x - layerX);
        const drawY = padding + (mask.y - layerY);
        mctx.drawImage(img, drawX, drawY, mask.width, mask.height);
      } else {
        // Load it for next time
        if (!this.imageCache.has(mask.data)) {
          void this.preloadImage(mask.data).then(() => this.render());
        }
        // While loading, treat as fully opaque (white)
        mctx.fillStyle = "white";
        mctx.fillRect(0, 0, width, height);
      }
    } else {
      // If mask is disabled or missing but we have a preview, start with white
      mctx.fillStyle = "white";
      mctx.fillRect(0, 0, width, height);
    }

    // 2. Overlay real-time mask painting if available
    if (maskPreview) {
      // maskPreview.x/y are project coordinates
      const drawX = padding + (maskPreview.x - layerX);
      const drawY = padding + (maskPreview.y - layerY);
      mctx.drawImage(maskPreview.canvas, drawX, drawY);
    }

    // 3. Convert grayscale luminosity to alpha
    const imgData = mctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      // luminosity = (R + G + B) / 3
      const luminosity = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // data[i+3] is the original alpha of the mask pixel
      data[i + 3] = (data[i + 3] * luminosity) / 255;
    }
    mctx.putImageData(imgData, 0, 0);

    // 4. Apply to target context
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
  }

  /**
   * Internal helper to apply stroke logic to a buffer.
   */
  private renderStroke(
    ctx: CanvasRenderingContext2D,
    contentBuffer: HTMLCanvasElement,
    stroke: StrokeStyle,
    isText: boolean,
    fillAlpha: number = 1,
  ) {
    const { size, position, rounded, color, opacity, antiAlias } = stroke;

    const strokeBuffer = document.createElement("canvas");
    strokeBuffer.width = contentBuffer.width;
    strokeBuffer.height = contentBuffer.height;
    const sctx = strokeBuffer.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;

    // Unified logic for all positions:
    // 1. Calculate dilation and erosion values
    const dilation = position === "outside" ? size : position === "center" ? size / 2 : 0;
    const erosion = position === "inside" ? size : position === "center" ? size / 2 : 0;

    // 2. Build the base mask (Content + Dilation)
    if (dilation > 0) {
      this.drawDilation(sctx, contentBuffer, dilation, rounded);
    } else {
      sctx.drawImage(contentBuffer, 0, 0);
    }

    // 3. Subtract the "hole" (Content - Erosion)
    if (erosion > 0) {
      const erosionCanvas = document.createElement("canvas");
      erosionCanvas.width = contentBuffer.width;
      erosionCanvas.height = contentBuffer.height;
      const ectx = erosionCanvas.getContext("2d")!;
      this.drawErosion(ectx, contentBuffer, erosion, rounded);

      sctx.save();
      sctx.globalCompositeOperation = "destination-out";
      sctx.drawImage(erosionCanvas, 0, 0);
      sctx.restore();
    } else if (fillAlpha < 0.99) {
      // For Outside strokes, if Fill is semi-transparent, we knock out the center
      // so the fill doesn't blend with the stroke behind it.
      sctx.save();
      sctx.globalCompositeOperation = "destination-out";
      sctx.drawImage(contentBuffer, 0, 0);
      sctx.restore();
    }

    // 4. Colorize the resulting mask
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = color;
    sctx.globalAlpha = opacity / 100;

    if (antiAlias && !isText) {
      sctx.shadowColor = color;
      sctx.shadowBlur = 0.5;
    }

    sctx.fillRect(0, 0, contentBuffer.width, contentBuffer.height);

    // 5. Final Draw to the target context
    ctx.drawImage(strokeBuffer, 0, 0);
  }

  private drawDilation(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    dilation: number,
    rounded: boolean,
  ) {
    if (rounded) {
      const radii = [dilation];
      if (dilation > 2) radii.push(dilation * 0.5);
      if (dilation > 6) radii.push(dilation * 0.75, dilation * 0.25);

      radii.forEach((r) => {
        const steps = Math.max(16, Math.min(128, Math.ceil(r * 6)));
        for (let i = 0; i < steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          ctx.drawImage(source, Math.cos(angle) * r, Math.sin(angle) * r);
        }
      });
    } else {
      const tempBuffer = document.createElement("canvas");
      tempBuffer.width = source.width;
      tempBuffer.height = source.height;
      const tctx = tempBuffer.getContext("2d")!;
      for (let x = -dilation; x <= dilation; x++) tctx.drawImage(source, x, 0);
      for (let y = -dilation; y <= dilation; y++) ctx.drawImage(tempBuffer, 0, y);
    }
  }

  private drawErosion(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    erosion: number,
    rounded: boolean,
  ) {
    ctx.save();
    if (rounded) {
      const steps = Math.max(16, Math.min(128, Math.ceil(erosion * 6)));
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        ctx.drawImage(source, Math.cos(angle) * erosion, Math.sin(angle) * erosion);
      }
    } else {
      const tempErosionBuffer = document.createElement("canvas");
      tempErosionBuffer.width = source.width;
      tempErosionBuffer.height = source.height;
      const tetctx = tempErosionBuffer.getContext("2d")!;
      tetctx.drawImage(source, 0, 0);
      tetctx.globalCompositeOperation = "destination-in";
      for (let x = -erosion; x <= erosion; x++) tetctx.drawImage(source, x, 0);
      ctx.drawImage(tempErosionBuffer, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      for (let y = -erosion; y <= erosion; y++) ctx.drawImage(tempErosionBuffer, 0, y);
    }
    ctx.restore();
  }

  /**
   * Renders Drop Shadow effect using native canvas shadow and buffer manipulation.
   */
  private renderDropShadow(
    ctx: CanvasRenderingContext2D,
    contentBuffer: HTMLCanvasElement,
    style: DropShadowStyle,
    x: number,
    y: number,
    layerId: string,
    layerBufferX: number = 0,
    layerBufferY: number = 0,
  ) {
    const { color, opacity, angle, distance, size, spread, noise } = style;

    // Calculate offsets based on angle and distance
    const rad = (angle * Math.PI) / 180;
    const rawOffsetX = Math.cos(rad) * distance;
    const rawOffsetY = Math.sin(rad) * distance;

    // We MUST round these to integers if noise is enabled (or always for parity)
    // to prevent "sub-pixel swimming" and blurring of the 1px noise pattern.
    const offsetX = Math.round(rawOffsetX);
    const offsetY = Math.round(rawOffsetY);

    // Photoshop/Photopea parity logic:
    // Size = total influence.
    // Spread = percentage of that influence that is solid (dilated).
    // Remaining = softness (blur).
    const spreadSize = (size * spread) / 100;
    const blurSize = size - spreadSize;

    ctx.save();

    // 1. Create a shadow mask buffer (black mask of the expanded shape)
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = contentBuffer.width;
    shadowCanvas.height = contentBuffer.height;
    const sctx = shadowCanvas.getContext("2d", { willReadFrequently: noise > 0 })!;

    // 2. Expand the shape (Spread)
    // We dilate the original shape to create a smooth, solid core.
    if (spreadSize > 0) {
      // Circular dilation for smooth expansion
      const steps = Math.min(128, Math.max(12, Math.ceil(spreadSize * 4)));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        sctx.drawImage(contentBuffer, Math.cos(a) * spreadSize, Math.sin(a) * spreadSize);
      }
      sctx.drawImage(contentBuffer, 0, 0); // Fill center
    } else {
      sctx.drawImage(contentBuffer, 0, 0);
    }

    // 3. Fill the expanded mask with the shadow color
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = color;
    sctx.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

    // 4. Render the blurred shadow into an intermediate buffer
    // This is necessary so we can apply noise AFTER the blur.
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = shadowCanvas.width;
    blurCanvas.height = shadowCanvas.height;
    const bctx = blurCanvas.getContext("2d", { willReadFrequently: noise > 0 })!;

    if (blurSize > 0) {
      bctx.shadowColor = color;
      bctx.shadowBlur = blurSize;
      bctx.shadowOffsetX = 20000;
      bctx.shadowOffsetY = 0;
      bctx.drawImage(shadowCanvas, -20000, 0);
    } else {
      bctx.drawImage(shadowCanvas, 0, 0);
    }

    // 5. Apply Noise (if any) - Applied to the blurred result
    if (noise > 0) {
      const imageData = bctx.getImageData(0, 0, blurCanvas.width, blurCanvas.height);
      const data = imageData.data;
      const noiseFactor = noise / 100;
      const width = blurCanvas.width;

      // Seed based on layer ID for deterministic noise (static patterns)
      const seedBase = this.hashString(layerId);

      for (let i = 0; i < data.length; i += 4) {
        const originalAlpha = data[i + 3];
        if (originalAlpha > 0) {
          const pixelIndex = i / 4;
          const px = pixelIndex % width;
          const py = Math.floor(pixelIndex / width);

          // FIX: To keep noise fixed relative to the layer, we anchor the
          // seeding coordinates to the layer's origin by:
          // 1. Adding the shadow offset (since px/py are in shadow-space and will be shifted by offsetX/Y later)
          // 2. Subtracting the buffer padding (layerBufferX/Y)
          const anchoredX = px + offsetX - layerBufferX;
          const anchoredY = py + offsetY - layerBufferY;

          // Robust 2D seeding for better entropy and to avoid patterns
          const rand = this.seededRandom(seedBase + anchoredX * 31337 + anchoredY * 13331);

          // Weighted Noise Model:
          // We perturb the alpha channel, but scale the intensity by the original alpha.
          // This ensures that the noise follows the shadow's density and never
          // expands beyond its original footprint (no halos/contours).
          // 100% noise allows a swing from 0 to 2x the original alpha.
          const variation = (rand * 2 - 1) * noiseFactor;

          // Clamp the result to [0, 255]
          data[i + 3] = Math.max(0, Math.min(255, originalAlpha * (1 + variation)));
        }
      }
      bctx.putImageData(imageData, 0, 0);
    }

    // 6. Final draw to the target context
    ctx.save();
    ctx.globalAlpha = opacity / 100;
    ctx.drawImage(blurCanvas, x + offsetX, y + offsetY);
    ctx.restore();

    ctx.restore();
  }

  /**
   * Renders Inner Shadow effect.
   * Logic: We create an inverted mask (hole) of the layer, draw a shadow from that hole,
   * and clip it to the original layer content.
   */
  private renderInnerShadow(
    ctx: CanvasRenderingContext2D,
    contentBuffer: HTMLCanvasElement,
    style: InnerShadowStyle,
    x: number,
    y: number,
    layerId: string,
    layerBufferX: number = 0,
    layerBufferY: number = 0,
  ) {
    const { color, opacity, angle, distance, size, spread, noise } = style;

    // Calculate offsets based on angle and distance
    // NOTE: For Inner Shadow, positive distance moves the shadow INSIDE the shape.
    // Photoshop behavior: distance 10 at 90 deg moves shadow 10px DOWN,
    // effectively showing the TOP inner edge.
    const rad = (angle * Math.PI) / 180;
    const rawOffsetX = Math.cos(rad) * distance;
    const rawOffsetY = Math.sin(rad) * distance;
    const offsetX = Math.round(rawOffsetX);
    const offsetY = Math.round(rawOffsetY);

    const spreadSize = (size * spread) / 100;
    const blurSize = size - spreadSize;

    // 1. Create Inverted Mask (The "Hole")
    // We need a canvas that is solid everywhere EXCEPT where the layer is.
    // We add extra margin to ensure the shadow can bleed in from far away if distance is high.
    const margin = Math.ceil(distance + size + 20);
    const holeCanvas = document.createElement("canvas");
    holeCanvas.width = contentBuffer.width + margin * 2;
    holeCanvas.height = contentBuffer.height + margin * 2;
    const hctx = holeCanvas.getContext("2d")!;

    // Fill with solid color
    hctx.fillStyle = "black";
    hctx.fillRect(0, 0, holeCanvas.width, holeCanvas.height);

    // Cut the layer shape out
    hctx.globalCompositeOperation = "destination-out";
    hctx.drawImage(contentBuffer, margin, margin);

    // 2. Render Shadow from the hole
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = holeCanvas.width;
    shadowCanvas.height = holeCanvas.height;
    const sctx = shadowCanvas.getContext("2d", { willReadFrequently: noise > 0 })!;

    if (spreadSize > 0) {
      const steps = Math.min(128, Math.max(12, Math.ceil(spreadSize * 4)));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        sctx.drawImage(holeCanvas, Math.cos(a) * spreadSize, Math.sin(a) * spreadSize);
      }
      sctx.drawImage(holeCanvas, 0, 0);
    } else {
      sctx.drawImage(holeCanvas, 0, 0);
    }

    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = color;
    sctx.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

    // 3. Blur the shadow
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = shadowCanvas.width;
    blurCanvas.height = shadowCanvas.height;
    const bctx = blurCanvas.getContext("2d", { willReadFrequently: noise > 0 })!;

    if (blurSize > 0) {
      bctx.shadowColor = color;
      bctx.shadowBlur = blurSize;
      bctx.shadowOffsetX = 20000;
      bctx.shadowOffsetY = 0;
      bctx.drawImage(shadowCanvas, -20000, 0);
    } else {
      bctx.drawImage(shadowCanvas, 0, 0);
    }

    // 4. Apply Noise (Anchored to layer origin)
    if (noise > 0) {
      const imageData = bctx.getImageData(0, 0, blurCanvas.width, blurCanvas.height);
      const data = imageData.data;
      const noiseFactor = noise / 100;
      const width = blurCanvas.width;
      const seedBase = this.hashString(layerId);

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          const pixelIndex = i / 4;
          const px = pixelIndex % width;
          const py = Math.floor(pixelIndex / width);

          // For Inner Shadow, the holeCanvas is shifted by 'margin'.
          // So (px, py) in blurCanvas corresponds to (px-margin, py-margin) in contentBuffer space.
          // We anchor to layer origin by adding offset and subtracting padding and margin.
          const anchoredX = px - margin + offsetX - layerBufferX;
          const anchoredY = py - margin + offsetY - layerBufferY;

          const rand = this.seededRandom(seedBase + anchoredX * 31337 + anchoredY * 13331);
          const variation = (rand * 2 - 1) * noiseFactor;
          data[i + 3] = Math.max(0, Math.min(255, data[i + 3] * (1 + variation)));
        }
      }
      bctx.putImageData(imageData, 0, 0);
    }

    // 5. Final Clip and Draw
    // We only want the shadow parts that overlap with the original layer
    ctx.save();
    ctx.globalAlpha = opacity / 100;

    // Use the original content as a mask
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = contentBuffer.width;
    finalCanvas.height = contentBuffer.height;
    const fctx = finalCanvas.getContext("2d")!;

    fctx.drawImage(contentBuffer, 0, 0);
    fctx.globalCompositeOperation = "source-in";
    // Draw the shadow with offset
    fctx.drawImage(blurCanvas, -margin + offsetX, -margin + offsetY);

    ctx.drawImage(finalCanvas, x, y);
    ctx.restore();
  }

  /**
   * Helper to render a layer with a stroke effect using a generic buffer approach.
   * @deprecated Use renderLayerWithStyles instead
   */
  private renderLayerWithStroke(ctx: CanvasRenderingContext2D, layer: Layer, editingState?: any) {
    this.renderLayerWithStyles(ctx, layer, editingState);
  }

  /**
   * Renders a pixel grid when the zoom level is high enough.
   */
  private renderPixelGrid() {
    if (!this.project) return;
    this.ctx.save();
    this.setViewportTransform(this.project.zoom, this.project.panX, this.project.panY);
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
    this.maskCanvasCache.delete(layerId);
    this.layerRenderBufferCache.delete(layerId);
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

  /**
   * Simple string hashing function.
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Recursively finds all descendant layer IDs of a group.
   */
  private getGroupDescendants(groupId: string): Set<string> {
    const descendants = new Set<string>();
    if (!this.project) return descendants;

    const findChildren = (parentId: string) => {
      const children = this.project!.layers.filter((l) => l.parentId === parentId);
      for (const child of children) {
        descendants.add(child.id);
        if (child.type === "group") {
          findChildren(child.id);
        }
      }
    };

    findChildren(groupId);
    return descendants;
  }

  /**
   * Fast seeded random generator using 32-bit MurmurHash3-style mixing.
   */
  private seededRandom(seed: number): number {
    seed |= 0;
    seed = (seed ^ (seed >>> 16)) * 0x85ebca6b;
    seed |= 0;
    seed = (seed ^ (seed >>> 13)) * 0xc2b2ae35;
    seed |= 0;
    seed = (seed ^ (seed >>> 16)) >>> 0;
    return seed / 4294967296;
  }
}
