/**
 * Purpose: Tool for removing content from raster layers, supporting both brush and pencil modes for soft or hard erasure.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { createHistoryState, HistoryState } from "@/renderer/store/projectStore";
import { useUIStore } from "@store/uiStore";

export class EraserTool extends BaseTool {
  id: ToolId = "eraser";

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

  private isLoadingBaseImage = false;

  private initBrush(size: number, hardness: number) {
    const radius = (size / 2) * (2 - hardness);
    const canvasSize = Math.ceil(size * 1.5 * (2 - hardness));

    this.brushCanvas = document.createElement("canvas");
    this.brushCanvas.width = canvasSize;
    this.brushCanvas.height = canvasSize;
    const ctx = this.brushCanvas.getContext("2d")!;

    const center = canvasSize / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);

    // For the eraser (Brush mode), we draw with solid BLACK on the auxiliary canvas
    // and then use destination-out on the main canvas.
    const opaque = "rgba(0,0,0,1)";
    gradient.addColorStop(0, opaque);

    const hardnessStop = Math.max(0, Math.min(0.99, hardness));
    gradient.addColorStop(hardnessStop, opaque);

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const tSmooth = t * t * (3 - 2 * t);
      const alpha = 1 - tSmooth;
      const stopPosition = hardnessStop + t * (1 - hardnessStop);

      gradient.addColorStop(Math.min(0.999, stopPosition), `rgba(0,0,0,${alpha})`);
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
  }

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
            "Cannot erase on a smart object. Double-click to edit its content.",
            "warning",
          );
      } else {
        useUIStore.getState().showToast("Cannot erase on a non-raster layer", "warning");
      }
      return;
    }

    this.historySnapshot = createHistoryState(context.project);

    this.isDrawing = true;
    this.layerId = activeLayerId;

    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    const settings = context.settings.eraser;

    // If in pencil mode, snap to pixel
    const drawX = settings.mode === "pencil" ? Math.floor(x) : x;
    const drawY = settings.mode === "pencil" ? Math.floor(y) : y;

    this.mouseX = drawX;
    this.mouseY = drawY;
    this.lastX = drawX;
    this.lastY = drawY;

    if (settings.mode === "brush") {
      this.initBrush(settings.size, settings.hardness);
    }

    this.initOffscreen(layer, context);

    const pad = settings.size;
    this.minX = drawX - pad;
    this.minY = drawY - pad;
    this.maxX = drawX + pad;
    this.maxY = drawY + pad;

    this.draw(drawX, drawY, context);
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    const settings = context.settings.eraser;

    const drawX = settings.mode === "pencil" ? Math.floor(x) : x;
    const drawY = settings.mode === "pencil" ? Math.floor(y) : y;

    this.mouseX = drawX;
    this.mouseY = drawY;

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

    const pad = settings.size;
    this.minX = Math.min(this.minX, drawX - pad);
    this.minY = Math.min(this.minY, drawY - pad);
    this.maxX = Math.max(this.maxX, drawX + pad);
    this.maxY = Math.max(this.maxY, drawY + pad);

    this.draw(drawX, drawY, context);
    this.lastX = drawX;
    this.lastY = drawY;
  }

  onMouseUp(e: MouseEvent, context: ToolContext): void {
    if (!this.isDrawing) return;

    if (this.isLoadingBaseImage) {
      setTimeout(() => this.onMouseUp(e, context), 10);
      return;
    }

    this.isDrawing = false;

    if (this.offscreenCanvas && this.layerId && this.offscreenCtx) {
      const layer = context.project.layers.find((l) => l.id === this.layerId)!;
      const isEditingMask = context.project.activeMaskId === layer.id;

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
            description: isEditingMask ? "Eraser Mask" : "Eraser Tool",
            state: this.historySnapshot,
          });
        }
        context.updateProject({ layers, isDirty: true });
      } else {
        // Layer became completely empty
        const layers = context.project.layers.map((l) => {
          if (l.id === this.layerId) {
            if (isEditingMask) {
              return {
                ...l,
                mask: {
                  ...l.mask!,
                  data: "",
                  width: 1,
                  height: 1,
                  x: 0,
                  y: 0,
                },
              };
            } else {
              return {
                ...l,
                data: "",
                width: 1,
                height: 1,
              };
            }
          }
          return l;
        });
        if (this.historySnapshot) {
          context.addHistoryEntry({
            description: isEditingMask ? "Eraser Mask" : "Eraser Tool",
            state: this.historySnapshot,
          });
        }
        context.updateProject({ layers, isDirty: true });
      }
    }

    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.brushCanvas = null;
    this.scratchCanvas = null;
    this.scratchCtx = null;
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

    const settings = context.settings.eraser;
    if (settings.mode === "pencil") {
      this.offscreenCtx.imageSmoothingEnabled = false;
    }

    // Try to get from cache first (synchronously) for speed (only for non-mask layers)
    if (!isEditingMask) {
      const cachedResult = context.getLayerCanvas(layer.id);
      if (cachedResult) {
        this.offscreenCtx.clearRect(0, 0, width, height);
        this.offscreenCtx.drawImage(cachedResult.canvas, this.STROKE_PADDING, this.STROKE_PADDING);
        if (cachedResult.ready) return;
      }
    }

    if (targetData) {
      this.isLoadingBaseImage = true;
      const img = new Image();
      img.onload = () => {
        if (this.offscreenCtx) {
          this.offscreenCtx.save();
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
    if (!this.offscreenCtx || !this.layerId) return;
    const settings = context.settings.eraser;

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
      const brushSize =
        settings.mode === "brush" && this.brushCanvas ? this.brushCanvas.width : settings.size;

      // 2. Calculate bounding box
      const minSegmentX = Math.floor(Math.min(localX, localLastX) - brushSize);
      const minSegmentY = Math.floor(Math.min(localY, localLastY) - brushSize);
      const segmentWidth = Math.ceil(Math.abs(localX - localLastX) + brushSize * 2);
      const segmentHeight = Math.ceil(Math.abs(localY - localLastY) + brushSize * 2);

      // 3. Clear segment area in scratch
      sctx.clearRect(minSegmentX, minSegmentY, segmentWidth, segmentHeight);

      if (settings.mode === "pencil") {
        sctx.imageSmoothingEnabled = false;
        sctx.fillStyle = "black";

        let x0 = Math.floor(localLastX);
        let y0 = Math.floor(localLastY);
        const x1 = Math.floor(localX);
        const y1 = Math.floor(localY);
        const dx = Math.abs(x1 - x0);
        const sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0);
        const sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;

        while (true) {
          this.drawPixelOnCtx(sctx, x0, y0, settings.size, settings.shape);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x0 += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y0 += sy;
          }
        }
      } else if (settings.mode === "brush" && this.brushCanvas) {
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
      }

      // 4. Clip the erasure with selection mask
      sctx.save();
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(
        selection.canvas,
        bounds.x - this.strokeOriginX,
        bounds.y - this.strokeOriginY,
      );
      sctx.restore();

      // 5. Apply clipped erasure to offscreen with destination-out
      this.offscreenCtx.save();
      this.offscreenCtx.globalCompositeOperation = "destination-out";
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
      this.offscreenCtx.restore();
    } else {
      // No selection, draw directly with destination-out
      this.offscreenCtx.save();
      this.offscreenCtx.globalCompositeOperation = "destination-out";

      if (settings.mode === "brush" && this.brushCanvas) {
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
      } else {
        // Pencil mode (Bresenham)
        this.offscreenCtx.fillStyle = "black";
        let x0 = Math.floor(localLastX);
        let y0 = Math.floor(localLastY);
        const x1 = Math.floor(localX);
        const y1 = Math.floor(localY);

        const dx = Math.abs(x1 - x0);
        const sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0);
        const sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;

        while (true) {
          this.drawPixel(x0, y0, settings.size, settings.shape);

          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x0 += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y0 += sy;
          }
        }
      }
      this.offscreenCtx.restore();
    }
  }

  private drawPixelOnCtx(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    shape: "circle" | "square",
  ) {
    if (shape === "square") {
      ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
    } else {
      if (size === 1) {
        ctx.fillRect(x, y, 1, 1);
        return;
      }
      if (size % 2 !== 0) {
        const r = (size - 1) / 2;
        for (let dy = -r; dy <= r; dy++) {
          const dx = Math.floor(Math.sqrt(r * r - dy * dy));
          ctx.fillRect(x - dx, y + dy, 2 * dx + 1, 1);
        }
      } else {
        const radius = size / 2;
        const topLeftX = x - radius;
        const topLeftY = y - radius;
        for (let py = 0; py < size; py++) {
          const dist_y = py + 0.5 - radius;
          const max_dist_x_sq = radius * radius - dist_y * dist_y;
          if (max_dist_x_sq < 0) continue;
          const max_dist_x = Math.sqrt(max_dist_x_sq);
          const x_min = Math.ceil(-max_dist_x + radius - 0.5);
          const x_max = Math.floor(max_dist_x + radius - 0.5);
          const draw_width = x_max - x_min + 1;
          if (draw_width > 0) {
            ctx.fillRect(topLeftX + x_min, topLeftY + py, draw_width, 1);
          }
        }
      }
    }
  }

  private drawPixel(x: number, y: number, size: number, shape: "circle" | "square") {
    if (!this.offscreenCtx) return;

    if (shape === "square") {
      this.offscreenCtx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
    } else {
      // Circle shape (pixelated)
      if (size === 1) {
        this.offscreenCtx.fillRect(x, y, 1, 1);
        return;
      }

      if (size % 2 !== 0) {
        const r = (size - 1) / 2;
        for (let dy = -r; dy <= r; dy++) {
          const dx = Math.floor(Math.sqrt(r * r - dy * dy));
          this.offscreenCtx.fillRect(x - dx, y + dy, 2 * dx + 1, 1);
        }
      } else {
        const radius = size / 2;
        const topLeftX = x - radius;
        const topLeftY = y - radius;

        for (let py = 0; py < size; py++) {
          const dist_y = py + 0.5 - radius;
          const max_dist_x_sq = radius * radius - dist_y * dist_y;
          if (max_dist_x_sq < 0) continue;
          const max_dist_x = Math.sqrt(max_dist_x_sq);
          const x_min = Math.ceil(-max_dist_x + radius - 0.5);
          const x_max = Math.floor(max_dist_x + radius - 0.5);
          const draw_width = x_max - x_min + 1;
          if (draw_width > 0) {
            this.offscreenCtx.fillRect(topLeftX + x_min, topLeftY + py, draw_width, 1);
          }
        }
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
    const settings = context.settings.eraser;

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

      const size = settings.size;
      const zoom = context.project.zoom;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1 / zoom;

      // If pencil mode and square shape
      if (settings.mode === "pencil" && settings.shape === "square") {
        ctx.strokeRect(
          this.mouseX - Math.floor(size / 2),
          this.mouseY - Math.floor(size / 2),
          size,
          size,
        );
      } else {
        // Brush mode or Pencil mode with circle
        ctx.beginPath();
        ctx.arc(this.mouseX, this.mouseY, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 0.5 / zoom;
      const offset = 0.5 / zoom;

      if (settings.mode === "pencil" && settings.shape === "square") {
        ctx.strokeRect(
          this.mouseX - Math.floor(size / 2) + offset,
          this.mouseY - Math.floor(size / 2) + offset,
          size - offset * 2,
          size - offset * 2,
        );
      } else {
        ctx.beginPath();
        ctx.arc(this.mouseX, this.mouseY, Math.max(0, size / 2 - offset), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, 1 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();

      ctx.restore();
    }
  }
}
