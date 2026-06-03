/**
 * Purpose: Sidebar component that displays the stack of layers for the active project, providing controls for adding, deleting, and reordering layers.
 */
import React from "react";
import { useProjectStore, Layer } from "@store/projectStore";
import LayerItem from "./LayerItem";
import {
  Plus,
  Trash2,
  Copy,
  Folder,
  FolderOpen,
  Box,
  Image as ImageIcon,
  Lock,
  Unlock,
  RotateCcw,
  // Blend,
  // CircleDashed,
} from "lucide-react";
import ContextMenu from "../ui/ContextMenu";
import ToolSettingInput from "../ui/ToolSettingInput";

const BLEND_MODES: { label: string; value: GlobalCompositeOperation }[] = [
  { label: "Normal", value: "source-over" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" },
  { label: "Lighten", value: "lighten" },
  { label: "Color Dodge", value: "color-dodge" },
  { label: "Color Burn", value: "color-burn" },
  { label: "Hard Light", value: "hard-light" },
  { label: "Soft Light", value: "soft-light" },
  { label: "Difference", value: "difference" },
  { label: "Exclusion", value: "exclusion" },
  { label: "Hue", value: "hue" },
  { label: "Saturation", value: "saturation" },
  { label: "Color", value: "color" },
  { label: "Luminosity", value: "luminosity" },
];

export const CircleHalfDashed = ({
  size = 24,
  stroke = "currentColor", // Permite que o ícone herde a cor do texto do elemento pai
  strokeWidth = 2,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number | string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="m12 22q0 0 0 0 0 0 0 0 0.5 0 1 0 0.4-0.1 0.9-0.2c0 0-2.1 0.2-1.9 0.2-5.5 0-10-4.5-10-10 0-5.5 4.5-10 10-10-0.2 0 1.9 0.2 1.9 0.2q-0.5-0.1-0.9-0.2-0.5 0-1 0 0 0 0 0 0 0 0 0m5.6 1.7q0.4 0.3 0.8 0.6 0.3 0.3 0.7 0.6 0.3 0.4 0.6 0.8 0.3 0.3 0.6 0.7zm2.7 13.9q-0.3 0.4-0.6 0.8-0.3 0.3-0.7 0.7-0.3 0.3-0.7 0.6zm1.5-7.5q0.1 0.5 0.1 0.9 0.1 0.5 0.1 1 0 0.5-0.1 0.9 0 0.5-0.1 1z"
    />
  </svg>
);

const LayerList: React.FC = () => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const project = useProjectStore(
    (state) => state.projects.find((p) => p.id === activeProjectId) || null,
  );
  const addLayer = useProjectStore((state) => state.addLayer);
  const removeLayers = useProjectStore((state) => state.removeLayers);
  const duplicateLayers = useProjectStore((state) => state.duplicateLayers);
  const reorderLayers = useProjectStore((state) => state.reorderLayers);
  const setSelectedLayers = useProjectStore((state) => state.setSelectedLayers);
  const setActiveLayer = useProjectStore((state) => state.setActiveLayer);
  const updateProject = useProjectStore((state) => state.updateProject);
  const isolateLayer = useProjectStore((state) => state.isolateLayer);
  const updateLayer = useProjectStore((state) => state.updateLayer);
  const pushHistory = useProjectStore((state) => state.pushHistory);
  const groupLayers = useProjectStore((state) => state.groupLayers);
  const ungroupLayers = useProjectStore((state) => state.ungroupLayers);
  const toggleGroupExpansion = useProjectStore((state) => state.toggleGroupExpansion);
  const convertToSmartObject = useProjectStore((state) => state.convertToSmartObject);
  const rasterizeSmartObject = useProjectStore((state) => state.rasterizeSmartObject);
  const resetSmartObjectTransform = useProjectStore((state) => state.resetSmartObjectTransform);
  const addLayerMask = useProjectStore((state) => state.addLayerMask);
  const removeLayerMask = useProjectStore((state) => state.removeLayerMask);

  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  const [visibilityDrag, setVisibilityDrag] = React.useState<{
    targetVisible: boolean;
    changedAny: boolean;
  } | null>(null);

  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    layer: Layer;
  } | null>(null);

  // Global keyboard shortcuts for LayerList
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      if (isCtrl && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (isShift) {
          // Ungroup
          if (activeProjectId && project?.activeLayerId) {
            const activeLayer = project.layers.find((l) => l.id === project.activeLayerId);
            if (activeLayer?.type === "group") {
              ungroupLayers(activeProjectId, activeLayer.id);
            }
          }
        } else {
          // Group
          if (activeProjectId && project?.selectedLayerIds.length) {
            groupLayers(activeProjectId, project.selectedLayerIds);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeProjectId,
    project?.selectedLayerIds,
    project?.activeLayerId,
    project?.layers,
    groupLayers,
    ungroupLayers,
  ]);

  // Global mouseup listener for visibility dragging
  React.useEffect(() => {
    if (!visibilityDrag) return;

    const handleGlobalMouseUp = () => {
      if (visibilityDrag.changedAny && activeProjectId) {
        pushHistory(activeProjectId, "Visibility Change");
      }
      setVisibilityDrag(null);
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [visibilityDrag, activeProjectId, pushHistory]);

  if (!project) return <div className="p-4 text-[#666]">No active project</div>;

  const handleVisibilityMouseDown = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.altKey) {
      isolateLayer(project.id, layerId);
      return;
    }

    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const newVisible = !layer.visible;
    updateLayer(project.id, layerId, { visible: newVisible });
    setVisibilityDrag({ targetVisible: newVisible, changedAny: true });
  };

  const handleVisibilityMouseEnter = (_e: React.MouseEvent, layerId: string) => {
    if (!visibilityDrag) return;

    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || layer.visible === visibilityDrag.targetVisible) return;

    updateLayer(project.id, layerId, { visible: visibilityDrag.targetVisible });
    if (!visibilityDrag.changedAny) {
      setVisibilityDrag({ ...visibilityDrag, changedAny: true });
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    const draggedLayer = project.layers[index];
    let layersToMove = [...project.selectedLayerIds];

    // If the dragged item is not part of the selection, select it
    if (!layersToMove.includes(draggedLayer.id)) {
      layersToMove = [draggedLayer.id];
    }

    // Automatically include ALL descendants of any group being moved
    const getAllDescendants = (parentId: string): string[] => {
      const children = project.layers.filter((l) => l.parentId === parentId);
      let descendants = children.map((l) => l.id);
      children.forEach((child) => {
        if (child.type === "group") {
          descendants = [...descendants, ...getAllDescendants(child.id)];
        }
      });
      return descendants;
    };

    const expandedLayersToMove = new Set(layersToMove);
    layersToMove.forEach((id) => {
      const layer = project.layers.find((l) => l.id === id);
      if (layer?.type === "group") {
        getAllDescendants(id).forEach((descId) => expandedLayersToMove.add(descId));
      }
    });

    const finalLayerIds = Array.from(expandedLayersToMove);
    setSelectedLayers(project.id, finalLayerIds);

    e.dataTransfer.setData("text/plain", JSON.stringify(finalLayerIds));
    e.dataTransfer.effectAllowed = "move";
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, toIndex?: number, position?: "above" | "below") => {
    e.preventDefault();
    e.stopPropagation();

    // if (position !== "above" && position !== "below") {
    //   // Dropped on the container, move to end
    //   toIndex = project.layers.length - 1;
    //   position = "below";
    // }

    const data = e.dataTransfer.getData("text/plain");
    setDraggedIndex(null);

    if (!data) return;

    let layerIds: string[] = [];
    try {
      layerIds = JSON.parse(data);
    } catch {
      // Fallback for single index (compatibility with old data)
      const fromIndex = parseInt(data, 10);
      if (!isNaN(fromIndex)) {
        layerIds = [project.layers[fromIndex].id];
      }
    }

    if (layerIds.length === 0) return;

    // Only process if dropped on a LayerItem (toIndex is defined)
    // OR if dropped on the LayerList container itself (toIndex is undefined)
    const targetLayerId = toIndex !== undefined ? project.layers[toIndex].id : null;
    const reorderPosition = position === "above" ? "above" : "below"; // Default to "below" if position is undefined

    console.log("Reordering layers: ", {
      projectId: project.id,
      layerIds,
      targetLayerId,
      reorderPosition,
    });

    reorderLayers(project.id, layerIds, targetLayerId, reorderPosition);
  };

  const handleLayerClick = (e: React.MouseEvent, layerId: string) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && project.activeLayerId) {
      // Selection range
      const startIndex = project.layers.findIndex((l) => l.id === project.activeLayerId);
      const endIndex = project.layers.findIndex((l) => l.id === layerId);

      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);

      const rangeIds = project.layers.slice(start, end + 1).map((l) => l.id);
      setSelectedLayers(project.id, rangeIds);
      updateProject(project.id, { activeLayerId: layerId });
    } else if (isCtrl) {
      // Toggle individual
      const isSelected = project.selectedLayerIds.includes(layerId);

      if (isSelected && project.activeLayerId !== layerId) {
        // If already selected but not active, just make it active without changing selection
        updateProject(project.id, { activeLayerId: layerId });
      } else if (isSelected) {
        // If already active and selected, deselect it
        const newSelection = project.selectedLayerIds.filter((id) => id !== layerId);
        setSelectedLayers(project.id, newSelection);
      } else {
        // Add to selection and make active
        const newSelection = [...project.selectedLayerIds, layerId];
        setSelectedLayers(project.id, newSelection);
        updateProject(project.id, { activeLayerId: layerId });
      }
    } else {
      // Single selection
      setActiveLayer(project.id, layerId);
    }
  };

  const handleAddNewLayer = () => {
    addLayer(
      project.id,
      {
        type: "raster",
        name: `Layer ${project.layers.length + 1}`,
      },
      false,
      project.activeLayerId ?? undefined,
    );
  };

  const handleDeleteActiveLayer = () => {
    if (project && project.selectedLayerIds.length > 0) {
      removeLayers(project.id, project.selectedLayerIds);
    }
  };

  const handleLayerDropOnContainer = (e: React.DragEvent) => {
    // Only handle if directly on the container (empty space)
    if (e.target === e.currentTarget) {
      handleDrop(e);
    }
  };

  const handleDuplicateActiveLayer = () => {
    if (project && project.selectedLayerIds.length > 0) {
      duplicateLayers(project.id, project.selectedLayerIds);
    }
  };

  const handleGroupSelectedLayers = (e: React.MouseEvent<HTMLButtonElement>) => {
    // if Shift key is held, ungroup instead
    if (e.shiftKey) {
      ungroupLayers(project.id, project.activeLayerId!);
    } else {
      groupLayers(project.id, project.selectedLayerIds);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, layer: Layer) => {
    e.preventDefault();
    e.stopPropagation();

    // If the layer is not part of the selection, select it
    if (!project.selectedLayerIds.includes(layer.id)) {
      setSelectedLayers(project.id, [layer.id]);
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      layer,
    });
  };

  const getDisplayLayers = () => {
    const displayLayers: { layer: Layer; depth: number; actualIndex: number }[] = [];

    // Process from top to bottom (end of array to start)
    // Note: layers are stored bottom-to-top, so we iterate backwards for display
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const layer = project.layers[i];

      // Check if any ancestor is collapsed
      let isHidden = false;
      let currentParentId = layer.parentId;
      let depth = 0;

      while (currentParentId) {
        depth++;
        const parent = project.layers.find((l) => l.id === currentParentId);
        if (parent && !parent.isExpanded) {
          isHidden = true;
        }
        currentParentId = parent?.parentId;
      }

      if (!isHidden) {
        displayLayers.push({ layer, depth, actualIndex: i });
      }
    }

    return displayLayers;
  };

  const activeLayer = project.layers.find((l) => l.id === project.activeLayerId);

  const handleUpdateProperty = (updates: Partial<Layer>, description: string) => {
    if (!activeProjectId || project.selectedLayerIds.length === 0) return;

    // We use pushHistory once for the whole batch
    pushHistory(activeProjectId, description);

    project.selectedLayerIds.forEach((id) => {
      updateLayer(activeProjectId, id, updates);
    });
  };

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden"
      onDragOver={(e) => handleDragOver(e)}
      onDrop={handleLayerDropOnContainer}
      onDragEnd={() => setDraggedIndex(null)}
    >
      {/* Layer Properties */}
      <div className="p-2 px-3 border-b border-bg-tertiary">
        <div
          className={`flex items-center flex-wrap gap-3 gap-y-2 ${!activeLayer && "pointer-events-none opacity-50"}`}
        >
          <div className="flex items-center gap-2" title="Blend Mode">
            {/* <Blend size={16} className="text-[#888]" /> */}
            <select
              className="bg-[#1a1a1a] border border-[#333] text-[0.75rem] px-2 py-1 rounded outline-none text-white hover:border-accent/50 transition-colors cursor-pointer"
              value={activeLayer?.blendMode || "source-over"}
              onChange={(e) =>
                handleUpdateProperty(
                  { blendMode: e.target.value as GlobalCompositeOperation },
                  "Blend Mode Change",
                )
              }
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1" title="Opacity">
            <ToolSettingInput
              label="Opacity"
              // label={<CircleDashed size={16} />}
              value={(activeLayer?.opacity ?? 100) / 100}
              onChange={(val) =>
                handleUpdateProperty({ opacity: Math.round(val * 100) }, "Opacity Change")
              }
              min={0}
              max={1}
              step={0.01}
              unit="%"
              displayMultiplier={100}
            />
          </div>
          <div className="flex items-center gap-1" title="Fill">
            <ToolSettingInput
              label="Fill"
              // label={<CircleHalfDashed size={16} />}
              value={(activeLayer?.fill ?? 100) / 100}
              onChange={(val) =>
                handleUpdateProperty({ fill: Math.round(val * 100) }, "Fill Change")
              }
              min={0}
              max={1}
              step={0.01}
              unit="%"
              displayMultiplier={100}
            />
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        onDragOver={(e) => handleDragOver(e)}
        onDrop={handleLayerDropOnContainer}
        onClick={(e) => {
          // Deselect layers if clicking on empty space
          if (e.target === e.currentTarget) {
            setSelectedLayers(project.id, []);
            setActiveLayer(project.id, null);
          }
        }}
      >
        {getDisplayLayers().map(({ layer, depth, actualIndex }) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            projectId={project.id}
            isActive={project.activeLayerId === layer.id}
            isSelected={project.selectedLayerIds.includes(layer.id)}
            index={actualIndex}
            depth={depth}
            draggedIndex={draggedIndex}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleLayerClick}
            onVisibilityMouseDown={handleVisibilityMouseDown}
            onVisibilityMouseEnter={handleVisibilityMouseEnter}
            onToggleExpansion={toggleGroupExpansion}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {/* Layer Actions Footer */}
      <div className="p-2 border-t border-bg-tertiary flex justify-end gap-2">
        <button
          onClick={() => {
            if (project.activeLayerId) {
              const layer = project.layers.find((l) => l.id === project.activeLayerId);
              if (layer && !layer.mask) {
                addLayerMask(project.id, layer.id);
              }
            }
          }}
          disabled={
            !project.activeLayerId ||
            !!project.layers.find((l) => l.id === project.activeLayerId)?.mask
          }
          className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-white disabled:opacity-30"
          title="Add Layer Mask"
        >
          <CircleHalfDashed size={16} />
        </button>
        <button
          onClick={handleGroupSelectedLayers}
          disabled={!project.activeLayerId}
          className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-white disabled:opacity-30"
          title="Group Layers"
        >
          <Folder size={16} />
        </button>
        <button
          onClick={handleAddNewLayer}
          className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-white"
          title="New Layer"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={handleDuplicateActiveLayer}
          disabled={!project.activeLayerId}
          className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-white disabled:opacity-30"
          title="Duplicate Layer"
        >
          <Copy size={16} />
        </button>
        <button
          onClick={handleDeleteActiveLayer}
          disabled={!project.activeLayerId || project.layers.length <= 1}
          className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-red-400 disabled:opacity-30"
          title="Delete Layer"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          key={`${contextMenu.x}-${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: "Duplicate Layer(s)",
              icon: Copy,
              onClick: () => duplicateLayers(project.id, project.selectedLayerIds),
            },
            {
              label: contextMenu.layer.locked ? "Unlock Layer(s)" : "Lock Layer(s)",
              icon: contextMenu.layer.locked ? Unlock : Lock,
              onClick: () =>
                // Lock/Unlock all selected layers based on the state of the right-clicked layer
                project.selectedLayerIds.forEach((id) => {
                  const targetLayer = project.layers.find((l) => l.id === id);
                  if (targetLayer) {
                    updateLayer(project.id, id, { locked: !contextMenu.layer.locked });
                  }
                }),
            },
            {
              label: "Delete Layer(s)",
              icon: Trash2,
              danger: true,
              onClick: () => removeLayers(project.id, project.selectedLayerIds),
            },
            { isSeparator: true },
            {
              label: "Group Layer(s)",
              icon: Folder,
              onClick: () => groupLayers(project.id, project.selectedLayerIds),
            },
            ...(contextMenu.layer.type === "group"
              ? [
                  {
                    label: "Ungroup Layer(s)",
                    icon: FolderOpen,
                    danger: true,
                    onClick: () => ungroupLayers(project.id, contextMenu.layer.id),
                  },
                ]
              : []),
            { isSeparator: true },

            ...(contextMenu.layer.type === "smart_object"
              ? [
                  {
                    label: "Reset Transform",
                    icon: RotateCcw,
                    onClick: () => resetSmartObjectTransform(project.id, contextMenu.layer.id),
                  },
                  {
                    label: "Rasterize Layer",
                    icon: ImageIcon,
                    onClick: () => rasterizeSmartObject(project.id, contextMenu.layer.id),
                  },
                ]
              : [
                  {
                    label: "Convert to Smart Object",
                    icon: Box,
                    onClick: () => convertToSmartObject(project.id, project.selectedLayerIds),
                  },
                ]),
            { isSeparator: true },
            ...(contextMenu.layer.mask
              ? [
                  {
                    label: "Delete Layer Mask",
                    icon: Trash2,
                    danger: true,
                    onClick: () => removeLayerMask(project.id, contextMenu.layer.id),
                  },
                ]
              : [
                  {
                    label: "Add Layer Mask",
                    icon: CircleHalfDashed,
                    onClick: () => addLayerMask(project.id, contextMenu.layer.id),
                  },
                ]),
          ]}
        />
      )}
    </div>
  );
};

export default LayerList;
