/**
 * Purpose: Interactive tool for creating and editing non-destructive gradient fill layers.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import {
  createHistoryState,
  GradientFill,
  Layer,
  useProjectStore,
} from "@/renderer/store/projectStore";
import { GradientFillLayer } from "@/core/layers/GradientFillLayer";
import { useGradientStore } from "@/renderer/store/gradientStore";
import { useToolStore } from "@/renderer/store/toolStore";
import {
  cloneGradientStops,
  interpolateGradientColor,
  sortGradientStops,
} from "@/renderer/utils/gradientUtils";
import { useUIStore } from "@/renderer/store/uiStore";

type Point = { x: number; y: number };
type ActiveHandle = "start" | "end" | "move" | { type: "stop"; index: number } | "create" | null;
type SnapLine = { type: "horizontal" | "vertical"; position: number };
type GradientMode = "fill" | "mask";

const cloneGradient = (gradient: GradientFill): GradientFill => ({
  ...gradient,
  start: { ...gradient.start },
  end: { ...gradient.end },
  colors: cloneGradientStops(gradient.colors),
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class GradientTool extends BaseTool {
  id: ToolId = "gradient";

  private targetLayer: Layer | null = null;
  private editingLayerId: string | null = null;
  private currentGradient: GradientFill | null = null;
  private gradientMode: GradientMode = "fill";
  private interactionOrigin: GradientFill | null = null;
  private pendingLinePosition: number | null = null;
  private interactionMoved = false;
  private maskBaseCanvas: HTMLCanvasElement | null = null;
  private maskBaseLayerId: string | null = null;
  private dragStart: Point | null = null;
  private dragCurrent: Point | null = null;
  private activeHandle: ActiveHandle = null;
  private historySnapshot: ReturnType<typeof createHistoryState> | null = null;
  private hasChanged = false;
  private activeSnapLines: SnapLine[] = [];

  onActivate(context: ToolContext): void {
    this.loadActiveGradient(context);
  }

  onDeactivate(context: ToolContext): void {
    context.setInteracting(false);
    this.targetLayer = null;
    this.editingLayerId = null;
    this.currentGradient = null;
    this.gradientMode = "fill";
    this.interactionOrigin = null;
    this.pendingLinePosition = null;
    this.interactionMoved = false;
    this.maskBaseCanvas = null;
    this.maskBaseLayerId = null;
    this.resetInteraction();
    this.activeSnapLines = [];
    context.canvas.style.cursor = "default";
  }

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    if (e.button !== 0) return;

    this.syncActiveGradient(context);
    const layer = this.getEditableLayer(context);
    if (!layer) return;

    const point = context.screenToProject(e.offsetX, e.offsetY);
    this.activeSnapLines = [];

    if (this.gradientMode === "mask") {
      if (!this.isPointInLayer(point, layer)) return;
      this.beginMaskRasterInteraction(layer, point, context);
      return;
    }

    if (layer.type === "gradient_fill" && layer.gradientFill) {
      const gradient = cloneGradient(layer.gradientFill);
      const hit = this.getHandleAt(point, layer, gradient, context.project.zoom);
      if (hit) {
        this.beginInteraction(layer, gradient, hit, point, context);
        return;
      }

      const position = this.getLinePositionAt(point, layer, gradient, context.project.zoom);
      if (!this.isPointInLayer(point, layer)) {
        this.setCursor(context, "default");
        return;
      }

      this.beginInteraction(layer, gradient, "move", point, context);
      this.pendingLinePosition = position;
    } else {
      this.beginCreation(layer, point, context);
    }
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    if (!this.dragStart || !this.currentGradient || !this.targetLayer) {
      this.syncActiveGradient(context);
      this.updateHoverCursor(e, context);
      return;
    }

    const point = context.screenToProject(e.offsetX, e.offsetY);
    this.dragCurrent = point;
    const localPoint = this.toLayerLocal(point, this.targetLayer);
    const activeHandle = this.activeHandle;
    this.setCursor(
      context,
      typeof activeHandle === "object" && activeHandle !== null && activeHandle.type === "stop"
        ? "grabbing"
        : "move",
    );

    let adjustedPoint = point;
    if (
      this.activeHandle === "start" ||
      this.activeHandle === "end" ||
      this.activeHandle === "create"
    ) {
      adjustedPoint = this.snapWorldPoint(point, context, this.targetLayer);
    } else if (this.activeHandle === "move" && this.interactionOrigin) {
      const delta = {
        x: point.x - this.dragStart.x,
        y: point.y - this.dragStart.y,
      };
      const snappedDelta = this.snapGradientTranslation(
        this.interactionOrigin,
        this.targetLayer,
        delta,
        context,
      );
      const originStart = this.toWorld(this.interactionOrigin.start, this.targetLayer);
      const originEnd = this.toWorld(this.interactionOrigin.end, this.targetLayer);
      const nextStart = this.toLayerLocal(
        { x: originStart.x + snappedDelta.x, y: originStart.y + snappedDelta.y },
        this.targetLayer,
      );
      const nextEnd = this.toLayerLocal(
        { x: originEnd.x + snappedDelta.x, y: originEnd.y + snappedDelta.y },
        this.targetLayer,
      );
      this.currentGradient.start = nextStart;
      this.currentGradient.end = nextEnd;
      this.interactionMoved = distance(this.dragStart, point) >= 2 / context.project.zoom;
    } else {
      this.activeSnapLines = [];
    }
    const adjustedLocalPoint = this.toLayerLocal(adjustedPoint, this.targetLayer);

    if (this.activeHandle === "start") {
      this.currentGradient.start = adjustedLocalPoint;
    } else if (this.activeHandle === "end" || this.activeHandle === "create") {
      this.currentGradient.end = adjustedLocalPoint;
    } else if (typeof this.activeHandle === "object" && this.activeHandle !== null) {
      const stopHandle = this.activeHandle;
      if (stopHandle.type === "stop") {
        const position = this.projectPositionOnLine(
          localPoint,
          this.currentGradient.start,
          this.currentGradient.end,
        );
        this.currentGradient.colors[stopHandle.index].position = e.shiftKey
          ? Math.round(position * 20) / 20
          : position;
        this.interactionMoved = distance(this.dragStart, point) >= 2 / context.project.zoom;
      }
    }

    if (this.activeHandle !== "move" || this.interactionMoved) {
      this.hasChanged = true;
      if (this.editingLayerId) this.applyCurrentGradient(context);
    }
  }

  onMouseUp(_e: MouseEvent, context: ToolContext): void {
    if (!this.dragStart || !this.currentGradient || !this.targetLayer) return;

    const wasCreating = !this.editingLayerId;

    if (
      !wasCreating &&
      this.gradientMode === "fill" &&
      this.activeHandle === "move" &&
      !this.interactionMoved &&
      this.pendingLinePosition !== null
    ) {
      const stop = {
        color: interpolateGradientColor(this.currentGradient.colors, this.pendingLinePosition),
        position: this.pendingLinePosition,
      };
      this.currentGradient.colors = sortGradientStops([...this.currentGradient.colors, stop]);
      this.hasChanged = true;
      this.applyCurrentGradient(context);
    }

    const shouldCommitNewGradient = wasCreating && this.hasChanged;
    if (!wasCreating) {
      if (this.hasChanged) {
        this.currentGradient.colors = sortGradientStops(this.currentGradient.colors);
        this.applyCurrentGradient(context);
      }
      this.commitHistory(context);
    } else if (shouldCommitNewGradient) {
      void this.commitNewGradient(
        context,
        this.targetLayer,
        this.currentGradient,
        this.historySnapshot,
      );
    }

    context.setInteracting(false);
    this.resetInteraction();
    this.activeSnapLines = [];
    this.setCursor(context, "default");
    if (wasCreating && !shouldCommitNewGradient) {
      this.targetLayer = null;
      this.currentGradient = null;
    }
    if (this.gradientMode === "mask") {
      this.targetLayer = null;
      this.editingLayerId = null;
      this.currentGradient = null;
    }
  }

  onDoubleClick(e: MouseEvent, context: ToolContext): void {
    // Stops are added on a single click in onMouseDown.
    void e;
    void context;
  }

  onContextMenu(e: MouseEvent, context: ToolContext): boolean {
    this.syncActiveGradient(context);
    const layer = this.getEditableLayer(context);
    if (!layer || layer.type !== "gradient_fill" || !layer.gradientFill) return false;

    const point = context.screenToProject(e.offsetX, e.offsetY);
    const gradient = cloneGradient(layer.gradientFill);
    const hit = this.getHandleAt(point, layer, gradient, context.project.zoom);
    if (!hit || typeof hit === "string" || gradient.colors.length <= 2) return false;

    const stopIndex = hit.index;
    gradient.colors.splice(stopIndex, 1);
    this.historySnapshot = createHistoryState(context.project);
    this.targetLayer = layer;
    this.currentGradient = gradient;
    this.editingLayerId = layer.id;
    this.activeHandle = null;
    this.hasChanged = true;
    this.activeSnapLines = [];
    this.applyCurrentGradient(context);
    this.commitHistory(context);
    this.setCursor(context, "default");
    return true;
  }

  getEditingLayerId(): string | null {
    return this.editingLayerId;
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (!this.dragStart) this.syncActiveGradient(context);
    if (!this.currentGradient || !this.targetLayer) return;

    const gradient = this.currentGradient;
    const start = this.toWorld(gradient.start, this.targetLayer);
    const end = this.toWorld(gradient.end, this.targetLayer);
    const zoom = context.project.zoom;

    ctx.save();
    context.setViewportTransform(zoom, context.project.panX, context.project.panY);

    if (this.activeSnapLines.length > 0) {
      ctx.save();
      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = "#ff3b30";
      const viewportWidth = context.viewportWidth / zoom;
      const viewportHeight = context.viewportHeight / zoom;
      const viewportX = -context.project.panX / zoom;
      const viewportY = -context.project.panY / zoom;
      this.activeSnapLines.forEach((line) => {
        ctx.beginPath();
        if (line.type === "vertical") {
          ctx.moveTo(line.position, viewportY);
          ctx.lineTo(line.position, viewportY + viewportHeight);
        } else {
          ctx.moveTo(viewportX, line.position);
          ctx.lineTo(viewportX + viewportWidth, line.position);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    if (this.editingLayerId === null && this.dragStart) {
      ctx.save();
      ctx.globalAlpha *= (this.targetLayer.opacity / 100) * ((this.targetLayer.fill ?? 100) / 100);
      if (this.targetLayer.rotation) {
        const centerX = this.targetLayer.x + this.targetLayer.width / 2;
        const centerY = this.targetLayer.y + this.targetLayer.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((this.targetLayer.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }
      GradientFillLayer.render(ctx, {
        ...this.targetLayer,
        type: "gradient_fill",
        gradientFill: cloneGradient(gradient),
      });
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();

    this.drawDiamond(ctx, start, 7 / zoom, "#ffffff", "#0078ff");
    this.drawDiamond(ctx, end, 7 / zoom, "#ffffff", "#0078ff");

    gradient.colors.forEach((stop, index) => {
      const stopPoint = {
        x: gradient.start.x + (gradient.end.x - gradient.start.x) * stop.position,
        y: gradient.start.y + (gradient.end.y - gradient.start.y) * stop.position,
      };
      this.drawStop(ctx, this.toWorld(stopPoint, this.targetLayer!), stop.color, 7 / zoom);
      if (
        this.activeHandle !== null &&
        typeof this.activeHandle === "object" &&
        this.activeHandle.index === index
      ) {
        ctx.save();
        const activeWhiteWidth = 2 / zoom;
        const activeBlackWidth = activeWhiteWidth;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = activeBlackWidth;
        ctx.beginPath();
        ctx.arc(
          this.toWorld(stopPoint, this.targetLayer!).x,
          this.toWorld(stopPoint, this.targetLayer!).y,
          9 / zoom + activeWhiteWidth + activeBlackWidth / 2,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = activeWhiteWidth;
        ctx.beginPath();
        ctx.arc(
          this.toWorld(stopPoint, this.targetLayer!).x,
          this.toWorld(stopPoint, this.targetLayer!).y,
          9 / zoom + activeWhiteWidth / 2,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.restore();
  }

  private getEditableLayer(context: ToolContext): Layer | null {
    const layerId = context.project.activeLayerId;
    if (!layerId) {
      useUIStore.getState().showToast("Select a layer to apply a gradient", "info");
      return null;
    }

    const layer = this.findActiveLayer(context);
    if (!layer) return null;

    if (context.isLayerLocked(layer.id)) {
      useUIStore.getState().showToast("Unlock the layer to edit its gradient.", "warning");
      return null;
    }

    const isEditingMask = context.project.activeMaskId === layer.id;
    if (isEditingMask) {
      if (!layer.mask) {
        useUIStore.getState().showToast("The selected layer mask is unavailable.", "warning");
        return null;
      }
      return layer;
    }

    // Existing gradient fills remain editable while hidden. New raster gradients still require
    // a visible layer so the user can see where the gradient is being created.
    if (layer.type === "gradient_fill" && layer.gradientFill) return layer;
    if (!context.isLayerVisible(layer.id)) return null;
    return layer;
  }

  private loadActiveGradient(context: ToolContext) {
    const layer = this.findActiveLayer(context);
    if (layer && context.project.activeMaskId === layer.id && layer.mask) {
      this.gradientMode = "mask";
      this.targetLayer = null;
      this.editingLayerId = null;
      this.currentGradient = null;
      return;
    }
    if (layer?.type === "gradient_fill" && layer.gradientFill) {
      this.gradientMode = "fill";
      this.maskBaseCanvas = null;
      this.maskBaseLayerId = null;
      this.targetLayer = layer;
      this.editingLayerId = layer.id;
      this.currentGradient = cloneGradient(layer.gradientFill);
    } else {
      this.gradientMode = "fill";
      this.targetLayer = null;
      this.editingLayerId = null;
      this.currentGradient = null;
    }
  }

  private syncActiveGradient(context: ToolContext) {
    if (this.dragStart) return;

    const layer = this.findActiveLayer(context);
    if (layer && context.project.activeMaskId === layer.id && layer.mask) {
      this.gradientMode = "mask";
      this.targetLayer = null;
      this.editingLayerId = null;
      this.currentGradient = null;
      return;
    }

    if (layer?.type === "gradient_fill" && layer.gradientFill && !context.isLayerLocked(layer.id)) {
      if (this.editingLayerId !== layer.id || this.targetLayer !== layer) {
        this.gradientMode = "fill";
        this.maskBaseCanvas = null;
        this.maskBaseLayerId = null;
        this.targetLayer = layer;
        this.editingLayerId = layer.id;
        this.currentGradient = cloneGradient(layer.gradientFill);
      }
      return;
    }

    this.targetLayer = null;
    this.editingLayerId = null;
    this.currentGradient = null;
    this.gradientMode = "fill";
    this.maskBaseCanvas = null;
    this.maskBaseLayerId = null;
  }

  private findActiveLayer(context: ToolContext): Layer | null {
    const layerId = context.project.activeLayerId;
    return context.project.layers.find((item) => item.id === layerId) || null;
  }

  private beginInteraction(
    layer: Layer,
    gradient: GradientFill,
    handle: Exclude<ActiveHandle, "create" | null>,
    point: Point,
    context: ToolContext,
  ) {
    this.targetLayer = layer;
    this.editingLayerId = layer.id;
    this.currentGradient = gradient;
    this.gradientMode = context.project.activeMaskId === layer.id ? "mask" : "fill";
    this.historySnapshot = createHistoryState(context.project);
    this.hasChanged = false;
    this.activeHandle = handle;
    this.dragStart = point;
    this.dragCurrent = point;
    this.interactionOrigin = cloneGradient(gradient);
    this.pendingLinePosition = null;
    this.interactionMoved = false;
    this.setCursor(
      context,
      typeof handle === "object" && handle.type === "stop" ? "grabbing" : "move",
    );
    context.setInteracting(true);
  }

  private beginMaskRasterInteraction(layer: Layer, point: Point, context: ToolContext) {
    this.targetLayer = layer;
    this.editingLayerId = layer.id;
    this.gradientMode = "mask";
    this.currentGradient = this.createMaskGradient(layer);
    this.prepareMaskBase(layer);
    this.historySnapshot = createHistoryState(context.project);
    this.hasChanged = false;
    this.interactionOrigin = null;
    this.pendingLinePosition = null;
    this.interactionMoved = false;
    const snappedPoint = this.snapWorldPoint(point, context, layer);
    this.currentGradient.start = this.toLayerLocal(snappedPoint, layer);
    this.currentGradient.end = { ...this.currentGradient.start };
    this.activeHandle = "create";
    this.dragStart = point;
    this.dragCurrent = point;
    this.setCursor(context, "move");
    context.setInteracting(true);
  }

  private beginCreation(layer: Layer, point: Point, context: ToolContext) {
    const creationLayer = this.getGradientCreationLayer(context, layer);
    this.historySnapshot = createHistoryState(context.project);
    this.gradientMode = "fill";
    this.editingLayerId = null;
    this.currentGradient = this.createGradientFromPreset(context, creationLayer);
    this.targetLayer = creationLayer;
    this.hasChanged = false;
    this.interactionOrigin = null;
    this.pendingLinePosition = null;
    this.interactionMoved = false;
    this.currentGradient.start = this.toLayerLocal(
      this.snapWorldPoint(point, context, creationLayer),
      creationLayer,
    );
    this.currentGradient.end = { ...this.currentGradient.start };
    this.activeHandle = "create";
    this.dragStart = point;
    this.dragCurrent = point;
    this.setCursor(context, "move");
    context.setInteracting(true);
  }

  private getGradientCreationLayer(context: ToolContext, layer: Layer): Layer {
    if (layer.type !== "group") return layer;
    return {
      ...layer,
      x: 0,
      y: 0,
      width: context.project.width,
      height: context.project.height,
      rotation: 0,
    };
  }

  private updateHoverCursor(e: MouseEvent, context: ToolContext) {
    if (!this.targetLayer || !this.currentGradient) {
      this.setCursor(context, "default");
      return;
    }

    const point = context.screenToProject(e.offsetX, e.offsetY);
    const handle = this.getHandleAt(
      point,
      this.targetLayer,
      this.currentGradient,
      context.project.zoom,
    );
    if (handle) {
      this.setCursor(
        context,
        typeof handle === "object" && handle.type === "stop" ? "grab" : "move",
      );
      return;
    }

    this.setCursor(context, this.isPointInLayer(point, this.targetLayer) ? "move" : "default");
  }

  private setCursor(context: ToolContext, cursor: string) {
    if (context.canvas.style.cursor !== cursor) context.canvas.style.cursor = cursor;
  }

  private snapWorldPoint(point: Point, context: ToolContext, layer: Layer): Point {
    const uiState = useUIStore.getState();
    const snapMargin = 4 / context.project.zoom;
    const verticalSnaps = [0, context.project.width / 2, context.project.width];
    const horizontalSnaps = [0, context.project.height / 2, context.project.height];

    if (uiState.showGuides && uiState.snapToGuides) {
      verticalSnaps.push(
        ...(context.project.guides || [])
          .filter((guide) => guide.type === "vertical")
          .map((guide) => guide.position),
      );
      horizontalSnaps.push(
        ...(context.project.guides || [])
          .filter((guide) => guide.type === "horizontal")
          .map((guide) => guide.position),
      );
    }

    if (uiState.snapToLayers) {
      context.project.layers
        .filter((candidate) => candidate.id !== layer.id && context.isLayerVisible(candidate.id))
        .forEach((candidate) => {
          verticalSnaps.push(
            candidate.x,
            candidate.x + candidate.width / 2,
            candidate.x + candidate.width,
          );
          horizontalSnaps.push(
            candidate.y,
            candidate.y + candidate.height / 2,
            candidate.y + candidate.height,
          );
        });
    }

    this.activeSnapLines = [];
    let x = point.x;
    let y = point.y;
    const closestVertical = this.findClosestSnap(x, verticalSnaps, snapMargin);
    const closestHorizontal = this.findClosestSnap(y, horizontalSnaps, snapMargin);

    if (closestVertical !== null) {
      x = closestVertical;
      this.activeSnapLines.push({ type: "vertical", position: closestVertical });
    }
    if (closestHorizontal !== null) {
      y = closestHorizontal;
      this.activeSnapLines.push({ type: "horizontal", position: closestHorizontal });
    }

    return { x, y };
  }

  private findClosestSnap(value: number, candidates: number[], margin: number): number | null {
    let closest: number | null = null;
    let closestDistance = margin;
    candidates.forEach((candidate) => {
      const candidateDistance = Math.abs(value - candidate);
      if (candidateDistance < closestDistance) {
        closest = candidate;
        closestDistance = candidateDistance;
      }
    });
    return closest;
  }

  private snapGradientTranslation(
    gradient: GradientFill,
    layer: Layer,
    delta: Point,
    context: ToolContext,
  ): Point {
    const snapMargin = 4 / context.project.zoom;
    const verticalSnaps = this.getSnapCandidates(context, layer, "vertical");
    const horizontalSnaps = this.getSnapCandidates(context, layer, "horizontal");
    const anchors = [gradient.start, gradient.end].map((point) => this.toWorld(point, layer));
    let adjustedX = delta.x;
    let adjustedY = delta.y;
    let closestX = Infinity;
    let closestY = Infinity;
    let snappedX: number | null = null;
    let snappedY: number | null = null;

    for (const anchor of anchors) {
      const candidate = this.findClosestSnap(anchor.x + delta.x, verticalSnaps, snapMargin);
      if (candidate !== null && Math.abs(candidate - (anchor.x + delta.x)) < closestX) {
        closestX = Math.abs(candidate - (anchor.x + delta.x));
        snappedX = candidate - anchor.x;
      }
      const candidateY = this.findClosestSnap(anchor.y + delta.y, horizontalSnaps, snapMargin);
      if (candidateY !== null && Math.abs(candidateY - (anchor.y + delta.y)) < closestY) {
        closestY = Math.abs(candidateY - (anchor.y + delta.y));
        snappedY = candidateY - anchor.y;
      }
    }

    this.activeSnapLines = [];
    if (snappedX !== null) {
      adjustedX = snappedX;
      this.activeSnapLines.push({ type: "vertical", position: anchors[0].x + adjustedX });
    }
    if (snappedY !== null) {
      adjustedY = snappedY;
      this.activeSnapLines.push({ type: "horizontal", position: anchors[0].y + adjustedY });
    }
    return { x: adjustedX, y: adjustedY };
  }

  private getSnapCandidates(
    context: ToolContext,
    layer: Layer,
    direction: "vertical" | "horizontal",
  ): number[] {
    const uiState = useUIStore.getState();
    const candidates =
      direction === "vertical"
        ? [0, context.project.width / 2, context.project.width]
        : [0, context.project.height / 2, context.project.height];

    if (uiState.showGuides && uiState.snapToGuides) {
      candidates.push(
        ...(context.project.guides || [])
          .filter((guide) => guide.type === direction)
          .map((guide) => guide.position),
      );
    }

    if (uiState.snapToLayers) {
      context.project.layers
        .filter((candidate) => candidate.id !== layer.id && context.isLayerVisible(candidate.id))
        .forEach((candidate) => {
          if (direction === "vertical") {
            candidates.push(
              candidate.x,
              candidate.x + candidate.width / 2,
              candidate.x + candidate.width,
            );
          } else {
            candidates.push(
              candidate.y,
              candidate.y + candidate.height / 2,
              candidate.y + candidate.height,
            );
          }
        });
    }
    return candidates;
  }

  private createGradientFromPreset(context: ToolContext, layer: Layer): GradientFill {
    const state = useGradientStore.getState();
    const selectedPresetId = useToolStore.getState().toolSettings.gradient?.presetId;
    const preset = state.presets.find((item) => item.id === selectedPresetId) || state.presets[0];
    const colors =
      preset.id === "foreground-background"
        ? [
            { color: context.foregroundColor, position: 0 },
            { color: context.backgroundColor, position: 1 },
          ]
        : cloneGradientStops(preset.colors);

    return {
      type: preset.type,
      colors,
      start: { x: 0, y: 0 },
      end: { x: layer.width, y: layer.height },
    };
  }

  private createMaskGradient(layer: Layer): GradientFill {
    return {
      type: "linear",
      colors: [
        { color: "#000000", position: 0 },
        { color: "#ffffff", position: 1 },
      ],
      start: { x: 0, y: 0 },
      end: { x: layer.width, y: layer.height },
    };
  }

  private createSelectionMask(context: ToolContext) {
    const selection = context.project.selection;
    if (!selection.hasSelection || !selection.mask || !selection.bounds) return undefined;
    return {
      data: selection.mask,
      x: selection.bounds.x,
      y: selection.bounds.y,
      width: selection.bounds.width,
      height: selection.bounds.height,
      enabled: true,
      linked: true,
    };
  }

  private async commitNewGradient(
    context: ToolContext,
    layer: Layer,
    gradient: GradientFill,
    historySnapshot: ReturnType<typeof createHistoryState> | null,
  ) {
    const canvas = layer.type === "raster" ? await context.ensureLayerCanvas(layer) : null;
    const empty =
      layer.type === "raster" && (!layer.data || (canvas && this.isCanvasEmpty(canvas)));

    if (empty) {
      const layers = context.project.layers.map((item) =>
        item.id === layer.id
          ? {
              ...item,
              type: "gradient_fill" as const,
              gradientFill: cloneGradient(gradient),
              mask: this.createSelectionMask(context) || item.mask,
              data: undefined,
              dataOriginal: undefined,
            }
          : item,
      );
      if (historySnapshot)
        context.addHistoryEntry({ description: "Gradient Tool", state: historySnapshot });
      context.invalidateCache(layer.id);
      context.updateProject({ layers, isDirty: true });
      this.setEditingGradient(layers.find((item) => item.id === layer.id) || null);
      return;
    }

    const addLayer = useProjectStore.getState().addLayer;
    const gradientLayerId = Math.random().toString(36).slice(2, 11);
    addLayer(
      context.project.id,
      {
        id: gradientLayerId,
        name: "Gradient Fill",
        type: "gradient_fill",
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        parentId: layer.parentId,
        opacity: layer.opacity,
        fill: layer.fill,
        blendMode: layer.blendMode,
        styles: layer.styles ? JSON.parse(JSON.stringify(layer.styles)) : undefined,
        gradientFill: cloneGradient(gradient),
        mask: this.createSelectionMask(context),
      },
      false,
      layer.id,
    );

    const project = useProjectStore
      .getState()
      .projects.find((item) => item.id === context.project.id);
    this.setEditingGradient(project?.layers.find((item) => item.id === gradientLayerId) || null);
  }

  private setEditingGradient(layer: Layer | null) {
    if (!layer?.gradientFill) {
      this.targetLayer = null;
      this.editingLayerId = null;
      this.currentGradient = null;
      return;
    }

    this.targetLayer = layer;
    this.editingLayerId = layer.id;
    this.currentGradient = cloneGradient(layer.gradientFill);
  }

  private applyCurrentGradient(context: ToolContext) {
    if (!this.targetLayer || !this.currentGradient) return;

    if (this.gradientMode === "mask") {
      this.applyMaskGradient(context, this.targetLayer, this.currentGradient);
      return;
    }

    const layers = context.project.layers.map((item) =>
      item.id === this.targetLayer!.id
        ? {
            ...item,
            type: "gradient_fill" as const,
            gradientFill: cloneGradient(this.currentGradient!),
          }
        : item,
    );
    context.updateProject({ layers, isDirty: true });
  }

  private prepareMaskBase(layer: Layer) {
    if (!layer.mask || this.maskBaseLayerId === layer.id) return;

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = Math.max(1, Math.round(layer.mask.width));
    baseCanvas.height = Math.max(1, Math.round(layer.mask.height));
    this.maskBaseCanvas = baseCanvas;
    this.maskBaseLayerId = layer.id;

    const image = new Image();
    image.onload = () => {
      if (this.maskBaseCanvas !== baseCanvas || this.maskBaseLayerId !== layer.id) return;
      baseCanvas.getContext("2d")?.drawImage(image, 0, 0, baseCanvas.width, baseCanvas.height);
    };
    image.src = layer.mask.data;
  }

  private applyMaskGradient(context: ToolContext, layer: Layer, gradient: GradientFill) {
    if (!layer.mask) return;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = Math.max(1, Math.round(layer.mask.width));
    maskCanvas.height = Math.max(1, Math.round(layer.mask.height));
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return;

    if (this.maskBaseCanvas && this.maskBaseLayerId === layer.id) {
      maskContext.drawImage(this.maskBaseCanvas, 0, 0);
    } else {
      maskContext.fillStyle = "#000000";
      maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    const maskGradient = cloneGradient(gradient);
    maskGradient.colors = [
      { color: "#000000", position: 0 },
      { color: "#ffffff", position: 1 },
    ];
    const gradientCanvas = document.createElement("canvas");
    gradientCanvas.width = maskCanvas.width;
    gradientCanvas.height = maskCanvas.height;
    const gradientContext = gradientCanvas.getContext("2d");
    if (!gradientContext) return;
    GradientFillLayer.render(gradientContext, {
      ...layer,
      x: layer.x - layer.mask.x,
      y: layer.y - layer.mask.y,
      type: "gradient_fill",
      gradientFill: maskGradient,
    });

    if (context.project.selection.hasSelection && context.project.selection.mask) {
      const selectionCanvas = context.getSelectionCanvas().canvas;
      const bounds = context.project.selection.bounds;
      if (bounds) {
        gradientContext.globalCompositeOperation = "destination-in";
        gradientContext.drawImage(
          selectionCanvas,
          bounds.x - layer.mask.x,
          bounds.y - layer.mask.y,
        );
        gradientContext.globalCompositeOperation = "source-over";
      }
    }
    maskContext.save();
    if (context.project.selection.hasSelection && context.project.selection.mask) {
      const bounds = context.project.selection.bounds;
      if (bounds) {
        maskContext.beginPath();
        maskContext.rect(
          bounds.x - layer.mask.x,
          bounds.y - layer.mask.y,
          bounds.width,
          bounds.height,
        );
        maskContext.clip();
      }
    }
    maskContext.drawImage(gradientCanvas, 0, 0);
    maskContext.restore();

    const updatedMask = {
      ...layer.mask,
      data: maskCanvas.toDataURL("image/png"),
    };
    const layers = context.project.layers.map((item) =>
      item.id === layer.id ? { ...item, mask: updatedMask } : item,
    );
    context.updateProject({ layers, isDirty: true });
  }

  private commitHistory(context: ToolContext) {
    if (this.hasChanged && this.historySnapshot) {
      context.addHistoryEntry({ description: "Gradient Tool", state: this.historySnapshot });
    }
    this.historySnapshot = null;
    this.hasChanged = false;
  }

  private resetInteraction() {
    this.dragStart = null;
    this.dragCurrent = null;
    this.activeHandle = null;
    this.interactionOrigin = null;
    this.pendingLinePosition = null;
    this.interactionMoved = false;
    this.historySnapshot = null;
    this.hasChanged = false;
  }

  private toLayerLocal(point: Point, layer: Layer): Point {
    const rotation = ((layer.rotation || 0) * Math.PI) / 180;
    const center = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: dx * Math.cos(rotation) + dy * Math.sin(rotation) + layer.width / 2,
      y: -dx * Math.sin(rotation) + dy * Math.cos(rotation) + layer.height / 2,
    };
  }

  private toWorld(point: Point, layer: Layer): Point {
    const rotation = ((layer.rotation || 0) * Math.PI) / 180;
    const center = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    const dx = point.x - layer.width / 2;
    const dy = point.y - layer.height / 2;
    return {
      x: center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation),
      y: center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation),
    };
  }

  private getHandleAt(
    point: Point,
    layer: Layer,
    gradient: GradientFill,
    zoom: number,
  ): Exclude<ActiveHandle, "create" | null> | null {
    const hitRadius = 10 / zoom;
    const start = this.toWorld(gradient.start, layer);
    const end = this.toWorld(gradient.end, layer);
    if (distance(point, start) <= hitRadius) return "start";
    if (distance(point, end) <= hitRadius) return "end";

    for (let index = 0; index < gradient.colors.length; index += 1) {
      const stop = gradient.colors[index];
      const local = {
        x: gradient.start.x + (gradient.end.x - gradient.start.x) * stop.position,
        y: gradient.start.y + (gradient.end.y - gradient.start.y) * stop.position,
      };
      if (distance(point, this.toWorld(local, layer)) <= hitRadius) {
        return { type: "stop", index };
      }
    }
    return null;
  }

  private isPointInLayer(point: Point, layer: Layer): boolean {
    const local = this.toLayerLocal(point, layer);
    return local.x >= 0 && local.y >= 0 && local.x <= layer.width && local.y <= layer.height;
  }

  private getLinePositionAt(
    point: Point,
    layer: Layer,
    gradient: GradientFill,
    zoom: number,
  ): number | null {
    const localPoint = this.toLayerLocal(point, layer);
    const position = this.projectPositionOnLine(localPoint, gradient.start, gradient.end);
    const linePoint = {
      x: gradient.start.x + (gradient.end.x - gradient.start.x) * position,
      y: gradient.start.y + (gradient.end.y - gradient.start.y) * position,
    };
    const hitRadius = 8 / zoom;
    return distance(localPoint, linePoint) <= hitRadius ? position : null;
  }

  private projectPositionOnLine(point: Point, start: Point, end: Point): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return 0;
    return Math.min(
      1,
      Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
    );
  }

  private isCanvasEmpty(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return false;
    }
    return true;
  }

  private drawDiamond(
    ctx: CanvasRenderingContext2D,
    point: Point,
    size: number,
    fill: string,
    stroke: string,
  ) {
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x + size, point.y);
    ctx.lineTo(point.x, point.y + size);
    ctx.lineTo(point.x - size, point.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  private drawStop(ctx: CanvasRenderingContext2D, point: Point, color: string, size: number) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const whiteWidth = size * 0.22;
    const blackWidth = whiteWidth;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = blackWidth;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size + whiteWidth + blackWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = whiteWidth;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size + whiteWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export default GradientTool;
