/**
 * Purpose: Tool for moving layers and selections, including auto-selection logic and support for floating selections.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { createHistoryState, HistoryState, Layer } from "@/renderer/store/projectStore";
import { useUIStore } from "@/renderer/store/uiStore";

export class MoveTool extends BaseTool {
  id: ToolId = "move";

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private initialPositions: Map<string, { x: number; y: number; maskX?: number; maskY?: number }> =
    new Map();
  private movingLayerIds: string[] = [];
  private isFloating = false;
  private historySnapshot: HistoryState | null = null;
  private activeSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];

  /**
   * Recursively finds all descendants of a group layer.
   */
  private getDescendantIds(layers: Layer[], parentId: string): string[] {
    const descendants: string[] = [];
    const children = layers.filter((l) => l.parentId === parentId);
    for (const child of children) {
      descendants.push(child.id);
      if (child.type === "group") {
        descendants.push(...this.getDescendantIds(layers, child.id));
      }
    }
    return descendants;
  }

  /**
   * Identifies all layers that should move based on current selection and hierarchy.
   */
  private getTargetLayerIds(context: ToolContext): string[] {
    const { project } = context;
    const targets = new Set<string>();

    // 1. Start with selected layers
    const selectedIds =
      project.selectedLayerIds.length > 0
        ? project.selectedLayerIds
        : project.activeLayerId
          ? [project.activeLayerId]
          : [];

    for (const id of selectedIds) {
      const layer = project.layers.find((l) => l.id === id);
      if (!layer) continue;

      targets.add(id);

      // 2. If it's a group, add all descendants
      if (layer.type === "group") {
        const descendants = this.getDescendantIds(project.layers, id);
        for (const dId of descendants) {
          targets.add(dId);
        }
      }
    }

    // 3. Filter out locked layers (including those with locked ancestors)
    return Array.from(targets).filter((id) => !context.isLayerLocked(id));
  }

  async onMouseDown(e: MouseEvent, context: ToolContext): Promise<void> {
    if (e.button !== 0) return;

    const { project } = context;
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);

    // 1. Auto Select Logic (Enabled by setting OR by holding Alt key)
    if (context.settings.move.autoSelect || e.altKey) {
      // Find top-most layer at this point (reverse search)
      const foundLayer = [...project.layers]
        .reverse()
        .find(
          (l) =>
            context.isLayerVisible(l.id) &&
            !context.isLayerLocked(l.id) &&
            x >= l.x &&
            x <= l.x + l.width &&
            y >= l.y &&
            y <= l.y + l.height,
        );

      if (foundLayer && !project.selectedLayerIds.includes(foundLayer.id)) {
        context.updateProject({ activeLayerId: foundLayer.id, selectedLayerIds: [foundLayer.id] });
        // Update local reference for the rest of the method
        project.activeLayerId = foundLayer.id;
        project.selectedLayerIds = [foundLayer.id];
      }
    }

    const activeLayerId = project.activeLayerId;
    if (!activeLayerId && project.selectedLayerIds.length === 0) return;

    // Capture snapshot BEFORE any changes
    this.historySnapshot = createHistoryState(project);

    // If we have a selection and no floating layer yet, we float it now
    // Selection floating currently only supports the active layer
    if (activeLayerId && project.selection.hasSelection && !project.selection.floatingLayer) {
      if (!context.isLayerLocked(activeLayerId)) {
        const success = await context.floatSelection(activeLayerId);
        if (success) {
          this.isFloating = true;
        }
      }
    } else if (project.selection.floatingLayer) {
      this.isFloating = true;
    } else {
      this.isFloating = false;
    }

    this.isDragging = true;
    this.startX = x;
    this.startY = y;
    this.initialPositions.clear();

    if (this.isFloating) {
      const floatingLayer = context.project.selection.floatingLayer!;
      this.movingLayerIds = ["floating-selection"];
      this.initialPositions.set("floating-selection", { x: floatingLayer.x, y: floatingLayer.y });
    } else {
      this.movingLayerIds = this.getTargetLayerIds(context);
      for (const id of this.movingLayerIds) {
        const layer = project.layers.find((l) => l.id === id);
        if (layer) {
          this.initialPositions.set(id, {
            x: layer.x,
            y: layer.y,
            maskX: layer.mask?.x,
            maskY: layer.mask?.y,
          });
        }
      }
    }
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    if (!this.isDragging || this.movingLayerIds.length === 0) return;

    const { project } = context;
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    // Use Math.round to force movement to project pixels (no subpixels)
    let dx = Math.round(x - this.startX);
    let dy = Math.round(y - this.startY);

    this.activeSnapLines = [];

    // --- GUIDE SNAPPING LOGIC ---
    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;
    const movingLayers = this.isFloating
      ? [project.selection.floatingLayer!]
      : project.layers.filter((l) => this.movingLayerIds.includes(l.id));

    if (showGuides && snapToGuides && movingLayers.length > 0) {
      // Calculate aggregate bounding box of all moving layers at their initial positions
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const id of this.movingLayerIds) {
        const initial = this.initialPositions.get(id);
        if (initial) {
          const layer =
            id === "floating-selection"
              ? project.selection.floatingLayer!
              : project.layers.find((l) => l.id === id);
          if (layer) {
            minX = Math.min(minX, initial.x);
            minY = Math.min(minY, initial.y);
            maxX = Math.max(maxX, initial.x + layer.width);
            maxY = Math.max(maxY, initial.y + layer.height);
          }
        }
      }

      if (minX !== Infinity) {
        const snapMargin = 4 / project.zoom;
        const guides = project.guides || [];

        // Vertical snapping
        for (const guide of guides.filter((g) => g.type === "vertical")) {
          const centerX = (minX + maxX) / 2;
          const snapPoints = [
            { pos: minX + dx, offset: -minX }, // Left
            { pos: maxX + dx, offset: -maxX }, // Right
            { pos: centerX + dx, offset: -centerX }, // Center
          ];

          for (const pt of snapPoints) {
            if (Math.abs(pt.pos - guide.position) < snapMargin) {
              dx = guide.position + pt.offset;
              this.activeSnapLines.push({ type: "vertical", position: guide.position });
              break;
            }
          }
        }

        // Horizontal snapping
        for (const guide of guides.filter((g) => g.type === "horizontal")) {
          const centerY = (minY + maxY) / 2;
          const snapPoints = [
            { pos: minY + dy, offset: -minY }, // Top
            { pos: maxY + dy, offset: -maxY }, // Bottom
            { pos: centerY + dy, offset: -centerY }, // Center
          ];

          for (const pt of snapPoints) {
            if (Math.abs(pt.pos - guide.position) < snapMargin) {
              dy = guide.position + pt.offset;
              this.activeSnapLines.push({ type: "horizontal", position: guide.position });
              break;
            }
          }
        }
      }
    }
    // --- END GUIDE SNAPPING LOGIC ---

    if (this.isFloating) {
      const floatingLayer = context.project.selection.floatingLayer;
      const initial = this.initialPositions.get("floating-selection");
      if (floatingLayer && initial) {
        const newFloating = {
          ...floatingLayer,
          x: initial.x + dx,
          y: initial.y + dy,
        };
        context.updateProject({
          selection: {
            ...context.project.selection,
            floatingLayer: newFloating,
            bounds: {
              ...context.project.selection.bounds!,
              x: initial.x + dx,
              y: initial.y + dy,
            },
          },
        });
        context.updateSelectionEdges();
      }
    } else {
      const layers = context.project.layers.map((l) => {
        const initial = this.initialPositions.get(l.id);
        if (initial) {
          const updates: any = {
            ...l,
            x: initial.x + dx,
            y: initial.y + dy,
          };

          if (l.mask?.linked && initial.maskX !== undefined && initial.maskY !== undefined) {
            updates.mask = {
              ...l.mask,
              x: initial.maskX + dx,
              y: initial.maskY + dy,
            };
          }
          return updates;
        }
        return l;
      });

      context.updateProject({ layers });
    }
  }

  onMouseUp(e: MouseEvent, context: ToolContext): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.activeSnapLines = [];

      const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
      const dx = Math.round(x - this.startX);
      const dy = Math.round(y - this.startY);

      if (this.historySnapshot && (dx !== 0 || dy !== 0)) {
        context.addHistoryEntry({
          description: "Move Tool",
          state: this.historySnapshot,
        });
      }

      context.updateProject({ isDirty: true });
    }
    this.movingLayerIds = [];
    this.initialPositions.clear();
    this.historySnapshot = null;
  }

  onKeyDown(e: KeyboardEvent, context: ToolContext): boolean {
    const isArrow = e.key.startsWith("Arrow");
    if (!isArrow) return false;

    const { project } = context;
    const targetIds = this.getTargetLayerIds(context);
    if (targetIds.length === 0) return false;

    e.preventDefault();

    const multiplier = e.shiftKey ? 8 : 1;
    let dx = 0;
    let dy = 0;

    if (e.key === "ArrowLeft") dx = -1 * multiplier;
    if (e.key === "ArrowRight") dx = 1 * multiplier;
    if (e.key === "ArrowUp") dy = -1 * multiplier;
    if (e.key === "ArrowDown") dy = 1 * multiplier;

    const history = createHistoryState(project);
    const targetSet = new Set(targetIds);

    const layers = project.layers.map((l) => {
      if (targetSet.has(l.id)) {
        const updates: any = { ...l, x: l.x + dx, y: l.y + dy };
        if (l.mask?.linked) {
          updates.mask = {
            ...l.mask,
            x: l.mask.x + dx,
            y: l.mask.y + dy,
          };
        }
        return updates;
      }
      return l;
    });

    context.addHistoryEntry({
      description: "Move",
      state: history,
    });

    context.updateProject({ layers, isDirty: true });
    return true;
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (!this.isDragging || this.activeSnapLines.length === 0) return;

    const { project } = context;
    ctx.save();
    ctx.setTransform(project.zoom, 0, 0, project.zoom, project.panX, project.panY);

    ctx.lineWidth = 1 / project.zoom;
    ctx.strokeStyle = "red";

    // Viewport bounds in project space
    const viewportWidth = context.canvas.width / project.zoom;
    const viewportHeight = context.canvas.height / project.zoom;
    const startX = -project.panX / project.zoom;
    const startY = -project.panY / project.zoom;

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
