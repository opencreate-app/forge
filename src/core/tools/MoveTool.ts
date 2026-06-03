/**
 * Purpose: Tool for moving layers and selections, including auto-selection logic and support for floating selections.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import { createHistoryState, HistoryState, Layer } from "@/renderer/store/projectStore";

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

    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    // Use Math.round to force movement to project pixels (no subpixels)
    const dx = Math.round(x - this.startX);
    const dy = Math.round(y - this.startY);

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
}
