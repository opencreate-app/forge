/**
 * Purpose: Smooth painting tool with adjustable size and hardness, utilizing radial gradients for soft edges and optimized rendering.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { createHistoryState, HistoryState } from "@/renderer/store/projectStore";
import { useUIStore } from "@store/uiStore";

export class BrushTool extends BaseTool {
  id: ToolId = "brush";

  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private layerId: string | null = null;
  private strokeOriginX = 0;
  private strokeOriginY = 0;
  private readonly STROKE_PADDING = 2048;

  private mouseX = 0;
  private mouseY = 0;
  private isMouseOver = false;

  private brushCanvas: HTMLCanvasElement | null = null;

  // For bounding box optimization
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  private historySnapshot: HistoryState | null = null;

  private hexToRgba(hex: string, alpha: number) {
    if (!hex.startsWith("#")) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private initBrush(size: number, hardness: number, color: string) {
    const radius = (size / 2) * (2 - hardness);
    const canvasSize = Math.ceil(size * 1.5 * (2 - hardness));

    this.brushCanvas = document.createElement("canvas");
    this.brushCanvas.width = canvasSize;
    this.brushCanvas.height = canvasSize;
    const ctx = this.brushCanvas.getContext("2d")!;

    const center = canvasSize / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);

    // 1. Center and start of falloff (fully opaque)
    const opaque = this.hexToRgba(color, 1);
    gradient.addColorStop(0, opaque);

    const hardnessStop = Math.max(0, Math.min(0.99, hardness));
    gradient.addColorStop(hardnessStop, opaque);

    // 2. Smooth Transition (Smoothstep) between hardness and the edge (1)
    // We use 10 steps to approximate the curve; it is light for processing
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; // Goes from 0 to 1

      // Smoothstep Formula: non-linear interpolation
      const tSmooth = t * t * (3 - 2 * t);

      // Invert for Alpha (starts at 1 at hardness and goes to 0 at the edge)
      const alpha = 1 - tSmooth;

      // Map stop position between hardness and the end (1.0)
      const stopPosition = hardnessStop + t * (1 - hardnessStop);

      gradient.addColorStop(Math.min(0.999, stopPosition), this.hexToRgba(color, alpha));
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private isLoadingBaseImage = false;

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    if (e.button !== 0) return;

    const activeLayerId = context.project.activeLayerId;
    if (!activeLayerId) return;

    if (context.isLayerLocked(activeLayerId) || !context.isLayerVisible(activeLayerId)) return;

    const layer = context.project.layers.find((l) => l.id === activeLayerId);
    if (!layer) return;

    if (layer.type !== "raster") {
      if (layer.type === "smart_object") {
        useUIStore
          .getState()
          .showToast(
            "Cannot paint on a smart object. Double-click to edit its content.",
            "warning",
          );
      } else {
        useUIStore.getState().showToast("Cannot paint on a non-raster layer", "warning");
      }
      return;
    }

    this.historySnapshot = createHistoryState(context.project);

    this.isDrawing = true;
    this.layerId = activeLayerId;

    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    this.mouseX = x;
    this.mouseY = y;
    this.lastX = x;
    this.lastY = y;

    const settings = context.settings.brush;
    // this.initBrush(settings.size, settings.hardness, settings.color);
    this.initBrush(settings.size, settings.hardness, context.foregroundColor);
    this.initOffscreen(layer, context);

    const pad = settings.size;
    this.minX = x - pad;
    this.minY = y - pad;
    this.maxX = x + pad;
    this.maxY = y + pad;

    this.draw(x, y, context);
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    this.mouseX = x;
    this.mouseY = y;

    // Check if the mouse is over the canvas to show/hide the preview
    const rect = context.canvas.getBoundingClientRect();
    this.isMouseOver =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    if (this.isMouseOver) {
      context.canvas.style.cursor = "crosshair";
    } else {
      context.canvas.style.cursor = "default";
    }

    if (!this.isDrawing) return;

    const settings = context.settings.brush;
    const pad = settings.size;
    this.minX = Math.min(this.minX, x - pad);
    this.minY = Math.min(this.minY, y - pad);
    this.maxX = Math.max(this.maxX, x + pad);
    this.maxY = Math.max(this.maxY, y + pad);

    this.draw(x, y, context);
    this.lastX = x;
    this.lastY = y;
  }

  onMouseUp(e: MouseEvent, context: ToolContext): void {
    if (!this.isDrawing) return;

    // If still loading the base image (e.g., giant layer or slow internet if that were the case),
    // we will wait a bit or force completion.
    // But most of the time it will already be ready with the cache.
    if (this.isLoadingBaseImage) {
      // Small delay to give time for onload to fire if it's almost ready
      setTimeout(() => this.onMouseUp(e, context), 10);
      return;
    }

    this.isDrawing = false;

    if (this.offscreenCanvas && this.layerId && this.offscreenCtx) {
      const layer = context.project.layers.find((l) => l.id === this.layerId)!;
      const isEditingMask = context.project.activeMaskId === layer.id;

      // Optimization: Instead of scanning the entire canvas (which now has STROKE_PADDING),
      // we only scan the union of the original layer area and the new stroke area.
      const strokeLocalMinX = Math.floor(this.minX - this.strokeOriginX);
      const strokeLocalMinY = Math.floor(this.minY - this.strokeOriginY);
      const strokeLocalMaxX = Math.ceil(this.maxX - this.strokeOriginX);
      const strokeLocalMaxY = Math.ceil(this.maxY - this.strokeOriginY);

      const searchBounds = {
        x: Math.max(0, Math.min(this.STROKE_PADDING, strokeLocalMinX)),
        y: Math.max(0, Math.min(this.STROKE_PADDING, strokeLocalMinY)),
        width: 0,
        height: 0,
      };

      const targetWidth = isEditingMask ? layer.mask!.width : layer.width;
      const targetHeight = isEditingMask ? layer.mask!.height : layer.height;

      const searchMaxX = Math.min(
        this.offscreenCanvas.width,
        Math.max(this.STROKE_PADDING + targetWidth, strokeLocalMaxX),
      );
      const searchMaxY = Math.min(
        this.offscreenCanvas.height,
        Math.max(this.STROKE_PADDING + targetHeight, strokeLocalMaxY),
      );

      searchBounds.width = searchMaxX - searchBounds.x;
      searchBounds.height = searchMaxY - searchBounds.y;

      const bounds = this.getOptimizedBoundingBox(this.offscreenCtx, searchBounds);

      if (bounds) {
        const croppedCanvas = document.createElement("canvas");
        croppedCanvas.width = bounds.width;
        croppedCanvas.height = bounds.height;
        const croppedCtx = croppedCanvas.getContext("2d")!;

        croppedCtx.drawImage(
          this.offscreenCanvas,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          0,
          0,
          bounds.width,
          bounds.height,
        );

        const dataUrl = croppedCanvas.toDataURL("image/png");

        if (!isEditingMask) {
          context.setLayerCache(this.layerId, croppedCanvas);
        } else {
          context.invalidateCache(this.layerId);
        }

        const layers = context.project.layers.map((l) => {
          if (l.id === this.layerId) {
            if (isEditingMask) {
              return {
                ...l,
                mask: {
                  ...l.mask!,
                  data: dataUrl,
                  x: this.strokeOriginX + bounds.x,
                  y: this.strokeOriginY + bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                },
              };
            } else {
              return {
                ...l,
                data: dataUrl,
                x: this.strokeOriginX + bounds.x,
                y: this.strokeOriginY + bounds.y,
                width: bounds.width,
                height: bounds.height,
              };
            }
          }
          return l;
        });

        if (this.historySnapshot) {
          context.addHistoryEntry({
            description: isEditingMask ? "Brush Mask" : "Brush Tool",
            state: this.historySnapshot,
          });
        }
        context.updateProject({ layers, isDirty: true });
      }
    }

    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.brushCanvas = null;
    this.historySnapshot = null;
  }

  private getOptimizedBoundingBox(
    ctx: CanvasRenderingContext2D,
    search: { x: number; y: number; width: number; height: number },
  ) {
    if (search.width <= 0 || search.height <= 0) return null;
    const imageData = ctx.getImageData(search.x, search.y, search.width, search.height);
    const data = imageData.data;
    let minX = search.width,
      minY = search.height,
      maxX = -1,
      maxY = -1;
    let found = false;

    for (let y = 0; y < search.height; y++) {
      for (let x = 0; x < search.width; x++) {
        const alpha = data[(y * search.width + x) * 4 + 3];
        if (alpha > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          found = true;
        }
      }
    }
    if (!found) return null;
    return {
      x: search.x + minX,
      y: search.y + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  private initOffscreen(layer: any, context: ToolContext) {
    const isEditingMask = context.project.activeMaskId === layer.id;
    const targetX = isEditingMask ? layer.mask.x : layer.x;
    const targetY = isEditingMask ? layer.mask.y : layer.y;
    const targetWidth = isEditingMask ? layer.mask.width : layer.width;
    const targetHeight = isEditingMask ? layer.mask.height : layer.height;
    const targetData = isEditingMask ? layer.mask.data : layer.data;

    this.strokeOriginX = targetX - this.STROKE_PADDING;
    this.strokeOriginY = targetY - this.STROKE_PADDING;
    const width = targetWidth + this.STROKE_PADDING * 2;
    const height = targetHeight + this.STROKE_PADDING * 2;

    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;
    this.offscreenCtx = this.offscreenCanvas.getContext("2d")!;

    // Try to get from cache first (synchronously) for speed (only for non-mask layers)
    if (!isEditingMask) {
      const cachedResult = context.getLayerCanvas(layer.id);
      if (cachedResult) {
        // Clear to avoid overlap in case the engine tries to draw the base layer again
        this.offscreenCtx.clearRect(0, 0, width, height);
        this.offscreenCtx.drawImage(cachedResult.canvas, this.STROKE_PADDING, this.STROKE_PADDING);

        // If the cache was already ready, we don't need to load from the data URL
        if (cachedResult.ready) {
          return;
        }
      }
    }

    // If the cache was not ready or did not exist, load from the original data URL
    if (targetData) {
      this.isLoadingBaseImage = true;
      const img = new Image();
      img.onload = () => {
        if (this.offscreenCtx) {
          this.offscreenCtx.save();
          // Since we are going to load the real image, we clear whatever came from the incomplete cache
          // to avoid the opacity "doubling" effect
          this.offscreenCtx.globalCompositeOperation = "destination-over";
          this.offscreenCtx.drawImage(img, this.STROKE_PADDING, this.STROKE_PADDING);
          this.offscreenCtx.restore();
        }
        this.isLoadingBaseImage = false;
      };
      img.src = targetData;
    }
  }

  private scratchCanvas: HTMLCanvasElement | null = null;
  private scratchCtx: CanvasRenderingContext2D | null = null;

  private draw(x: number, y: number, context: ToolContext) {
    if (!this.offscreenCtx || !this.layerId || !this.brushCanvas) return;
    const settings = context.settings.brush;
    const localX = x - this.strokeOriginX;
    const localY = y - this.strokeOriginY;
    const localLastX = this.lastX - this.strokeOriginX;
    const localLastY = this.lastY - this.strokeOriginY;

    // Paint only within selection if it exists
    const selection = context.getSelectionCanvas();
    if (
      context.project.selection.hasSelection &&
      context.project.selection.bounds &&
      selection.canvas
    ) {
      const { bounds } = context.project.selection;

      // 1. Prepare or reuse scratch canvas
      if (!this.scratchCanvas) {
        this.scratchCanvas = document.createElement("canvas");
        this.scratchCanvas.width = this.offscreenCanvas!.width;
        this.scratchCanvas.height = this.offscreenCanvas!.height;
        this.scratchCtx = this.scratchCanvas.getContext("2d")!;
      }

      const sctx = this.scratchCtx!;
      const brushSize = this.brushCanvas.width;

      // 2. Calculate bounding box of the current segment to limit the area
      const minSegmentX = Math.floor(Math.min(localX, localLastX) - brushSize);
      const minSegmentY = Math.floor(Math.min(localY, localLastY) - brushSize);
      const segmentWidth = Math.ceil(Math.abs(localX - localLastX) + brushSize * 2);
      const segmentHeight = Math.ceil(Math.abs(localY - localLastY) + brushSize * 2);

      // 3. Clear only the segment area in scratch
      sctx.clearRect(minSegmentX, minSegmentY, segmentWidth, segmentHeight);

      // 4. Draw stroke segments into scratch
      const dist = Math.hypot(localX - localLastX, localY - localLastY);
      const angle = Math.atan2(localY - localLastY, localX - localLastX);
      const spacing = Math.max(1, settings.size * 0.1);

      for (let i = 0; i <= dist; i += spacing) {
        const px = localLastX + Math.cos(angle) * i;
        const py = localLastY + Math.sin(angle) * i;
        sctx.drawImage(
          this.brushCanvas,
          px - this.brushCanvas.width / 2,
          py - this.brushCanvas.height / 2,
        );
      }

      // 5. Clip scratch with selection mask (only in the segment area)
      sctx.save();
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(
        selection.canvas,
        bounds.x - this.strokeOriginX,
        bounds.y - this.strokeOriginY,
      );
      sctx.restore();

      // 6. Draw the clipped scratch onto offscreen
      this.offscreenCtx.drawImage(
        this.scratchCanvas,
        minSegmentX,
        minSegmentY,
        segmentWidth,
        segmentHeight,
        minSegmentX,
        minSegmentY,
        segmentWidth,
        segmentHeight,
      );
    } else {
      // Normal draw without selection
      const dist = Math.hypot(localX - localLastX, localY - localLastY);
      const angle = Math.atan2(localY - localLastY, localX - localLastX);
      const spacing = Math.max(1, settings.size * 0.1);

      for (let i = 0; i <= dist; i += spacing) {
        const px = localLastX + Math.cos(angle) * i;
        const py = localLastY + Math.sin(angle) * i;
        this.offscreenCtx.drawImage(
          this.brushCanvas,
          px - this.brushCanvas.width / 2,
          py - this.brushCanvas.height / 2,
        );
      }
    }
  }

  onDeactivate(context: ToolContext): void {
    context.canvas.style.cursor = "default";
    this.isMouseOver = false;
    this.isDrawing = false;
  }

  getEditingLayerId(): string | null {
    return this.isDrawing ? this.layerId : null;
  }

  getDrawingCanvas(): { canvas: HTMLCanvasElement; x: number; y: number } | null {
    if (this.isDrawing && this.offscreenCanvas) {
      return {
        canvas: this.offscreenCanvas,
        x: this.strokeOriginX,
        y: this.strokeOriginY,
      };
    }
    return null;
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    const settings = context.settings.brush;

    // Brush Preview - Only draws if the mouse is over the canvas
    if (this.isMouseOver) {
      ctx.save();
      ctx.setTransform(
        context.project.zoom,
        0,
        0,
        context.project.zoom,
        context.project.panX,
        context.project.panY,
      );

      const effectiveSize = settings.size * (1 + (1 - settings.hardness) * 0.5);
      const radius = effectiveSize / 2;

      // Outer outline (white)
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1 / context.project.zoom;
      ctx.stroke();

      // Inner outline (black for contrast)
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, radius - 0.5 / context.project.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 0.5 / context.project.zoom;
      ctx.stroke();

      // Center point
      // ctx.beginPath();
      // ctx.arc(
      //   this.mouseX,
      //   this.mouseY,
      //   1 / context.project.zoom,
      //   0,
      //   Math.PI * 2,
      // );
      // ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      // ctx.fill();

      ctx.restore();
    }
  }
}
