/**
 * Purpose: Tool for cropping the project canvas, providing interactive handles, rule-of-thirds overlays, and optional pixel deletion.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { Layer } from "@/renderer/store/projectStore";
import { useUIStore } from "@/renderer/store/uiStore";

interface CropState {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchor: { x: number; y: number };
}

interface Handle {
  name: string;
  x: number;
  y: number;
  cursor: string;
}

export class CropTool extends BaseTool {
  id: ToolId = "crop";

  private cropState: CropState | null = null;
  private activeHandle: Handle | { name: string; cursor: string } | null = null;
  private dragStartCoords = { x: 0, y: 0 };
  private dragStartCrop: CropState | null = null;
  private scaleAnchor = { x: 0, y: 0 };
  private handleStartOffset = { x: 0, y: 0 };
  private isCropping = false;
  private context: ToolContext | null = null;
  private activeSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];

  private readonly HANDLE_SIZE = 8;

  private syncStore(context: ToolContext) {
    if (this.cropState) {
      context.updateToolSettings("crop", {
        isDirty: true,
      });
    }
  }

  private resetCrop(context: ToolContext) {
    const { project } = context;

    // Use selection bounds if available
    if (project.selection.hasSelection && project.selection.bounds) {
      const b = project.selection.bounds;
      const left = Math.round(b.x);
      const top = Math.round(b.y);
      const width = Math.round(b.width);
      const height = Math.round(b.height);

      this.cropState = {
        x: left + width / 2,
        y: top + height / 2,
        width: width,
        height: height,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
      };
    } else {
      this.cropState = {
        x: project.width / 2,
        y: project.height / 2,
        width: project.width,
        height: project.height,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
      };
    }
    this.activeSnapLines = [];
    context.updateToolSettings("crop", { isDirty: false });
  }

  onActivate(context: ToolContext): void {
    if (this.isCropping) return;

    this.context = context;
    this.isCropping = true;
    this.resetCrop(context);

    // Event listeners for UI actions
    const handleApply = () => {
      if (this.context) this.apply(this.context);
    };
    const handleCancel = () => {
      if (this.context) this.cancel(this.context);
    };
    const handleReset = () => {
      if (this.context) this.resetCrop(this.context);
    };

    window.addEventListener("forge:crop-apply", handleApply);
    window.addEventListener("forge:crop-cancel", handleCancel);
    window.addEventListener("forge:crop-reset", handleReset);

    // Save listeners to remove them later
    (this as any)._listeners = { handleApply, handleCancel, handleReset };

    this.activeSnapLines = [];

    const { project } = context;
    // Update ratio settings based on project if not set
    const settings = context.settings.crop;
    if (settings.mode === "Original Ratio") {
      context.updateToolSettings("crop", {
        ratioW: project.width,
        ratioH: project.height,
      });
    }

    // Clear selection when entering crop mode
    context.updateProject({
      selection: { hasSelection: false, bounds: null },
    });

    context.updateToolSettings("crop", { isDirty: false });
  }

  onDeactivate(context: ToolContext): void {
    if ((this as any)._listeners) {
      const { handleApply, handleCancel, handleReset } = (this as any)._listeners;
      window.removeEventListener("forge:crop-apply", handleApply);
      window.removeEventListener("forge:crop-cancel", handleCancel);
      window.removeEventListener("forge:crop-reset", handleReset);
      (this as any)._listeners = null;
    }
    this.isCropping = false;
    this.cropState = null;
    this.activeSnapLines = [];
    context.updateToolSettings("crop", { isDirty: false });
    this.context = null;
  }

  private worldToLocal(px: number, py: number): { x: number; y: number } {
    if (!this.cropState) return { x: 0, y: 0 };
    const t = this.cropState;

    const x = px - t.x;
    const y = py - t.y;

    const rot = (-t.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    };
  }

  private localToWorld(lx: number, ly: number): { x: number; y: number } {
    if (!this.cropState) return { x: 0, y: 0 };
    const t = this.cropState;

    const rot = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const x_rot = lx * cos - ly * sin;
    const y_rot = lx * sin + ly * cos;

    return {
      x: x_rot + t.x,
      y: y_rot + t.y,
    };
  }

  private getHandles(context: ToolContext): Handle[] {
    if (!this.cropState) return [];
    const t = this.cropState;
    const zoom = context.project.zoom;

    const left = -t.width * t.anchor.x * t.scaleX;
    const top = -t.height * t.anchor.y * t.scaleY;
    const width = t.width * t.scaleX;
    const height = t.height * t.scaleY;
    const midX = left + width / 2;
    const midY = top + height / 2;

    const rawHandles = [
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
      { name: "rotate", x: midX, y: top - 30 / zoom, cursor: "crosshair" },
    ];

    return rawHandles.map((h) => {
      const world = this.localToWorld(h.x, h.y);
      return { ...h, ...world };
    });
  }

  private getHandleAtPoint(px: number, py: number, context: ToolContext) {
    const handles = this.getHandles(context);
    const zoom = context.project.zoom;
    const checkRadius = (this.HANDLE_SIZE / 2 / zoom) * 2;

    for (let i = handles.length - 1; i >= 0; i--) {
      const h = handles[i];
      const dist = Math.hypot(px - h.x, py - h.y);
      if (dist <= checkRadius) return h;
    }

    const localPos = this.worldToLocal(px, py);
    if (!this.cropState) return null;
    const t = this.cropState;
    const left = -t.width * t.anchor.x * t.scaleX;
    const top = -t.height * t.anchor.y * t.scaleY;
    const width = t.width * t.scaleX;
    const height = t.height * t.scaleY;

    if (
      localPos.x >= left &&
      localPos.x <= left + width &&
      localPos.y >= top &&
      localPos.y <= top + height
    ) {
      return { name: "move", cursor: "move" };
    }

    return null;
  }

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    let handle = this.getHandleAtPoint(x, y, context);

    if (!this.cropState) return;

    if (!handle) {
      // Snap start coordinates for pixel-perfect new selection if not rotated
      const isRotated = Math.abs(this.cropState?.rotation || 0) > 0.01;
      const snappedX = isRotated ? x : Math.round(x);
      const snappedY = isRotated ? y : Math.round(y);

      // Start creating a new crop area
      this.cropState = {
        x: snappedX,
        y: snappedY,
        width: 0,
        height: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchor: { x: 0, y: 0 },
      };
      handle = { name: "bottom-right", cursor: "nwse-resize" };
      this.syncStore(context);
      
      // Update drag start coords to snapped values too
      this.dragStartCoords = { x: snappedX, y: snappedY };
    } else {
      this.dragStartCoords = { x, y };
    }

    this.activeHandle = handle;
    this.dragStartCrop = { ...this.cropState };
    this.handleStartOffset = { x: 0, y: 0 };

    if (handle.name !== "move" && handle.name !== "rotate") {
      let oppositeName = handle.name;
      if (oppositeName.includes("top")) oppositeName = oppositeName.replace("top", "bottom");
      else if (oppositeName.includes("bottom"))
        oppositeName = oppositeName.replace("bottom", "top");
      if (oppositeName.includes("left")) oppositeName = oppositeName.replace("left", "right");
      else if (oppositeName.includes("right")) oppositeName = oppositeName.replace("right", "left");

      const handles = this.getHandles(context);
      const currentHandle = handles.find((h) => h.name === handle.name);
      if (currentHandle) {
        this.handleStartOffset = { x: x - currentHandle.x, y: y - currentHandle.y };
      }

      const opp = handles.find((h) => h.name === oppositeName);
      if (opp) {
        this.scaleAnchor = { x: opp.x, y: opp.y };
      } else {
        // Fallback for new crop creation where handles don't exist yet
        this.scaleAnchor = { x: this.dragStartCoords.x, y: this.dragStartCoords.y };
      }
    }

    context.setInteracting(true);
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    const { x: rawX, y: rawY } = context.screenToProject(e.offsetX, e.offsetY);

    if (!this.activeHandle || !this.cropState || !this.dragStartCrop) {
      const hoverHandle = this.getHandleAtPoint(rawX, rawY, context);
      context.canvas.style.cursor = hoverHandle?.cursor || "default";
      return;
    }

    this.activeSnapLines = [];
    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;
    const snapMargin = 4 / context.project.zoom;
    const guides = context.project.guides || [];

    const t = this.cropState;
    const startT = this.dragStartCrop;
    
    // Initial mouse delta
    const dx = rawX - this.dragStartCoords.x;
    const dy = rawY - this.dragStartCoords.y;

    if (this.activeHandle.name === "move") {
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

      // Canvas Edge Snapping (Move)
      const projectW = context.project.width;
      const projectH = context.project.height;

      // Vertical snap (Canvas Edges)
      const vEdges = [0, projectW];
      for (const edge of vEdges) {
        for (const p of transformed) {
          if (Math.abs(p.x - edge) < snapMargin) {
            const diff = edge - p.x;
            t.x += diff;
            this.activeSnapLines.push({ type: "vertical", position: edge });
            transformed.forEach((pt) => (pt.x += diff));
            break;
          }
        }
        if (this.activeSnapLines.some((l) => l.type === "vertical")) break;
      }

      // Horizontal snap (Canvas Edges)
      const hEdges = [0, projectH];
      for (const edge of hEdges) {
        for (const p of transformed) {
          if (Math.abs(p.y - edge) < snapMargin) {
            const diff = edge - p.y;
            t.y += diff;
            this.activeSnapLines.push({ type: "horizontal", position: edge });
            transformed.forEach((pt) => (pt.y += diff));
            break;
          }
        }
        if (this.activeSnapLines.some((l) => l.type === "horizontal")) break;
      }

      // Vertical snap (Guides)
      if (showGuides && snapToGuides && !this.activeSnapLines.some((l) => l.type === "vertical")) {
        for (const guide of guides.filter((g) => g.type === "vertical")) {
          for (const p of transformed) {
            if (Math.abs(p.x - guide.position) < snapMargin) {
              const diff = guide.position - p.x;
              t.x += diff;
              this.activeSnapLines.push({ type: "vertical", position: guide.position });
              transformed.forEach((pt) => (pt.x += diff));
              break;
            }
          }
          if (this.activeSnapLines.some((l) => l.type === "vertical")) break;
        }
      }

      // Horizontal snap (Guides)
      if (
        showGuides &&
        snapToGuides &&
        !this.activeSnapLines.some((l) => l.type === "horizontal")
      ) {
        for (const guide of guides.filter((g) => g.type === "horizontal")) {
          for (const p of transformed) {
            if (Math.abs(p.y - guide.position) < snapMargin) {
              const diff = guide.position - p.y;
              t.y += diff;
              this.activeSnapLines.push({ type: "horizontal", position: guide.position });
              transformed.forEach((pt) => (pt.y += diff));
              break;
            }
          }
          if (this.activeSnapLines.some((l) => l.type === "horizontal")) break;
        }
      }

      // Grid snapping for Move
      if (Math.abs(t.rotation % 360) < 0.01) {
        const w = Math.round(t.width * t.scaleX);
        const h = Math.round(t.height * t.scaleY);
        const left = t.x - w / 2;
        const top = t.y - h / 2;
        
        if (!this.activeSnapLines.some(l => l.type === "vertical")) {
          t.x = Math.round(left) + w / 2;
        }
        if (!this.activeSnapLines.some(l => l.type === "horizontal")) {
          t.y = Math.round(top) + h / 2;
        }
      }
    } else if (this.activeHandle.name === "rotate") {
      const startAngle = Math.atan2(
        this.dragStartCoords.y - startT.y,
        this.dragStartCoords.x - startT.x,
      );
      const currentAngle = Math.atan2(rawY - startT.y, rawX - startT.x);
      let newRotation = startT.rotation + ((currentAngle - startAngle) * 180) / Math.PI;
      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }
      t.rotation = newRotation;
    } else {
      // Scaling logic
      const settings = context.settings.crop;
      const keepAspect = e.shiftKey || settings.mode !== "Free";

      const ratio =
        settings.mode === "Fixed Ratio"
          ? settings.ratioW / settings.ratioH
          : (startT.width * startT.scaleX) / (startT.height * startT.scaleY) || 1;

      const rot = (startT.rotation * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const axisX = { x: cos, y: sin };
      const axisY = { x: -sin, y: cos };

      const scaleAnchor = e.altKey ? { x: startT.x, y: startT.y } : this.scaleAnchor;

      // Adjust mouse to handle center
      let targetMouseX = rawX - this.handleStartOffset.x;
      let targetMouseY = rawY - this.handleStartOffset.y;

      const snapMargin = 4 / context.project.zoom;
      const projectW = context.project.width;
      const projectH = context.project.height;

      const potentialSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];

      // 1. Snap to Canvas Edges
      if (Math.abs(targetMouseX - 0) < snapMargin) {
        targetMouseX = 0;
        potentialSnapLines.push({ type: "vertical", position: 0 });
      } else if (Math.abs(targetMouseX - projectW) < snapMargin) {
        targetMouseX = projectW;
        potentialSnapLines.push({ type: "vertical", position: projectW });
      }

      if (Math.abs(targetMouseY - 0) < snapMargin) {
        targetMouseY = 0;
        potentialSnapLines.push({ type: "horizontal", position: 0 });
      } else if (Math.abs(targetMouseY - projectH) < snapMargin) {
        targetMouseY = projectH;
        potentialSnapLines.push({ type: "horizontal", position: projectH });
      }

      // 2. Snap to Guides
      if (showGuides && snapToGuides) {
        for (const guide of guides) {
          if (
            guide.type === "vertical" &&
            !potentialSnapLines.some((l) => l.type === "vertical" && l.position === targetMouseX)
          ) {
            if (Math.abs(targetMouseX - guide.position) < snapMargin) {
              targetMouseX = guide.position;
              potentialSnapLines.push({ type: "vertical", position: guide.position });
            }
          } else if (
            guide.type === "horizontal" &&
            !potentialSnapLines.some((l) => l.type === "horizontal" && l.position === targetMouseY)
          ) {
            if (Math.abs(targetMouseY - guide.position) < snapMargin) {
              targetMouseY = guide.position;
              potentialSnapLines.push({ type: "horizontal", position: guide.position });
            }
          }
        }
      }

      const vecStart = {
        x: this.dragStartCoords.x - this.handleStartOffset.x - scaleAnchor.x,
        y: this.dragStartCoords.y - this.handleStartOffset.y - scaleAnchor.y,
      };
      const vecCurrent = { x: targetMouseX - scaleAnchor.x, y: targetMouseY - scaleAnchor.y };

      const startProjX = vecStart.x * axisX.x + vecStart.y * axisX.y;
      const startProjY = vecStart.x * axisY.x + vecStart.y * axisY.y;
      const currentProjX = vecCurrent.x * axisX.x + vecCurrent.y * axisX.y;
      const currentProjY = vecCurrent.x * axisY.x + vecCurrent.y * axisY.y;

      let sfx = startProjX === 0 ? currentProjX : currentProjX / startProjX;
      let sfy = startProjY === 0 ? currentProjY : currentProjY / startProjY;

      const applyX =
        this.activeHandle.name.includes("left") || this.activeHandle.name.includes("right");
      const applyY =
        this.activeHandle.name.includes("top") || this.activeHandle.name.includes("bottom");

      if (keepAspect) {
        if (applyX && applyY) {
          if (startProjX === 0 && startProjY === 0) {
            sfx = sfy =
              Math.max(Math.abs(currentProjX), Math.abs(currentProjY)) *
              (currentProjX < 0 || currentProjY < 0 ? -1 : 1);
          } else {
            const mag = Math.hypot(startProjX, startProjY);
            if (mag > 0) {
              const globalSf =
                (currentProjX * (startProjX / mag) + currentProjY * (startProjY / mag)) / mag;
              sfx = sfy = globalSf;
            }
          }
        } else if (applyX) {
          const newW = Math.abs((startT.width * startT.scaleX || 1) * sfx);
          const newH = newW / ratio;
          sfy = newH / Math.abs(startT.height * startT.scaleY || 1);
        } else if (applyY) {
          const newH = Math.abs((startT.height * startT.scaleY || 1) * sfy);
          const newW = newH * ratio;
          sfx = newW / Math.abs(startT.width * startT.scaleX || 1);
        }
      }

      const finalSfx = applyX || (keepAspect && applyY) ? sfx : 1;
      const finalSfy = applyY || (keepAspect && applyX) ? sfy : 1;

      if (startProjX === 0 && startProjY === 0) {
        // Special case for new creation from zero size
        t.width = Math.abs(finalSfx);
        t.height = Math.abs(finalSfy);
        t.scaleX = 1;
        t.scaleY = 1;
        t.x = scaleAnchor.x + finalSfx / 2;
        t.y = scaleAnchor.y + finalSfy / 2;
        t.anchor = { x: 0.5, y: 0.5 };
      } else {
        t.scaleX = startT.scaleX * finalSfx;
        t.scaleY = startT.scaleY * finalSfy;

        const centerProjX =
          (startT.x - scaleAnchor.x) * axisX.x + (startT.y - scaleAnchor.y) * axisX.y;
        const centerProjY =
          (startT.x - scaleAnchor.x) * axisY.x + (startT.y - scaleAnchor.y) * axisY.y;

        const newWorldVec = {
          x: centerProjX * finalSfx * axisX.x + centerProjY * finalSfy * axisY.x,
          y: centerProjX * finalSfx * axisX.y + centerProjY * finalSfy * axisY.y,
        };

        t.x = scaleAnchor.x + newWorldVec.x;
        t.y = scaleAnchor.y + newWorldVec.y;
      }

      // Verify which snap lines are still valid after all constraints
      if (showGuides && snapToGuides) {
        const handles = this.getHandles(context);
        const currentHandle = handles.find((h) => h.name === this.activeHandle?.name);
        if (currentHandle) {
          for (const line of potentialSnapLines) {
            if (line.type === "vertical" && Math.abs(currentHandle.x - line.position) < 0.01) {
              this.activeSnapLines.push(line);
            } else if (
              line.type === "horizontal" &&
              Math.abs(currentHandle.y - line.position) < 0.01
            ) {
              this.activeSnapLines.push(line);
            }
          }
        }
      }
    }

    this.syncStore(context);

    // --- GRID SNAPPING (PIXEL PERFECT) ---
    // If not rotated, ensure width, height and edges are aligned to the pixel grid.
    if (Math.abs(t.rotation % 360) < 0.01) {
      let w = Math.round(t.width * t.scaleX);
      let h = Math.round(t.height * t.scaleY);

      // Enforce minimum size of 1px if movement was intended
      const minW = Math.abs(t.width * t.scaleX) > 0.001 ? 1 : 0;
      const minH = Math.abs(t.height * t.scaleY) > 0.001 ? 1 : 0;

      if (Math.abs(w) < minW) w = (Math.sign(t.width * t.scaleX) || 1) * minW;
      if (Math.abs(h) < minH) h = (Math.sign(t.height * t.scaleY) || 1) * minH;

      if (t.width !== 0 && t.height !== 0) {
        t.scaleX = w / t.width;
        t.scaleY = h / t.height;

        // Calculate the top-left edge, round it, and reset center
        const left = t.x - Math.abs(w) / 2;
        const top = t.y - Math.abs(h) / 2;

        const snapX = this.activeSnapLines.find((l) => l.type === "vertical");
        const snapY = this.activeSnapLines.find((l) => l.type === "horizontal");

        // If snapped to a guide, respect its exact position. Otherwise round.
        const finalLeft = Math.round(left);
        const finalTop = Math.round(top);

        // If we are dragging a left/top handle and it's snapped, we adjust the corner.
        // If we are dragging a right/bottom handle and it's snapped, we adjust the width/height (already done by scale).
        // Actually, if we are snapped to a vertical guide, one of the vertical edges (left or right) should be at that position.
        const handles = this.getHandles(context);
        const currentHandle = handles.find((h) => h.name === this.activeHandle?.name);

        if (snapX && currentHandle) {
          const diff = snapX.position - currentHandle.x;
          t.x += diff;
        } else {
          t.x = finalLeft + Math.abs(w) / 2;
        }

        if (snapY && currentHandle) {
          const diff = snapY.position - currentHandle.y;
          t.y += diff;
        } else {
          t.y = finalTop + Math.abs(h) / 2;
        }
      }
    }
  }

  onMouseUp(_e: MouseEvent, context: ToolContext): void {
    if (this.cropState) {
      const w = Math.round(this.cropState.width * this.cropState.scaleX);
      const h = Math.round(this.cropState.height * this.cropState.scaleY);
      // If it's a zero-sized crop (like from a simple click), reset it to project bounds
      if (w === 0 || h === 0) {
        this.resetCrop(context);
      }
    }

    this.activeHandle = null;
    this.dragStartCrop = null;
    this.activeSnapLines = [];
    context.setInteracting(false);
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (!this.cropState) return;
    const t = this.cropState;
    const zoom = context.project.zoom;

    ctx.save();
    // Use project transform for easier drawing
    ctx.setTransform(zoom, 0, 0, zoom, context.project.panX, context.project.panY);

    // 1. Darken outside area
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    // Big rectangle (entire viewport area roughly)
    const viewL = -context.project.panX / zoom - 1000;
    const viewT = -context.project.panY / zoom - 1000;
    const viewW = context.canvas.width / zoom + 2000;
    const viewH = context.canvas.height / zoom + 2000;
    ctx.rect(viewL, viewT, viewW, viewH);

    // Punch out the crop rect
    ctx.translate(t.x, t.y);
    ctx.rotate((t.rotation * Math.PI) / 180);
    const left = -t.width * t.anchor.x * t.scaleX;
    const top = -t.height * t.anchor.y * t.scaleY;
    const width = t.width * t.scaleX;
    const height = t.height * t.scaleY;
    ctx.rect(left, top, width, height);
    ctx.fill("evenodd");

    // 2. Draw Crop Border
    ctx.strokeStyle = "#0078ff";
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(left, top, width, height);

    // 3. Draw Rule of Thirds
    ctx.strokeStyle = "rgba(0, 120, 255, 0.3)";
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      ctx.moveTo(left + (width * i) / 3, top);
      ctx.lineTo(left + (width * i) / 3, top + height);
      ctx.moveTo(left, top + (height * i) / 3);
      ctx.lineTo(left + width, top + (height * i) / 3);
    }
    ctx.stroke();

    // 4. Draw Handles
    const hSize = this.HANDLE_SIZE / zoom;
    const handles = this.getHandles(context);

    // We need to undo the crop rotation/translation to draw handles correctly if we use world coords
    ctx.restore();
    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, context.project.panX, context.project.panY);

    for (const h of handles) {
      ctx.fillStyle = "white";
      ctx.strokeStyle = "#0078ff";
      ctx.lineWidth = 1 / zoom;
      if (h.name === "rotate") {
        ctx.beginPath();
        ctx.arc(h.x, h.y, hSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
        ctx.strokeRect(h.x - hSize / 2, h.y - hSize / 2, hSize, hSize);
      }
    }

    // 5. Draw Snap Lines
    if (this.activeSnapLines.length > 0) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 1 / zoom;

      const viewportWidth = context.canvas.width / zoom;
      const viewportHeight = context.canvas.height / zoom;
      const startX = -context.project.panX / zoom;
      const startY = -context.project.panY / zoom;

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

    ctx.restore();
  }

  async apply(context: ToolContext) {
    if (!this.cropState) return;

    context.pushHistory("Crop");

    const t = JSON.parse(JSON.stringify(this.cropState));
    if (Math.abs(t.rotation % 360) < 0.01) {
      const w = Math.round(t.width * t.scaleX);
      const h = Math.round(t.height * t.scaleY);
      const left = Math.round(t.x - Math.abs(w) / 2);
      const top = Math.round(t.y - Math.abs(h) / 2);
      t.width = Math.abs(w);
      t.height = Math.abs(h);
      t.scaleX = 1;
      t.scaleY = 1;
      t.x = left + t.width / 2;
      t.y = top + t.height / 2;
    }

    const settings = context.settings.crop;

    const localLeft = -t.width * t.anchor.x * t.scaleX;
    const localTop = -t.height * t.anchor.y * t.scaleY;
    const newW = Math.max(1, Math.round(Math.abs(t.width * t.scaleX)));
    const newH = Math.max(1, Math.round(Math.abs(t.height * t.scaleY)));

    const invRot = (-t.rotation * Math.PI) / 180;
    const cos = Math.cos(invRot);
    const sin = Math.sin(invRot);

    const newLayers: Layer[] = await Promise.all(
      context.project.layers.map(async (layer) => {
        // Calculate new transform for the layer
        const cx = layer.x + layer.width / 2;
        const cy = layer.y + layer.height / 2;

        // Transform center to new project space
        const relX = cx - t.x;
        const relY = cy - t.y;
        const rotX = relX * cos - relY * sin;
        const rotY = relX * sin + relY * cos;

        const newCenterX = rotX - localLeft;
        const newCenterY = rotY - localTop;
        const newRotation = (layer.rotation || 0) - t.rotation;

        // If it's not a raster layer or we don't want to delete pixels, just update transform
        if (layer.type !== "raster" || !settings.deleteCropped) {
          const newX = newCenterX - layer.width / 2;
          const newY = newCenterY - layer.height / 2;

          let newMask = layer.mask;
          if (layer.mask?.linked) {
            const mcx = layer.mask.x + layer.mask.width / 2;
            const mcy = layer.mask.y + layer.mask.height / 2;
            const mRelX = mcx - t.x;
            const mRelY = mcy - t.y;
            const mRotX = mRelX * cos - mRelY * sin;
            const mRotY = mRelX * sin + mRelY * cos;
            const newMCX = mRotX - localLeft;
            const newMCY = mRotY - localTop;

            newMask = {
              ...layer.mask,
              x: newMCX - layer.mask.width / 2,
              y: newMCY - layer.mask.height / 2,
            };
          }

          return {
            ...layer,
            rotation: newRotation,
            x: newX,
            y: newY,
            mask: newMask,
          };
        }

        // For raster layers with deleteCropped=true, we rasterize and clip
        // 1. Calculate bounding box of transformed layer in new project space
        const corners = [
          { x: layer.x, y: layer.y },
          { x: layer.x + layer.width, y: layer.y },
          { x: layer.x + layer.width, y: layer.y + layer.height },
          { x: layer.x, y: layer.y + layer.height },
        ];

        let worldCorners = corners;
        if (layer.rotation) {
          const lrad = (layer.rotation * Math.PI) / 180;
          const lcos = Math.cos(lrad);
          const lsin = Math.sin(lrad);
          worldCorners = corners.map((c) => {
            const rx = c.x - cx;
            const ry = c.y - cy;
            return {
              x: cx + (rx * lcos - ry * lsin),
              y: cy + (rx * lsin + ry * lcos),
            };
          });
        }

        const transCorners = worldCorners.map((c) => {
          const relX = c.x - t.x;
          const relY = c.y - t.y;
          const rotX = relX * cos - relY * sin;
          const rotY = relX * sin + relY * cos;
          return {
            x: rotX - localLeft,
            y: rotY - localTop,
          };
        });

        const minX = Math.min(...transCorners.map((c) => c.x));
        const minY = Math.min(...transCorners.map((c) => c.y));
        const maxX = Math.max(...transCorners.map((c) => c.x));
        const maxY = Math.max(...transCorners.map((c) => c.y));

        const finalMinX = Math.floor(minX);
        const finalMinY = Math.floor(minY);
        const finalMaxX = Math.ceil(maxX);
        const finalMaxY = Math.ceil(maxY);

        const lw = Math.max(1, finalMaxX - finalMinX);
        const lh = Math.max(1, finalMaxY - finalMinY);

        // 2. Create new canvas and draw layer
        const canvas = document.createElement("canvas");
        canvas.width = lw;
        canvas.height = lh;
        const ctx = canvas.getContext("2d")!;

        // Transform coordinate system to world space within the project-aligned canvas
        ctx.translate(-finalMinX, -finalMinY); // To layer top-left in project space
        ctx.translate(-localLeft, -localTop); // To crop center in project space
        ctx.rotate(invRot);
        ctx.translate(-t.x, -t.y); // To world origin

        if (layer.data) {
          const lCanvas = await context.ensureLayerCanvas(layer);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
          ctx.drawImage(lCanvas, -layer.width / 2, -layer.height / 2);
          ctx.restore();
        }

        // 3. Clip and Optimize
        // We create a canvas the size of the NEW project to perform the crop clipping
        const clipped = document.createElement("canvas");
        clipped.width = newW;
        clipped.height = newH;
        const cctx = clipped.getContext("2d")!;

        // Draw the transformed layer at its project coordinates
        cctx.drawImage(canvas, finalMinX, finalMinY);

        let finalCanvas = clipped;
        let finalX = 0;
        let finalY = 0;

        const bounds = this.getOptimizedBounds(clipped);
        if (bounds) {
          const opt = document.createElement("canvas");
          opt.width = bounds.width;
          opt.height = bounds.height;
          opt
            .getContext("2d")!
            .drawImage(
              clipped,
              bounds.x,
              bounds.y,
              bounds.width,
              bounds.height,
              0,
              0,
              bounds.width,
              bounds.height,
            );
          finalCanvas = opt;
          finalX = bounds.x;
          finalY = bounds.y;
        } else {
          return { ...layer, data: undefined, width: 1, height: 1, x: 0, y: 0 };
        }

        context.invalidateCache(layer.id);

        let newMask = layer.mask;
        if (layer.mask?.linked) {
          // Calculate mask's new position in the cropped project space
          const mcx = layer.mask.x + layer.mask.width / 2;
          const mcy = layer.mask.y + layer.mask.height / 2;

          const mRelX = mcx - t.x;
          const mRelY = mcy - t.y;
          const mRotX = mRelX * cos - mRelY * sin;
          const mRotY = mRelX * sin + mRelY * cos;

          const newMCX = mRotX - localLeft;
          const newMCY = mRotY - localTop;

          newMask = {
            ...layer.mask,
            x: newMCX - layer.mask.width / 2,
            y: newMCY - layer.mask.height / 2,
            // Note: In non-rasterize mode, we just move it.
          };

          // If we also want to rasterize the mask (like we did for the layer),
          // it would be more consistent. But for now movement is a good start.
        }

        return {
          ...layer,
          rotation: 0, // Baked
          data: finalCanvas.toDataURL(),
          width: finalCanvas.width,
          height: finalCanvas.height,
          x: finalX,
          y: finalY,
          mask: newMask,
        };
      }),
    );

    context.updateProject({
      width: newW,
      height: newH,
      layers: newLayers,
      isDirty: true,
    });

    // Animate viewport to fit the new cropped project dimensions.
    // We pass the new dimensions explicitly to avoid using stale values from context.project.
    // Added a tiny timeout to ensure React starts processing the heavy update before animation begins.
    setTimeout(() => {
      context.animateFitToScreen(newW, newH);
    }, 100);

    // Reset crop state
    this.isCropping = false;
    this.cropState = null;
    context.setActiveTool(context.previousToolId);
  }

  cancel(context: ToolContext) {
    this.isCropping = false;
    this.cropState = null;
    context.setActiveTool(context.previousToolId);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  private getOptimizedBounds(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    let minX = canvas.width,
      minY = canvas.height,
      maxX = -1,
      maxY = -1;
    let found = false;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          found = true;
        }
      }
    }
    return found ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;
  }
}
