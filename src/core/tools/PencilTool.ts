/**
 * Purpose: Pixel-perfect drawing tool with support for different sizes and shapes, optimized with offscreen buffering and bounding box calculations.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { createHistoryState, HistoryState } from "@/renderer/store/projectStore";
import { useUIStore } from "@store/uiStore";

export class PencilTool extends BaseTool {
  id: ToolId = "pencil";

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

  // For bounding box optimization
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  private historySnapshot: HistoryState | null = null;

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
    // Snap to pixel grid
    const snapX = Math.floor(x);
    const snapY = Math.floor(y);

    this.mouseX = snapX;
    this.mouseY = snapY;
    this.lastX = snapX;
    this.lastY = snapY;

    const settings = context.settings.pencil;
    this.initOffscreen(layer, context);

    const pad = settings.size;
    this.minX = snapX - pad;
    this.minY = snapY - pad;
    this.maxX = snapX + pad;
    this.maxY = snapY + pad;

    this.draw(snapX, snapY, context);
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    const snapX = Math.floor(x);
    const snapY = Math.floor(y);

    this.mouseX = snapX;
    this.mouseY = snapY;

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

    const settings = context.settings.pencil;
    const pad = settings.size;

    this.minX = Math.min(this.minX, snapX - pad);
    this.minY = Math.min(this.minY, snapY - pad);
    this.maxX = Math.max(this.maxX, snapX + pad);
    this.maxY = Math.max(this.maxY, snapY + pad);

    this.draw(snapX, snapY, context);
    this.lastX = snapX;
    this.lastY = snapY;
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
            description: isEditingMask ? "Pencil Mask" : "Pencil Tool",
            state: this.historySnapshot,
          });
        }
        context.updateProject({ layers, isDirty: true });
      }
    }

    this.offscreenCanvas = null;
    this.offscreenCtx = null;
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

    // Pencil needs crisp pixels
    this.offscreenCtx.imageSmoothingEnabled = false;

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
    const settings = context.settings.pencil;

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
      const size = settings.size;

      // 2. Calculate bounding box of the current segment
      const minSegmentX = Math.floor(Math.min(localX, localLastX) - size);
      const minSegmentY = Math.floor(Math.min(localY, localLastY) - size);
      const segmentWidth = Math.ceil(Math.abs(localX - localLastX) + size * 2);
      const segmentHeight = Math.ceil(Math.abs(localY - localLastY) + size * 2);

      // 3. Clear only segment area
      sctx.clearRect(minSegmentX, minSegmentY, segmentWidth, segmentHeight);
      sctx.imageSmoothingEnabled = false;
      sctx.fillStyle = settings.color;

      // 4. Bresenham's line algorithm on sctx
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

      // 5. Clip scratch with selection mask
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
      this.offscreenCtx.save();
      // this.offscreenCtx.fillStyle = settings.color;
      this.offscreenCtx.fillStyle = context.foregroundColor;

      // Bresenham's line algorithm
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
    const settings = context.settings.pencil;

    // Pencil Preview
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
      const x = this.mouseX;
      const y = this.mouseY;
      const zoom = context.project.zoom;

      // 1. External Outline (White)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1 / zoom;

      if (settings.shape === "square") {
        ctx.strokeRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2. Internal Outline (Black for contrast)
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 0.5 / zoom;
      const offset = 0.5 / zoom;

      if (settings.shape === "square") {
        ctx.strokeRect(
          x - Math.floor(size / 2) + offset,
          y - Math.floor(size / 2) + offset,
          size - offset * 2,
          size - offset * 2,
        );
      } else {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0, size / 2 - offset), 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3. Center point
      // ctx.beginPath();
      // ctx.arc(x, y, 1 / zoom, 0, Math.PI * 2);
      // ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      // ctx.fill();

      ctx.restore();
    }
  }
}
