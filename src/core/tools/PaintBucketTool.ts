/**
 * Purpose: Implementation of the Paint Bucket tool for filling areas with color based on tolerance and contiguity.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import {
  createHistoryState,
  HistoryState,
  useProjectStore,
  Layer,
} from "@/renderer/store/projectStore";
import { useUIStore } from "@store/uiStore";

export class PaintBucketTool extends BaseTool {
  id: ToolId = "paintBucket";

  private historySnapshot: HistoryState | null = null;

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    if (e.button !== 0) return;

    const settings = context.settings.paintBucket || {
      tolerance: 40,
      antiAliasing: true,
      contiguous: true,
      fillTarget: "raster",
    };

    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    const clickX = Math.floor(x);
    const clickY = Math.floor(y);

    if (settings.fillTarget === "raster") {
      const activeLayerId = context.project.activeLayerId;
      if (!activeLayerId) return;

      if (context.isLayerLocked(activeLayerId) || !context.isLayerVisible(activeLayerId)) return;

      const layer = context.project.layers.find((l) => l.id === activeLayerId);
      if (!layer) return;

      const isEditingMask = context.project.activeMaskId === layer.id;

      if (layer.type !== "raster" && !isEditingMask) {
        if (layer.type === "smart_object") {
          useUIStore
            .getState()
            .showToast(
              "Cannot fill on a smart object. Double-click to edit its content.",
              "warning",
            );
        } else {
          useUIStore.getState().showToast("Cannot fill on a non-raster layer", "warning");
        }
        return;
      }

      if (isEditingMask && !layer.mask) return;

      // Check if click is within layer bounds
      if (
        clickX < layer.x ||
        clickX >= layer.x + layer.width ||
        clickY < layer.y ||
        clickY >= layer.y + layer.height
      ) {
        return;
      }

      this.historySnapshot = createHistoryState(context.project);
      this.performFill(clickX, clickY, context, layer);
    } else {
      this.performColorFill(clickX, clickY, context);
    }
  }

  private async performColorFill(clickX: number, clickY: number, context: ToolContext) {
    const activeLayerId = context.project.activeLayerId;
    let sampleCanvas: HTMLCanvasElement | null = null;
    let offsetX = 0;
    let offsetY = 0;

    if (activeLayerId) {
      const layer = context.project.layers.find((l) => l.id === activeLayerId);
      if (layer && layer.type === "raster") {
        sampleCanvas = await context.ensureLayerCanvas(layer);
        offsetX = layer.x;
        offsetY = layer.y;
      }
    }

    // If no raster layer is selected to sample from, we can't do a smart fill.
    // However, we could sample from merged layers if the engine supported it.
    // For now, let's require a raster layer or fill the whole selection/canvas.
    if (!sampleCanvas) {
      // If there's a selection, we can just fill that.
      if (context.project.selection.hasSelection && context.project.selection.mask) {
        this.createColorFillLayer(context, context.project.selection.mask);
        return;
      }

      useUIStore.getState().showToast("Select a raster layer to sample from", "info");
      return;
    }

    const localX = clickX - offsetX;
    const localY = clickY - offsetY;

    // click must be within sample canvas
    if (localX < 0 || localX >= sampleCanvas.width || localY < 0 || localY >= sampleCanvas.height) {
      if (context.project.selection.hasSelection && context.project.selection.mask) {
        this.createColorFillLayer(context, context.project.selection.mask);
        return;
      }
      return;
    }

    const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const data = imageData.data;

    const targetIdx = (localY * sampleCanvas.width + localX) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];
    const targetA = data[targetIdx + 3];

    const settings = context.settings.paintBucket || {
      tolerance: 40,
      antiAliasing: true,
      contiguous: true,
    };

    // Create a new canvas for the mask
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = context.project.width;
    maskCanvas.height = context.project.height;
    const mctx = maskCanvas.getContext("2d")!;
    mctx.fillStyle = "black";
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    const maskImageData = mctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const mData = maskImageData.data;

    if (settings.contiguous) {
      this.floodFillMask(
        data,
        sampleCanvas.width,
        sampleCanvas.height,
        offsetX,
        offsetY,
        localX,
        localY,
        targetR,
        targetG,
        targetB,
        targetA,
        mData,
        maskCanvas.width,
        maskCanvas.height,
        settings.tolerance,
      );
    } else {
      this.globalReplaceMask(
        data,
        sampleCanvas.width,
        sampleCanvas.height,
        offsetX,
        offsetY,
        targetR,
        targetG,
        targetB,
        targetA,
        mData,
        maskCanvas.width,
        maskCanvas.height,
        settings.tolerance,
      );
    }

    mctx.putImageData(maskImageData, 0, 0);

    // If there is a selection, intersect with it
    if (context.project.selection.hasSelection && context.project.selection.mask) {
      const selImg = new Image();
      await new Promise((resolve) => {
        selImg.onload = resolve;
        selImg.src = context.project.selection.mask!;
      });
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(
        selImg,
        context.project.selection.bounds!.x,
        context.project.selection.bounds!.y,
      );
    }

    this.createColorFillLayer(context, maskCanvas.toDataURL());
  }

  private async performFill(clickX: number, clickY: number, context: ToolContext, layer: any) {
    const canvas = await context.ensureLayerCanvas(layer);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const localX = clickX - layer.x;
    const localY = clickY - layer.y;

    const targetIdx = (localY * canvas.width + localX) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];
    const targetA = data[targetIdx + 3];

    const settings = context.settings.paintBucket || {
      tolerance: 40,
      antiAliasing: true,
      contiguous: true,
    };
    const fillColor = this.hexToRgba(context.foregroundColor);

    // If target is same as fill color, do nothing (to avoid infinite loops or redundant work)
    if (
      this.colorsMatch(
        targetR,
        targetG,
        targetB,
        targetA,
        fillColor.r,
        fillColor.g,
        fillColor.b,
        fillColor.a,
        0,
      )
    ) {
      return;
    }

    if (settings.contiguous) {
      this.floodFill(
        data,
        canvas.width,
        canvas.height,
        localX,
        localY,
        targetR,
        targetG,
        targetB,
        targetA,
        fillColor,
        settings.tolerance,
      );
    } else {
      this.globalReplace(data, targetR, targetG, targetB, targetA, fillColor, settings.tolerance);
    }

    ctx.putImageData(imageData, 0, 0);

    // Update layer
    const dataUrl = canvas.toDataURL("image/png");
    context.setLayerCache(layer.id, canvas);

    const layers = context.project.layers.map((l) => {
      if (l.id === layer.id) {
        return { ...l, data: dataUrl };
      }
      return l;
    });

    if (this.historySnapshot) {
      context.addHistoryEntry({
        description: "Paint Bucket",
        state: this.historySnapshot,
      });
    }
    context.updateProject({ layers, isDirty: true });
  }

  private floodFill(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    startX: number,
    startY: number,
    tr: number,
    tg: number,
    tb: number,
    ta: number,
    fill: { r: number; g: number; b: number; a: number },
    tolerance: number,
  ) {
    const stack: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(width * height);

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      if (visited[idx]) continue;
      visited[idx] = 1;

      const pixelIdx = idx * 4;
      if (
        this.colorsMatch(
          data[pixelIdx],
          data[pixelIdx + 1],
          data[pixelIdx + 2],
          data[pixelIdx + 3],
          tr,
          tg,
          tb,
          ta,
          tolerance,
        )
      ) {
        data[pixelIdx] = fill.r;
        data[pixelIdx + 1] = fill.r;
        data[pixelIdx + 1] = fill.g;
        data[pixelIdx + 2] = fill.b;
        data[pixelIdx + 3] = fill.a;

        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
      }
    }
  }

  private globalReplace(
    data: Uint8ClampedArray,
    tr: number,
    tg: number,
    tb: number,
    ta: number,
    fill: { r: number; g: number; b: number; a: number },
    tolerance: number,
  ) {
    for (let i = 0; i < data.length; i += 4) {
      if (
        this.colorsMatch(data[i], data[i + 1], data[i + 2], data[i + 3], tr, tg, tb, ta, tolerance)
      ) {
        data[i] = fill.r;
        data[i + 1] = fill.g;
        data[i + 2] = fill.b;
        data[i + 3] = fill.a;
      }
    }
  }

  private createColorFillLayer(context: ToolContext, maskData: string) {
    const layerCount = context.project.layers.filter((l) => l.type === "color_fill").length;
    const newLayer: Partial<Layer> = {
      name: `Color Fill ${layerCount + 1}`,
      type: "color_fill",
      colorFill: { color: context.foregroundColor },
      mask: {
        data: maskData,
        x: 0,
        y: 0,
        width: context.project.width,
        height: context.project.height,
        enabled: true,
        linked: true,
      },
    };

    const addLayer = useProjectStore.getState().addLayer;
    addLayer(context.project.id, newLayer);
  }

  private floodFillMask(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    startX: number,
    startY: number,
    tr: number,
    tg: number,
    tb: number,
    ta: number,
    maskData: Uint8ClampedArray,
    mWidth: number,
    _mHeight: number,
    tolerance: number,
  ) {
    const stack: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(width * height);

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      if (visited[idx]) continue;
      visited[idx] = 1;

      const pixelIdx = idx * 4;
      if (
        this.colorsMatch(
          data[pixelIdx],
          data[pixelIdx + 1],
          data[pixelIdx + 2],
          data[pixelIdx + 3],
          tr,
          tg,
          tb,
          ta,
          tolerance,
        )
      ) {
        // Mark in mask (project space)
        const projX = x + offsetX;
        const projY = y + offsetY;

        if (projX >= 0 && projX < mWidth && projY >= 0 && projY < _mHeight) {
          const mIdx = (projY * mWidth + projX) * 4;
          maskData[mIdx] = 255;
          maskData[mIdx + 1] = 255;
          maskData[mIdx + 2] = 255;
          maskData[mIdx + 3] = 255;
        }

        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
      }
    }
  }

  private globalReplaceMask(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    tr: number,
    tg: number,
    tb: number,
    ta: number,
    maskData: Uint8ClampedArray,
    mWidth: number,
    _mHeight: number,
    tolerance: number,
  ) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (
          this.colorsMatch(
            data[i],
            data[i + 1],
            data[i + 2],
            data[i + 3],
            tr,
            tg,
            tb,
            ta,
            tolerance,
          )
        ) {
          const projX = x + offsetX;
          const projY = y + offsetY;

          if (projX >= 0 && projX < mWidth && projY >= 0 && projY < _mHeight) {
            const mIdx = (projY * mWidth + projX) * 4;
            maskData[mIdx] = 255;
            maskData[mIdx + 1] = 255;
            maskData[mIdx + 2] = 255;
            maskData[mIdx + 3] = 255;
          }
        }
      }
    }
  }

  private colorsMatch(
    r1: number,
    g1: number,
    b1: number,
    a1: number,
    r2: number,
    g2: number,
    b2: number,
    a2: number,
    tolerance: number,
  ): boolean {
    if (tolerance === 0) {
      return r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2;
    }
    // Tolerance is 0-255. Max distance is sqrt(255^2 * 4) = 510.
    // We can normalize tolerance or just compare directly.
    // Photoshop's tolerance 32 means a distance of 32 in each channel? No, it's usually sum of differences or euclidean.
    // Let's use a simpler per-channel check for now to match common expectations.
    return (
      Math.abs(r1 - r2) <= tolerance &&
      Math.abs(g1 - g2) <= tolerance &&
      Math.abs(b1 - b2) <= tolerance &&
      Math.abs(a1 - a2) <= tolerance
    );
  }

  private hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
    let r = 0,
      g = 0,
      b = 0;
    const a = 255;
    if (hex.startsWith("#")) {
      if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
      } else if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      }
    }
    return { r, g, b, a };
  }

  onDeactivate(context: ToolContext): void {
    context.canvas.style.cursor = "default";
  }
}
