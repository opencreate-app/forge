/**
 * Purpose: Tool for scaling, rotating, and moving layers or selections with interactive handles and anchor points.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { Layer } from "@/renderer/store/projectStore";
import { useUIStore } from "@/renderer/store/uiStore";

interface TransformState {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchor: { x: number; y: number };
  isDirty: boolean;
}

interface Handle {
  name: string;
  x: number;
  y: number;
  cursor: string;
}

export class TransformTool extends BaseTool {
  id: ToolId = "transform";

  private originalLayer: Layer | null = null;
  private currentTransform: TransformState | null = null;
  private activeHandle: Handle | null = null;
  private dragStartCoords = { x: 0, y: 0 };
  private dragStartTransform: TransformState | null = null;
  private scaleAnchor = { x: 0, y: 0 };
  private handleOffset = { x: 0, y: 0 };
  private TRANSFORM_HANDLE_SIZE = 8;
  private context: ToolContext | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private activeSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];

  private isFloating = false;

  async onActivate(context: ToolContext): Promise<void> {
    this.context = context;
    const { project } = context;
    const activeLayerId = project.activeLayerId;
    if (!activeLayerId) return;

    if (project.selection.hasSelection && !project.selection.floatingLayer) {
      const success = await context.floatSelection(activeLayerId);
      if (success) {
        this.isFloating = true;
      }
    } else if (project.selection.floatingLayer) {
      this.isFloating = true;
    }

    // Now re-fetch layer from updated project (floatSelection updates context.project reference)
    const layer = this.isFloating
      ? context.project.selection.floatingLayer
      : context.project.layers.find((l) => l.id === activeLayerId);

    if (layer) {
      this.originalLayer = JSON.parse(JSON.stringify(layer));
      this.currentTransform = {
        x: layer.x + layer.width / 2,
        y: layer.y + layer.height / 2,
        width: layer.width,
        height: layer.height,
        scaleX: 1,
        scaleY: 1,
        rotation: layer.rotation || 0,
        anchor: { x: 0.5, y: 0.5 },
        isDirty: this.isFloating, // If we just floated, it's already a change from original
      };
      this.syncStore(context);
    }

    window.addEventListener("forge:transform-apply", this.handleApplyEvent);
    window.addEventListener("forge:transform-cancel", this.handleCancelEvent);
    window.addEventListener("keydown", this.handleKeyDown);

    this.unsubscribeStore = context.subscribe((settings) => {
      // Only react if we are the active tool (the engine takes care of only calling active tool,
      // but this listener is global once subscribed)
      const newSettings = settings.transform;
      if (this.currentTransform) {
        if (
          this.currentTransform.x !== newSettings.x ||
          this.currentTransform.y !== newSettings.y ||
          this.currentTransform.scaleX !== newSettings.scaleX ||
          this.currentTransform.scaleY !== newSettings.scaleY ||
          this.currentTransform.rotation !== newSettings.rotation
        ) {
          this.currentTransform = { ...newSettings };
        }
      }
    });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (useUIStore.getState().isAnyModalOpen()) return;

    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (this.context) this.apply(this.context);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (this.context) this.cancel(this.context);
    }
  };

  private handleApplyEvent = () => {
    if (this.context) this.apply(this.context);
  };

  private handleCancelEvent = () => {
    if (this.context) this.cancel(this.context);
  };

  onDeactivate(context: ToolContext): void {
    this.originalLayer = null;
    this.currentTransform = null;
    this.activeHandle = null;
    this.activeSnapLines = [];
    window.removeEventListener("forge:transform-apply", this.handleApplyEvent);
    window.removeEventListener("forge:transform-cancel", this.handleCancelEvent);
    window.removeEventListener("keydown", this.handleKeyDown);
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }

    // Reset dirty state on deactivate
    context.updateToolSettings("transform", { isDirty: false });
    this.context = null;
  }

  private syncStore(context: ToolContext) {
    if (this.currentTransform) {
      context.updateToolSettings("transform", {
        ...this.currentTransform,
      });
    }
  }

  private snapTransformToGrid(t: TransformState) {
    if (Math.abs(t.rotation % 360) < 0.01) {
      const w = Math.round(t.width * t.scaleX);
      const h = Math.round(t.height * t.scaleY);

      // Only apply if we have a valid size
      if (Math.abs(w) >= 1 && Math.abs(h) >= 1) {
        t.scaleX = w / t.width;
        t.scaleY = h / t.height;

        // Calculate the top-left edge, round it, and reset center
        const left = t.x - Math.abs(w) / 2;
        const top = t.y - Math.abs(h) / 2;

        t.x = Math.round(left) + Math.abs(w) / 2;
        t.y = Math.round(top) + Math.abs(h) / 2;
      }
    }
  }

  private worldToLocal(px: number, py: number): { x: number; y: number } {
    if (!this.currentTransform) return { x: 0, y: 0 };
    const t = this.currentTransform;

    const x = px - t.x;
    const y = py - t.y;

    const rot = (-t.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const x_rot = x * cos - y * sin;
    const y_rot = x * sin + y * cos;

    return { x: x_rot, y: y_rot };
  }

  private localToWorld(lx: number, ly: number): { x: number; y: number } {
    if (!this.currentTransform) return { x: 0, y: 0 };
    const t = this.currentTransform;

    const rot = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const x_rot = lx * cos - ly * sin;
    const y_rot = lx * sin + ly * cos;

    return { x: x_rot + t.x, y: y_rot + t.y };
  }

  private getTransformHandles(context: ToolContext, local = false): Handle[] {
    if (!this.currentTransform) return [];
    const t = this.currentTransform;
    const scale = context.project.zoom;

    const left = -t.width * t.anchor.x * t.scaleX;
    const top = -t.height * t.anchor.y * t.scaleY;
    const width = t.width * t.scaleX;
    const height = t.height * t.scaleY;
    const midX = left + width / 2;
    const midY = top + height / 2;

    const handles: Handle[] = [
      { name: "top-left", x: left, y: top, cursor: "nwse-resize" },
      { name: "top-middle", x: midX, y: top, cursor: "ns-resize" },
      { name: "top-right", x: left + width, y: top, cursor: "nesw-resize" },
      { name: "center-left", x: left, y: midY, cursor: "ew-resize" },
      { name: "center-right", x: left + width, y: midY, cursor: "ew-resize" },
      { name: "bottom-left", x: left, y: top + height, cursor: "nesw-resize" },
      { name: "bottom-middle", x: midX, y: top + height, cursor: "ns-resize" },
      {
        name: "bottom-right",
        x: left + width,
        y: top + height,
        cursor: "nwse-resize",
      },
      { name: "rotate", x: midX, y: top - 20 / scale, cursor: "crosshair" },
    ];

    if (local) return handles;

    return handles.map((h) => {
      const worldPos = this.localToWorld(h.x, h.y);
      return { ...h, ...worldPos };
    });
  }

  private getRotatedCursor(handleName: string, rotation: number): string {
    const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

    if (handleName === "rotate") return "crosshair";
    if (handleName === "move") return "move";

    let baseDir = "";
    if (handleName.includes("top")) baseDir += "n";
    else if (handleName.includes("bottom")) baseDir += "s";

    if (handleName.includes("left")) baseDir += "w";
    else if (handleName.includes("right")) baseDir += "e";

    // Adjust baseDir for negative scales
    const t = this.currentTransform!;
    if (t.scaleX < 0) {
      if (baseDir.includes("w")) baseDir = baseDir.replace("w", "e");
      else if (baseDir.includes("e")) baseDir = baseDir.replace("e", "w");
    }
    if (t.scaleY < 0) {
      if (baseDir.includes("n")) baseDir = baseDir.replace("n", "s");
      else if (baseDir.includes("s")) baseDir = baseDir.replace("s", "n");
    }

    // Normalize baseDir (must be in 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw' format)
    if (baseDir === "wn") baseDir = "nw";
    if (baseDir === "en") baseDir = "ne";
    if (baseDir === "ws") baseDir = "sw";
    if (baseDir === "es") baseDir = "se";

    const index = directions.indexOf(baseDir);
    if (index === -1) return "default";

    // Add rotation to the base direction
    // 360 degrees / 8 directions = 45 degrees per step
    const steps = Math.round(rotation / 45);
    const newIndex = (index + steps + directions.length) % directions.length;

    return `${directions[newIndex]}-resize`;
  }

  private getHandleAtPoint(
    px: number,
    py: number,
    context: ToolContext,
  ): Handle | { name: string; cursor: string } | null {
    if (!this.currentTransform) return null;
    const handles = this.getTransformHandles(context, false);
    const scale = context.project.zoom;
    const checkRadius = (this.TRANSFORM_HANDLE_SIZE / scale / 2) * 2; // Increased hit area a bit
    const rotation = this.currentTransform.rotation;

    // Check handles first (in reverse to get top-most handles if they overlap)
    for (let i = handles.length - 1; i >= 0; i--) {
      const h = handles[i];
      const dist = Math.hypot(px - h.x, py - h.y);
      if (dist <= checkRadius) {
        return {
          ...h,
          cursor: this.getRotatedCursor(h.name, rotation),
        };
      }
    }

    // Move hit test
    const localPos = this.worldToLocal(px, py);
    const t = this.currentTransform;

    // Bounds check in local space (rotated but unscaled)
    // We must compare against the absolute bounds even if scale is negative
    const x1 = -t.width * t.anchor.x * t.scaleX;
    const x2 = t.width * (1 - t.anchor.x) * t.scaleX;
    const y1 = -t.height * t.anchor.y * t.scaleY;
    const y2 = t.height * (1 - t.anchor.y) * t.scaleY;

    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    // Add a small padding for easier selection
    const padding = 2 / scale;
    if (
      localPos.x >= left - padding &&
      localPos.x <= right + padding &&
      localPos.y >= top - padding &&
      localPos.y <= bottom + padding
    ) {
      return { name: "move", cursor: "move" };
    }

    return null;
  }

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    const { x: px, y: py } = context.screenToProject(e.offsetX, e.offsetY);
    const handle = this.getHandleAtPoint(px, py, context);

    if (!handle) return;

    this.activeHandle = handle as Handle;
    this.dragStartCoords = { x: px, y: py };
    this.dragStartTransform = JSON.parse(JSON.stringify(this.currentTransform));
    this.handleOffset = { x: 0, y: 0 };

    if (handle.name !== "move" && handle.name !== "rotate") {
      const handles = this.getTransformHandles(context, false);
      const currentHandle = handles.find((h) => h.name === handle.name);
      if (currentHandle) {
        this.handleOffset = { x: px - currentHandle.x, y: py - currentHandle.y };
      }

      let oppositeHandleName = handle.name;
      // Find opposite handle for scaling
      if (oppositeHandleName.includes("top"))
        oppositeHandleName = oppositeHandleName.replace("top", "bottom");
      else if (oppositeHandleName.includes("bottom"))
        oppositeHandleName = oppositeHandleName.replace("bottom", "top");
      if (oppositeHandleName.includes("left"))
        oppositeHandleName = oppositeHandleName.replace("left", "right");
      else if (oppositeHandleName.includes("right"))
        oppositeHandleName = oppositeHandleName.replace("right", "left");

      const oppositeHandle = this.getTransformHandles(context, true).find(
        (h) => h.name === oppositeHandleName,
      );
      if (oppositeHandle) {
        this.scaleAnchor = this.localToWorld(oppositeHandle.x, oppositeHandle.y);
      } else {
        this.scaleAnchor = {
          x: this.currentTransform!.x,
          y: this.currentTransform!.y,
        };
      }
    }
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    const { x: raw_px, y: raw_py } = context.screenToProject(e.offsetX, e.offsetY);

    if (!this.activeHandle) {
      const hoverHandle = this.getHandleAtPoint(raw_px, raw_py, context);
      context.canvas.style.cursor = hoverHandle?.cursor || "default";
      return;
    }

    this.activeSnapLines = [];
    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;
    const snapMargin = 4 / context.project.zoom;
    const guides = context.project.guides || [];

    // Keep cursor correct during drag
    context.canvas.style.cursor = this.getRotatedCursor(
      this.activeHandle.name,
      this.currentTransform!.rotation,
    );

    const t = this.currentTransform!;
    const startT = this.dragStartTransform!;
    
    // Use raw coordinates for snapping logic to avoid premature rounding
    const dx = raw_px - this.dragStartCoords.x;
    const dy = raw_py - this.dragStartCoords.y;

    let changed = false;

    switch (this.activeHandle.name) {
      case "move": {
        t.x = startT.x + dx;
        t.y = startT.y + dy;

        const rot = (t.rotation * Math.PI) / 180;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);

        const points = [
          { x: -t.width * t.anchor.x * t.scaleX, y: -t.height * t.anchor.y * t.scaleY }, // TL
          { x: t.width * (1 - t.anchor.x) * t.scaleX, y: -t.height * t.anchor.y * t.scaleY }, // TR
          { x: t.width * (1 - t.anchor.x) * t.scaleX, y: t.height * (1 - t.anchor.y) * t.scaleY }, // BR
          { x: -t.width * t.anchor.x * t.scaleX, y: t.height * (1 - t.anchor.y) * t.scaleY }, // BL
          { x: 0, y: 0 }, // Center
        ];

        const transformed = points.map((p) => ({
          x: t.x + (p.x * cos - p.y * sin),
          y: t.y + (p.x * sin + p.y * cos),
        }));

        // 1. Collect potential snap positions
        const vSnaps = [0, context.project.width / 2, context.project.width];
        const hSnaps = [0, context.project.height / 2, context.project.height];

        if (showGuides && snapToGuides) {
          vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
          hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
        }

        // Vertical snap
        for (const snapPos of vSnaps) {
          for (const p of transformed) {
            if (Math.abs(p.x - snapPos) < snapMargin) {
              const diff = snapPos - p.x;
              t.x += diff;
              this.activeSnapLines.push({ type: "vertical", position: snapPos });
              // Re-transform points if we shifted X
              transformed.forEach((pt) => (pt.x += diff));
              break;
            }
          }
          if (this.activeSnapLines.some((l) => l.type === "vertical")) break;
        }

        // Horizontal snap
        for (const snapPos of hSnaps) {
          for (const p of transformed) {
            if (Math.abs(p.y - snapPos) < snapMargin) {
              const diff = snapPos - p.y;
              t.y += diff;
              this.activeSnapLines.push({ type: "horizontal", position: snapPos });
              break;
            }
          }
          if (this.activeSnapLines.some((l) => l.type === "horizontal")) break;
        }

        changed = t.x !== startT.x || t.y !== startT.y;
        break;
      }
      case "rotate": {
        const startAngle = Math.atan2(
          this.dragStartCoords.y - startT.y,
          this.dragStartCoords.x - startT.x,
        );
        const currentAngle = Math.atan2(raw_py - startT.y, raw_px - startT.x);
        let newRotation = startT.rotation + ((currentAngle - startAngle) * 180) / Math.PI;
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }
        const oldRot = t.rotation;
        t.rotation = newRotation % 360;
        changed = t.rotation !== oldRot;
        break;
      }
      default: {
        const scaleFromCenter = e.altKey;
        const scaleAnchor = scaleFromCenter ? { x: startT.x, y: startT.y } : this.scaleAnchor;
        const keepAspect = e.shiftKey;

        const rot = (startT.rotation * Math.PI) / 180;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const world_axis_x = { x: cos, y: sin };
        const world_axis_y = { x: -sin, y: cos };

        // Calculate the "intended" handle position by subtracting the initial mouse offset
        let target_px = raw_px - this.handleOffset.x;
        let target_py = raw_py - this.handleOffset.y;

        // 1. Collect potential snap positions
        const vSnaps = [0, context.project.width / 2, context.project.width];
        const hSnaps = [0, context.project.height / 2, context.project.height];

        if (showGuides && snapToGuides) {
          vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
          hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
        }

        // Vertical snap
        for (const snapPos of vSnaps) {
          if (Math.abs(target_px - snapPos) < snapMargin) {
            target_px = snapPos;
            this.activeSnapLines.push({ type: "vertical", position: snapPos });
            break;
          }
        }

        // Horizontal snap
        for (const snapPos of hSnaps) {
          if (Math.abs(target_py - snapPos) < snapMargin) {
            target_py = snapPos;
            this.activeSnapLines.push({ type: "horizontal", position: snapPos });
            break;
          }
        }

        const vec_start = {
          x: (this.dragStartCoords.x - this.handleOffset.x) - scaleAnchor.x,
          y: (this.dragStartCoords.y - this.handleOffset.y) - scaleAnchor.y,
        };
        const vec_current = { x: target_px - scaleAnchor.x, y: target_py - scaleAnchor.y };

        const start_proj_x = vec_start.x * world_axis_x.x + vec_start.y * world_axis_x.y;
        const start_proj_y = vec_start.x * world_axis_y.x + vec_start.y * world_axis_y.y;
        const current_proj_x = vec_current.x * world_axis_x.x + vec_current.y * world_axis_x.y;
        const current_proj_y = vec_current.x * world_axis_y.x + vec_current.y * world_axis_y.y;

        let scaleFactorX = start_proj_x === 0 ? 1 : current_proj_x / start_proj_x;
        let scaleFactorY = start_proj_y === 0 ? 1 : current_proj_y / start_proj_y;

        const applyScaleX =
          this.activeHandle.name.includes("left") || this.activeHandle.name.includes("right");
        const applyScaleY =
          this.activeHandle.name.includes("top") || this.activeHandle.name.includes("bottom");

        if (keepAspect) {
          if (applyScaleX && applyScaleY) {
            const globalScale =
              Math.abs(scaleFactorX) > Math.abs(scaleFactorY) ? scaleFactorX : scaleFactorY;
            scaleFactorX = globalScale;
            scaleFactorY = globalScale;
          } else if (applyScaleX) scaleFactorY = scaleFactorX;
          else if (applyScaleY) scaleFactorX = scaleFactorY;
        }

        const oldScaleX = t.scaleX;
        const oldScaleY = t.scaleY;

        if (applyScaleX || (keepAspect && applyScaleY)) t.scaleX = startT.scaleX * scaleFactorX;
        if (applyScaleY || (keepAspect && applyScaleX)) t.scaleY = startT.scaleY * scaleFactorY;

        const vec_anchor_to_center = {
          x: startT.x - scaleAnchor.x,
          y: startT.y - scaleAnchor.y,
        };
        const center_proj_x =
          vec_anchor_to_center.x * world_axis_x.x + vec_anchor_to_center.y * world_axis_x.y;
        const center_proj_y =
          vec_anchor_to_center.x * world_axis_y.x + vec_anchor_to_center.y * world_axis_y.y;

        const new_center_proj_x =
          center_proj_x * (applyScaleX || (keepAspect && applyScaleY) ? scaleFactorX : 1);
        const new_center_proj_y =
          center_proj_y * (applyScaleY || (keepAspect && applyScaleX) ? scaleFactorY : 1);

        t.x =
          scaleAnchor.x + (new_center_proj_x * world_axis_x.x + new_center_proj_y * world_axis_y.x);
        t.y =
          scaleAnchor.y + (new_center_proj_x * world_axis_x.y + new_center_proj_y * world_axis_y.y);

        changed = t.scaleX !== oldScaleX || t.scaleY !== oldScaleY;
        break;
      }
    }

    if (changed) {
      t.isDirty = true;
    }

    // --- GRID SNAPPING (PIXEL PERFECT) ---
    this.snapTransformToGrid(t);

    this.syncStore(context);
  }

  onMouseUp(): void {
    this.activeHandle = null;
    this.dragStartTransform = null;
    this.activeSnapLines = [];
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (!this.currentTransform || !this.originalLayer) return;
    const scale = context.project.zoom;

    // Draw handles and borders
    const handles = this.getTransformHandles(context, false);
    ctx.save();
    ctx.strokeStyle = "#0078ff";
    ctx.lineWidth = 1 / scale;

    // Draw lines connecting the corners
    const cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"];
    const corners = cornerNames
      .map((name) => handles.find((h) => h.name === name))
      .filter((h): h is Handle => !!h);

    if (corners.length === 4) {
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.stroke();
    }

    // Draw rotation line
    const rotateHandle = handles.find((h) => h.name === "rotate");
    const topMiddle = handles.find((h) => h.name === "top-middle");
    if (rotateHandle && topMiddle) {
      ctx.beginPath();
      ctx.moveTo(topMiddle.x, topMiddle.y);
      ctx.lineTo(rotateHandle.x, rotateHandle.y);
      ctx.stroke();
    }

    // Draw snap lines
    if (this.activeSnapLines.length > 0) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 1 / scale;

      const viewportWidth = context.canvas.width / scale;
      const viewportHeight = context.canvas.height / scale;
      const startX = -context.project.panX / scale;
      const startY = -context.project.panY / scale;

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
    }

    // Draw the handles
    const handleSize = this.TRANSFORM_HANDLE_SIZE / scale;
    handles.forEach((h) => {
      ctx.fillStyle = "white";
      ctx.strokeStyle = "#0078ff";
      ctx.lineWidth = 1 / scale;
      if (h.name === "rotate") {
        ctx.beginPath();
        ctx.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      }
    });
    ctx.restore();
  }

  async apply(context: ToolContext) {
    if (!this.currentTransform || !this.originalLayer) return;

    context.pushHistory("Transform");

    const t = this.currentTransform;
    this.snapTransformToGrid(t);

    const layer = this.isFloating
      ? context.project.selection.floatingLayer
      : context.project.layers.find((l) => l.id === this.originalLayer?.id);

    if (!layer) return;

    const rot = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    const corners = [
      {
        x: -t.width * t.anchor.x * t.scaleX,
        y: -t.height * t.anchor.y * t.scaleY,
      },
      {
        x: t.width * (1 - t.anchor.x) * t.scaleX,
        y: -t.height * t.anchor.y * t.scaleY,
      },
      {
        x: t.width * (1 - t.anchor.x) * t.scaleX,
        y: t.height * (1 - t.anchor.y) * t.scaleY,
      },
      {
        x: -t.width * t.anchor.x * t.scaleX,
        y: t.height * (1 - t.anchor.y) * t.scaleY,
      },
    ];

    const transformedCorners = corners.map((c) => ({
      x: t.x + (c.x * cos - c.y * sin),
      y: t.y + (c.x * sin + c.y * cos),
    }));

    const minX = Math.min(...transformedCorners.map((c) => c.x));
    const minY = Math.min(...transformedCorners.map((c) => c.y));
    const maxX = Math.max(...transformedCorners.map((c) => c.x));
    const maxY = Math.max(...transformedCorners.map((c) => c.y));

    // Ensure dimensions are strictly integer if rotation is zero
    let newWidth = Math.ceil(maxX - minX);
    let newHeight = Math.ceil(maxY - minY);
    let newX = Math.round(minX);
    let newY = Math.round(minY);

    if (Math.abs(t.rotation % 360) < 0.01) {
      newWidth = Math.round(Math.abs(t.width * t.scaleX));
      newHeight = Math.round(Math.abs(t.height * t.scaleY));
      newX = Math.round(t.x - newWidth / 2);
      newY = Math.round(t.y - newHeight / 2);
    }

    if (layer.type === "smart_object") {
      // Non-destructive update for smart objects
      let finalWidth = t.width * t.scaleX;
      let finalHeight = t.height * t.scaleY;
      let finalX = t.x - finalWidth * t.anchor.x;
      let finalY = t.y - finalHeight * t.anchor.y;

      if (Math.abs(t.rotation % 360) < 0.01) {
        finalWidth = Math.round(finalWidth);
        finalHeight = Math.round(finalHeight);
        finalX = Math.round(finalX);
        finalY = Math.round(finalY);
      }

      context.updateProject({
        layers: context.project.layers.map((l) =>
          l.id === layer.id
            ? {
                ...l,
                x: finalX,
                y: finalY,
                width: finalWidth,
                height: finalHeight,
                rotation: t.rotation,
                mask: l.mask?.linked
                  ? {
                      ...l.mask,
                      x: finalX,
                      y: finalY,
                    }
                  : l.mask,
              }
            : l,
        ),
        isDirty: true,
      });
      context.invalidateCache(layer.id);
      context.setActiveTool(context.previousToolId);
      return;
    }

    const layerCanvas = context.getLayerCanvas(layer.id);
    if (layerCanvas?.ready) {
      const offCanvas = document.createElement("canvas");
      offCanvas.width = newWidth;
      offCanvas.height = newHeight;
      const octx = offCanvas.getContext("2d")!;

      octx.translate(-newX, -newY);
      octx.translate(t.x, t.y);
      octx.rotate(rot);
      octx.scale(t.scaleX, t.scaleY);
      octx.drawImage(layerCanvas.canvas, -t.width * t.anchor.x, -t.height * t.anchor.y);

      let newMaskData = layer.mask?.data;
      if (layer.mask?.linked && layer.mask.data) {
        const maskImg = new Image();
        maskImg.src = layer.mask.data;
        await new Promise((resolve) => {
          maskImg.onload = resolve;
          maskImg.onerror = resolve;
        });

        if (maskImg.complete && maskImg.width > 0) {
          const mCanvas = document.createElement("canvas");
          mCanvas.width = newWidth;
          mCanvas.height = newHeight;
          const mctx = mCanvas.getContext("2d")!;
          mctx.translate(-newX, -newY);
          mctx.translate(t.x, t.y);
          mctx.rotate(rot);
          mctx.scale(t.scaleX, t.scaleY);

          // Original relationship: mask.x, mask.y
          // We need to draw the mask image at its original position relative to the layer's center
          // The center of the transformation is t.x, t.y (world coords)
          // The layer's original center was this.originalLayer!.x + this.originalLayer!.width/2
          const origL = this.originalLayer!;
          const dx = layer.mask.x - origL.x;
          const dy = layer.mask.y - origL.y;

          mctx.drawImage(maskImg, dx - origL.width * t.anchor.x, dy - origL.height * t.anchor.y);
          newMaskData = mCanvas.toDataURL();
        }
      }

      if (this.isFloating) {
        const newFloating = {
          ...layer,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
          data: offCanvas.toDataURL(),
          rotation: 0,
          mask: layer.mask
            ? {
                ...layer.mask,
                data: newMaskData!,
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight,
              }
            : undefined,
        };
        context.updateProject({
          selection: {
            ...context.project.selection,
            floatingLayer: newFloating,
            bounds: { x: newX, y: newY, width: newWidth, height: newHeight },
            mask: offCanvas.toDataURL(),
          },
          isDirty: true,
        });
        context.updateSelectionEdges();
      } else {
        context.updateProject({
          layers: context.project.layers.map((l) =>
            l.id === layer.id
              ? {
                  ...l,
                  x: newX,
                  y: newY,
                  width: newWidth,
                  height: newHeight,
                  data: offCanvas.toDataURL(),
                  rotation: 0,
                  mask: l.mask
                    ? {
                        ...l.mask,
                        data: newMaskData!,
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight,
                      }
                    : undefined,
                }
              : l,
          ),
          isDirty: true,
        });
      }
      context.invalidateCache(layer.id);
    }

    context.setActiveTool(context.previousToolId);
  }

  cancel(context: ToolContext) {
    context.setActiveTool(context.previousToolId);
  }

  getEditingLayerId(): string | null {
    return this.originalLayer?.id || null;
  }
}
