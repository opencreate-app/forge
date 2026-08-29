/**
 * Purpose: Tool for creating and modifying selections using rectangular or elliptical shapes, supporting various modes like replace, unite, subtract, and intersect.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { createHistoryState, HistoryState, useProjectStore } from "@/renderer/store/projectStore";
import { useUIStore } from "@/renderer/store/uiStore";

const AUTO_SCROLL_MARGIN = 48;
const AUTO_SCROLL_MAX_SPEED = 20;
const SELECTION_ARROW_HISTORY_DELAY = 400;

export class SelectTool extends BaseTool {
  id: ToolId = "select";

  private isSelecting = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;

  private isMovingSelection = false;
  private selectionMoveStart = { x: 0, y: 0 };
  private selectionMoveStartBounds = { x: 0, y: 0, width: 0, height: 0 };

  private historySnapshot: HistoryState | null = null;
  private selectionArrowHistory: HistoryState | null = null;
  private selectionArrowHistoryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];
  private relativeSnapPointsX: number[] = [];
  private relativeSnapPointsY: number[] = [];
  private lastPointerPosition = { x: 0, y: 0 };
  private autoScrollVelocity = { x: 0, y: 0 };
  private selectionPreviewShift = false;

  async onMouseDown(e: MouseEvent, context: ToolContext): Promise<void> {
    if (e.button !== 0) return;

    this.flushSelectionArrowHistory(context);

    if (context.project.selection.floatingLayer) {
      const committed = await context.commitFloatingLayer();
      if (!committed) return;
    }

    this.historySnapshot = createHistoryState(context.project);

    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    this.lastPointerPosition = { x: e.offsetX, y: e.offsetY };
    this.autoScrollVelocity = { x: 0, y: 0 };
    this.selectionPreviewShift = e.shiftKey;

    // The mode should already be correct in the store thanks to listeners in App.tsx
    // but we capture it here to keep the same mode until the end of the click
    const { mode } = context.settings.select;
    (this as any).effectiveMode = mode;

    // Check if clicked inside existing selection to move it
    if (context.project.selection.hasSelection && context.project.selection.bounds) {
      const { bounds } = context.project.selection;
      const canMove = mode === "replace" || mode === "unite";

      if (canMove && this.isPointInSelection(context, x, y)) {
        this.isMovingSelection = true;
        context.setInteracting(true);
        this.selectionMoveStart = { x, y };
        this.selectionMoveStartBounds = { ...bounds };
        this.detectSelectionFeatures(context);
        return;
      }
    }

    this.isSelecting = true;
    context.setInteracting(true);

    let startX = x;
    let startY = y;

    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;

    const vSnaps = [0, context.project.width / 2, context.project.width];
    const hSnaps = [0, context.project.height / 2, context.project.height];

    if (showGuides && snapToGuides) {
      const guides = context.project.guides || [];
      vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
      hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
    }

    const snapMargin = 5 / context.project.zoom;

    let bestDiffX = Infinity;
    let bestGuideX = null;
    for (const snapPos of vSnaps) {
      const diff = snapPos - startX;
      if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
        bestDiffX = diff;
        bestGuideX = snapPos;
      }
    }
    if (bestGuideX !== null) {
      startX = bestGuideX;
      this.activeSnapLines.push({ type: "vertical", position: bestGuideX });
    }

    let bestDiffY = Infinity;
    let bestGuideY = null;
    for (const snapPos of hSnaps) {
      const diff = snapPos - startY;
      if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
        bestDiffY = diff;
        bestGuideY = snapPos;
      }
    }
    if (bestGuideY !== null) {
      startY = bestGuideY;
      this.activeSnapLines.push({ type: "horizontal", position: bestGuideY });
    }

    this.startX = Math.round(startX);
    this.startY = Math.round(startY);
    this.currentX = this.startX;
    this.currentY = this.startY;

    if (mode === "replace") {
      this.clearSelection(context);
    }
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    this.lastPointerPosition = { x: e.offsetX, y: e.offsetY };
    this.activeSnapLines = [];
    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;
    const snapMargin = 5 / context.project.zoom;
    const guides = context.project.guides || [];

    if (this.isMovingSelection) {
      context.canvas.style.cursor = "move";
      let dx = x - this.selectionMoveStart.x;
      let dy = y - this.selectionMoveStart.y;

      const b = this.selectionMoveStartBounds;
      const potentialX = b.x + dx;
      const potentialY = b.y + dy;

      let bestDiffX = Infinity;
      let bestGuideX = null;

      const vSnaps = [0, context.project.width / 2, context.project.width];
      if (showGuides && snapToGuides) {
        vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
      }

      for (const snapPos of vSnaps) {
        for (const relX of this.relativeSnapPointsX) {
          const worldPos = potentialX + relX;
          const diff = snapPos - worldPos;
          if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
            bestDiffX = diff;
            bestGuideX = snapPos;
          }
        }
      }

      if (bestGuideX !== null) {
        dx += bestDiffX;
        this.activeSnapLines.push({ type: "vertical", position: bestGuideX });
      }

      let bestDiffY = Infinity;
      let bestGuideY = null;

      const hSnaps = [0, context.project.height / 2, context.project.height];
      if (showGuides && snapToGuides) {
        hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
      }

      for (const snapPos of hSnaps) {
        for (const relY of this.relativeSnapPointsY) {
          const worldPos = potentialY + relY;
          const diff = snapPos - worldPos;
          if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
            bestDiffY = diff;
            bestGuideY = snapPos;
          }
        }
      }

      if (bestGuideY !== null) {
        dy += bestDiffY;
        this.activeSnapLines.push({ type: "horizontal", position: bestGuideY });
      }

      const newBounds = {
        ...this.selectionMoveStartBounds,
        x: Math.round(this.selectionMoveStartBounds.x + dx),
        y: Math.round(this.selectionMoveStartBounds.y + dy),
      };

      context.updateProject({
        selection: {
          ...context.project.selection,
          bounds: newBounds,
        },
      });
      return;
    }

    if (this.isSelecting) {
      this.selectionPreviewShift = e.shiftKey;
      this.updateAutoScrollVelocity(e.offsetX, e.offsetY, context);
      this.updateSelectionPreview(x, y, context, e.shiftKey);
      return;
    }

    // Hover logic
    if (context.project.selection.hasSelection && this.isPointInSelection(context, x, y)) {
      context.canvas.style.cursor = "move";
    } else {
      context.canvas.style.cursor = "crosshair";
    }
  }

  onMouseUp(e: MouseEvent, context: ToolContext): void {
    if (this.isMovingSelection) {
      this.isMovingSelection = false;
      this.activeSnapLines = [];
      if (this.historySnapshot) {
        context.addHistoryEntry({
          description: "Move Selection",
          state: this.historySnapshot,
        });
      }
      context.setInteracting(false);
      context.updateSelectionEdges();
      this.historySnapshot = null;
      return;
    }

    if (this.isSelecting) {
      this.isSelecting = false;
      this.activeSnapLines = [];
      this.autoScrollVelocity = { x: 0, y: 0 };
      context.setInteracting(false);

      let startX = this.startX;
      let startY = this.startY;
      const currentX = this.currentX;
      const currentY = this.currentY;

      if (e.altKey) {
        const dx = currentX - startX;
        const dy = currentY - startY;
        startX = this.startX - dx;
        startY = this.startY - dy;
      }

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width < 1 || height < 1) {
        // Simple click outside selection clears it if mode is replace
        if (context.settings.select.mode === "replace") {
          this.clearSelection(context);
        }
        this.historySnapshot = null;
        return;
      }

      this.updateSelectionWithRect(context, { x, y, width, height });
    }
    this.historySnapshot = null;
  }

  onKeyDown(e: KeyboardEvent, context: ToolContext): boolean {
    const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key);
    if (isArrow && context.project.selection.hasSelection) {
      const bounds = context.project.selection.bounds;
      if (!bounds) return false;

      e.preventDefault();
      const distance = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -distance : e.key === "ArrowRight" ? distance : 0;
      const dy = e.key === "ArrowUp" ? -distance : e.key === "ArrowDown" ? distance : 0;

      if (!this.selectionArrowHistory) {
        this.selectionArrowHistory = createHistoryState(context.project);
      }

      context.updateProject({
        selection: {
          ...context.project.selection,
          bounds: { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
        },
        isDirty: true,
      });
      context.updateSelectionEdges();
      this.scheduleSelectionArrowHistoryFlush(context);
      return true;
    }

    this.flushSelectionArrowHistory(context);

    if (e.key !== "Delete" && e.key !== "Backspace") return false;

    e.preventDefault();
    e.stopPropagation();

    if (context.project.selection.hasSelection) {
      void context.deleteSelectionContents();
      return true;
    }

    const layerIds =
      context.project.selectedLayerIds.length > 0
        ? context.project.selectedLayerIds
        : context.project.activeLayerId
          ? [context.project.activeLayerId]
          : [];

    if (layerIds.length > 0) {
      useProjectStore.getState().removeLayers(context.project.id, layerIds);
    }

    return true;
  }

  private isPointInSelection(context: ToolContext, px: number, py: number): boolean {
    const { selection } = context.project;
    if (!selection.hasSelection || !selection.bounds) return false;

    const localX = Math.floor(px - selection.bounds.x);
    const localY = Math.floor(py - selection.bounds.y);

    if (
      localX < 0 ||
      localX >= selection.bounds.width ||
      localY < 0 ||
      localY >= selection.bounds.height
    ) {
      return false;
    }

    const { ctx } = context.getSelectionCanvas();
    const pixelData = ctx.getImageData(localX, localY, 1, 1).data;
    return pixelData[3] > 0;
  }

  private async clearSelection(context: ToolContext) {
    // if (context.project.selection.hasSelection) {
    //   if (this.historySnapshot) {
    //     context.addHistoryEntry({
    //       description: "Deselect Tool",
    //       state: this.historySnapshot,
    //     });
    //   }
    // }
    await context.clearSelection();
  }

  private async updateSelectionWithRect(
    context: ToolContext,
    rect: { x: number; y: number; width: number; height: number },
  ) {
    const mode = (this as any).effectiveMode || context.settings.select.mode;

    if (this.historySnapshot) {
      context.addHistoryEntry({
        description: "Select Tool",
        state: this.historySnapshot,
      });
    }

    // Commit before applying any selection change.
    if (context.project.selection.floatingLayer) {
      const committed = await context.commitFloatingLayer();
      if (!committed) return;
    }

    const { canvas: selCanvas, ctx: selCtx } = context.getSelectionCanvas();
    const { selection } = context.project;

    if (!selection.hasSelection || mode === "replace") {
      // New selection
      selCanvas.width = rect.width;
      selCanvas.height = rect.height;
      selCtx.fillStyle = "white";

      const { shape } = context.settings.select;
      if (shape === "ellipse") {
        selCtx.beginPath();
        selCtx.ellipse(
          rect.width / 2,
          rect.height / 2,
          rect.width / 2,
          rect.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        selCtx.fill();
      } else {
        selCtx.fillRect(0, 0, rect.width, rect.height);
      }

      const mask = selCanvas.toDataURL();
      context.setLastSelectionMask(mask);
      context.updateProject({
        selection: {
          hasSelection: true,
          bounds: rect,
          mask,
        },
      });
    } else {
      // Modify existing selection
      const oldBounds = selection.bounds!;
      const newBounds = {
        x: Math.min(oldBounds.x, rect.x),
        y: Math.min(oldBounds.y, rect.y),
        right: Math.max(oldBounds.x + oldBounds.width, rect.x + rect.width),
        bottom: Math.max(oldBounds.y + oldBounds.height, rect.y + rect.height),
      };
      const finalWidth = newBounds.right - newBounds.x;
      const finalHeight = newBounds.bottom - newBounds.y;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = finalWidth;
      tempCanvas.height = finalHeight;
      const tempCtx = tempCanvas.getContext("2d")!;

      // Draw old selection on new canvas with offset
      const offsetX = oldBounds.x - newBounds.x;
      const offsetY = oldBounds.y - newBounds.y;
      tempCtx.drawImage(selCanvas, offsetX, offsetY);

      // Set composite operation for selected mode
      switch (mode) {
        case "unite":
          tempCtx.globalCompositeOperation = "source-over";
          break;
        case "subtract":
          tempCtx.globalCompositeOperation = "destination-out";
          break;
        case "intersect":
          tempCtx.globalCompositeOperation = "destination-in";
          break;
      }

      // Draw new rectangle or ellipse
      const { shape } = context.settings.select;
      tempCtx.fillStyle = "white";
      const rx = rect.x - newBounds.x;
      const ry = rect.y - newBounds.y;
      const rw = rect.width;
      const rh = rect.height;

      if (shape === "ellipse") {
        tempCtx.beginPath();
        tempCtx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        tempCtx.fill();
      } else {
        tempCtx.fillRect(rx, ry, rw, rh);
      }

      // Back to normal
      tempCtx.globalCompositeOperation = "source-over";

      // Check if there are still pixels in selection
      const imageData = tempCtx.getImageData(0, 0, finalWidth, finalHeight);
      const data = imageData.data;
      let hasSelection = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          hasSelection = true;
          break;
        }
      }

      if (hasSelection) {
        selCanvas.width = finalWidth;
        selCanvas.height = finalHeight;
        selCtx.drawImage(tempCanvas, 0, 0);

        const mask = selCanvas.toDataURL();
        context.setLastSelectionMask(mask);
        context.updateProject({
          selection: {
            hasSelection: true,
            bounds: {
              x: newBounds.x,
              y: newBounds.y,
              width: finalWidth,
              height: finalHeight,
            },
            mask,
          },
        });
      } else {
        this.clearSelection(context);
      }
    }

    context.updateSelectionEdges();
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (this.isSelecting) {
      if (this.autoScrollVelocity.x !== 0 || this.autoScrollVelocity.y !== 0) {
        context.updateViewport(
          context.project.zoom,
          context.project.panX + this.autoScrollVelocity.x,
          context.project.panY + this.autoScrollVelocity.y,
        );
        this.activeSnapLines = [];
        const { x, y } = context.screenToProject(
          this.lastPointerPosition.x,
          this.lastPointerPosition.y,
        );
        this.updateSelectionPreview(x, y, context, this.selectionPreviewShift);
      }

      ctx.save();
      context.setViewportTransform(
        context.project.zoom,
        context.project.panX,
        context.project.panY,
      );

      const startX = this.startX;
      const startY = this.startY;
      const currentX = this.currentX;
      const currentY = this.currentY;

      // For preview, just draw the mouse rectangle
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      const { shape } = context.settings.select;

      ctx.beginPath();
      if (shape === "ellipse") {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.rect(x, y, w, h);
      }

      ctx.strokeStyle = "white";
      ctx.lineWidth = 1 / context.project.zoom;
      ctx.stroke();

      ctx.beginPath();
      if (shape === "ellipse") {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.strokeStyle = "black";
      ctx.setLineDash([4 / context.project.zoom, 4 / context.project.zoom]);
      ctx.stroke();

      ctx.restore();
    }

    if (this.activeSnapLines.length > 0) {
      ctx.save();
      context.setViewportTransform(
        context.project.zoom,
        context.project.panX,
        context.project.panY,
      );
      ctx.strokeStyle = "red";
      ctx.lineWidth = 1 / context.project.zoom;

      const viewportWidth = context.viewportWidth / context.project.zoom;
      const viewportHeight = context.viewportHeight / context.project.zoom;
      const startX = -context.project.panX / context.project.zoom;
      const startY = -context.project.panY / context.project.zoom;

      for (const line of this.activeSnapLines) {
        ctx.beginPath();
        if (line.type === "horizontal") {
          ctx.moveTo(startX, line.position);
          ctx.lineTo(startX + viewportWidth, line.position);
        } else {
          ctx.moveTo(line.position, startY);
          ctx.lineTo(line.position, startY + viewportHeight);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  onDeactivate(context: ToolContext): void {
    this.flushSelectionArrowHistory(context);
    this.isSelecting = false;
    this.isMovingSelection = false;
    this.activeSnapLines = [];
    this.autoScrollVelocity = { x: 0, y: 0 };
    context.setInteracting(false);
  }

  private scheduleSelectionArrowHistoryFlush(context: ToolContext): void {
    if (this.selectionArrowHistoryTimer) {
      clearTimeout(this.selectionArrowHistoryTimer);
    }

    this.selectionArrowHistoryTimer = setTimeout(() => {
      this.selectionArrowHistoryTimer = null;
      this.flushSelectionArrowHistory(context);
    }, SELECTION_ARROW_HISTORY_DELAY);
  }

  private flushSelectionArrowHistory(context: ToolContext): void {
    if (this.selectionArrowHistoryTimer) {
      clearTimeout(this.selectionArrowHistoryTimer);
      this.selectionArrowHistoryTimer = null;
    }

    if (!this.selectionArrowHistory) return;

    context.addHistoryEntry({
      description: "Move Selection",
      state: this.selectionArrowHistory,
    });
    this.selectionArrowHistory = null;
  }

  private updateAutoScrollVelocity(offsetX: number, offsetY: number, context: ToolContext) {
    this.autoScrollVelocity = {
      x: this.getAutoScrollSpeed(offsetX, context.viewportWidth),
      y: this.getAutoScrollSpeed(offsetY, context.viewportHeight),
    };
  }

  private getAutoScrollSpeed(position: number, viewportSize: number): number {
    if (position < AUTO_SCROLL_MARGIN) {
      return AUTO_SCROLL_MAX_SPEED * (1 - Math.max(0, position) / AUTO_SCROLL_MARGIN);
    }

    const distanceFromEnd = viewportSize - position;
    if (distanceFromEnd < AUTO_SCROLL_MARGIN) {
      return -AUTO_SCROLL_MAX_SPEED * (1 - Math.max(0, distanceFromEnd) / AUTO_SCROLL_MARGIN);
    }

    return 0;
  }

  private updateSelectionPreview(x: number, y: number, context: ToolContext, shiftKey: boolean) {
    let curX = x;
    let curY = y;

    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;
    const snapMargin = 5 / context.project.zoom;
    const guides = context.project.guides || [];
    let bestDiffX = Infinity;
    let bestGuideX = null;
    let bestDiffY = Infinity;
    let bestGuideY = null;

    const vSnaps = [0, context.project.width / 2, context.project.width];
    const hSnaps = [0, context.project.height / 2, context.project.height];

    if (showGuides && snapToGuides) {
      vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
      hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
    }

    for (const snapPos of vSnaps) {
      const diff = snapPos - curX;
      if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
        bestDiffX = diff;
        bestGuideX = snapPos;
      }
    }

    for (const snapPos of hSnaps) {
      const diff = snapPos - curY;
      if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
        bestDiffY = diff;
        bestGuideY = snapPos;
      }
    }

    if (bestGuideX !== null) {
      curX = bestGuideX;
      this.activeSnapLines.push({ type: "vertical", position: bestGuideX });
    }
    if (bestGuideY !== null) {
      curY = bestGuideY;
      this.activeSnapLines.push({ type: "horizontal", position: bestGuideY });
    }

    curX = Math.round(curX);
    curY = Math.round(curY);

    if (shiftKey) {
      const dx = curX - this.startX;
      const dy = curY - this.startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        curY = this.startY + Math.abs(dx) * Math.sign(dy);
      } else {
        curX = this.startX + Math.abs(dy) * Math.sign(dx);
      }
    }

    this.currentX = curX;
    this.currentY = curY;
  }

  private detectSelectionFeatures(context: ToolContext) {
    const { selection } = context.project;
    if (!selection.hasSelection || !selection.bounds) return;

    const { canvas } = context.getSelectionCanvas();
    const { width, height } = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const imgData = ctx.getImageData(0, 0, width, height).data;

    const relX = new Set<number>([0, width / 2, width]);
    const relY = new Set<number>([0, height / 2, height]);

    const threshold = 0.1; // 10% of dimension

    // Detect vertical edges
    for (let x = 1; x < width; x++) {
      let transitions = 0;
      for (let y = 0; y < height; y++) {
        const idx1 = (y * width + (x - 1)) * 4 + 3;
        const idx2 = (y * width + x) * 4 + 3;
        if (imgData[idx1] > 0 !== imgData[idx2] > 0) {
          transitions++;
        }
      }
      if (transitions > height * threshold) {
        relX.add(x);
      }
    }

    // Detect horizontal edges
    for (let y = 1; y < height; y++) {
      let transitions = 0;
      for (let x = 0; x < width; x++) {
        const idx1 = ((y - 1) * width + x) * 4 + 3;
        const idx2 = (y * width + x) * 4 + 3;
        if (imgData[idx1] > 0 !== imgData[idx2] > 0) {
          transitions++;
        }
      }
      if (transitions > width * threshold) {
        relY.add(y);
      }
    }

    this.relativeSnapPointsX = Array.from(relX);
    this.relativeSnapPointsY = Array.from(relY);
  }
}
