/**
 * Purpose: Individual layer entry component within the layer list, handling visibility, locking, renaming, and selection from thumbnails.
 */
import React, { useState, useRef, useEffect } from "react";
import { useProjectStore, Layer, BaseStyle } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { useToolStore } from "@store/toolStore";
import { getOptimizedBoundingBox } from "@/core/utils/imageUtils";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Folder,
  FolderOpen,
  Box,
  X,
  // ChevronRight,
  // ChevronDown,
  // Trash2,
  // Copy
} from "lucide-react";

interface LayerItemProps {
  layer: Layer;
  projectId: string;
  isActive: boolean;
  isSelected: boolean;
  index: number;
  depth: number;
  draggedIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number, position: "above" | "below") => void;
  onDrop: (e: React.DragEvent, index: number, position: "above" | "below") => void;
  onClick: (e: React.MouseEvent, layerId: string) => void;
  onVisibilityMouseDown: (e: React.MouseEvent, layerId: string) => void;
  onVisibilityMouseEnter: (e: React.MouseEvent, layerId: string) => void;
  onToggleExpansion: (projectId: string, layerId: string) => void;
  onContextMenu: (e: React.MouseEvent, layer: Layer) => void;
}

export const EffectsIcon = ({
  size = 24,
  stroke = "currentColor",
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
    <path d="m14.6 3c-3.8 0-7 2.7-7.7 6.4l-2 10.6m-1.9-9.2h9" />
    <path d="m19.7 20c-3.8 0-3.8-9.2-7.7-9.2m-1.3 9.2l10.3-9.2" />
  </svg>
);

export const EffectsSmallIcon = ({
  size = 24,
  stroke = "currentColor",
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
    <path d="m14 5c-2.9 0-5.4 2.1-5.9 4.9l-1.6 8.1m-1.5-7h7" />
    <path d="m18 18c-3 0-3-7-6-7m-1 7l8-7" />
  </svg>
);

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  projectId,
  isActive,
  isSelected,
  index,
  depth,
  draggedIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onClick,
  onVisibilityMouseDown,
  onVisibilityMouseEnter,
  onToggleExpansion,
  onContextMenu,
}) => {
  const renameLayer = useProjectStore((state) => state.renameLayer);
  const toggleLayerLock = useProjectStore((state) => state.toggleLayerLock);
  const openSmartObject = useProjectStore((state) => state.openSmartObject);
  // const setActiveLayer = useProjectStore((state) => state.setActiveLayer);
  const updateProject = useProjectStore((state) => state.updateProject);
  const showToast = useUIStore((state) => state.showToast);
  const setStylingLayerId = useUIStore((state) => state.setStylingLayerId);
  const setActiveMask = useProjectStore((state) => state.setActiveMask);
  const updateLayerMask = useProjectStore((state) => state.updateLayerMask);
  const pushHistory = useProjectStore((state) => state.pushHistory);
  const setForegroundColor = useToolStore((state) => state.setForegroundColor);
  const setBackgroundColor = useToolStore((state) => state.setBackgroundColor);
  const activeMaskId = useProjectStore(
    (state) => state.projects.find((p) => p.id === projectId)?.activeMaskId,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();

    // Prevent feedback on the item being dragged
    if (draggedIndex === index) {
      return;
    }

    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const position = e.clientY <= midpoint ? "above" : "below";
      setDropPosition(position);
      onDragOver(e, index, position);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropPosition) {
      onDrop(e, index, dropPosition);
    }
    setDropPosition(null);
  };

  const toggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLayerLock(projectId, layer.id);
  };

  const handleThumbnailClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      if (!layer.data) {
        showToast("Layer is empty", "warning");
        return;
      }

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = layer.width;
        canvas.height = layer.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);

        const bounds = getOptimizedBoundingBox(canvas, {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        });

        if (!bounds) {
          showToast("Layer is empty", "warning");
          return;
        }

        // Create mask (white on black)
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = bounds.width;
        maskCanvas.height = bounds.height;
        const mctx = maskCanvas.getContext("2d")!;

        mctx.drawImage(
          canvas,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          0,
          0,
          bounds.width,
          bounds.height,
        );
        mctx.globalCompositeOperation = "source-in";
        mctx.fillStyle = "white";
        mctx.fillRect(0, 0, bounds.width, bounds.height);

        useProjectStore.getState().pushHistory(projectId, "Select");

        updateProject(projectId, {
          selection: {
            hasSelection: true,
            bounds: {
              x: layer.x + bounds.x,
              y: layer.y + bounds.y,
              width: bounds.width,
              height: bounds.height,
            },
            mask: maskCanvas.toDataURL(),
          },
        });
      };
      img.src = layer.data;
    }
  };

  const handleRename = () => {
    if (editName.trim() && editName !== layer.name) {
      renameLayer(projectId, layer.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") handleRename();
    if (e.key === "Escape") {
      setEditName(layer.name);
      setIsEditing(false);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStylingLayerId(layer.id);
    window.dispatchEvent(new CustomEvent("forge:open-layer-styles"));
  };

  const hasStylesEnabled = Object.values(layer.styles ?? {}).some(
    (style) => (style as BaseStyle)?.enabled === true,
  );

  // const handleDelete = (e: React.MouseEvent) => {
  //   e.stopPropagation();
  //   removeLayer(projectId, layer.id);
  // };

  // const handleDuplicate = (e: React.MouseEvent) => {
  //   e.stopPropagation();
  //   duplicateLayer(projectId, layer.id);
  // };

  return (
    <div
      ref={itemRef}
      className={`group flex items-center p-1 px-2 select-none border-b border-bg-tertiary ${
        isActive
          ? "bg-bg-tertiary shadow-[inset_1px_0_0_0_var(--color-accent)]"
          : isSelected
            ? "bg-bg-tertiary/70"
            : "bg-transparent hover:bg-bg-tertiary/30"
      } ${!layer.visible ? "opacity-60" : ""} ${draggedIndex === index ? "opacity-30" : ""} ${
        dropPosition === "above" ? "border-t-2 border-t-accent" : ""
      } ${dropPosition === "below" ? "border-b-2 border-b-accent" : ""}`}
      onClick={(e) => onClick(e, layer.id)}
      onDoubleClick={handleDoubleClick}
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropPosition(null)}
      onDrop={handleDrop}
      onContextMenu={(e) => onContextMenu(e, layer)}
    >
      {/* Visibility Toggle */}
      <button
        onClick={(e) => {
          // Prevent click from selecting the layer when toggling visibility
          e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation(); // Prevent opening LayerStylesModal on double click
        }}
        onMouseDown={(e) => onVisibilityMouseDown(e, layer.id)}
        onMouseEnter={(e) => onVisibilityMouseEnter(e, layer.id)}
        tabIndex={-1}
        style={{ marginRight: `${depth * 12 + (layer.type !== "group" ? 8 : 2)}px` }}
        className={`bg-none border-none flex transition-colors mr-2 relative after:absolute after:inset-[-4px] after:cursor-pointer ${
          layer.visible ? "text-text" : "text-[#666]"
        }`}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>

      {/* Group Expansion Toggle */}
      {/* {layer.type === "group" && (
        <button
          className="p-1"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpansion(projectId, layer.id);
          }}
        >
          <ChevronRight
            size={14}
            className="transition-all"
            style={{ rotate: layer.isExpanded ? "90deg" : "0deg" }}
          />
        </button>
      )} */}

      {/* Thumbnail or Icon */}
      <div className="flex items-center gap-1 mr-2 shrink-0">
        {layer.type === "group" ? (
          <button
            className="p-2 py-1 text-text"
            onClick={(e) => {
              e.stopPropagation(); // Prevent opening LayerStylesModal on double click
              // toggle expand or collapse on click
              onToggleExpansion(projectId, layer.id);
            }}
          >
            {layer.isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
          </button>
        ) : layer.data ? (
          <div
            className={`w-8 h-8 bg-[#333] relative rounded border flex items-center justify-center overflow-hidden shrink-0 transition-colors ${
              isActive && activeMaskId !== layer.id
                ? "border-accent ring-1 ring-accent/30"
                : "border-white/10 hover:border-white/30"
            }`}
            onClick={(e) => {
              if (isActive) {
                e.stopPropagation();
                setActiveMask(projectId, null);
                handleThumbnailClick(e);
              } else {
                handleThumbnailClick(e);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation(); // Prevent opening LayerStylesModal on double click
              if (layer.type === "smart_object") {
                openSmartObject(projectId, layer.id);
              }
            }}
          >
            <img
              src={layer.data}
              alt=""
              className="max-w-full max-h-full object-contain pointer-events-none"
            />

            {layer.type === "smart_object" && (
              <div className="absolute right-0 bottom-0 w-4 h-4 bg-bg-secondary text-text rounded-tl flex items-center justify-center">
                <Box size={12} />
              </div>
            )}
          </div>
        ) : (
          <div
            className={`w-8 h-8 bg-[#333] rounded border flex items-center justify-center overflow-hidden shrink-0 transition-colors ${
              isActive && activeMaskId !== layer.id
                ? "border-accent ring-1 ring-accent/30"
                : "border-white/10 hover:border-white/30"
            }`}
            onClick={(e) => {
              if (isActive) {
                e.stopPropagation();
                setActiveMask(projectId, null);
              } else {
                handleThumbnailClick(e);
              }
            }}
          >
            <div className="text-[0.6rem] text-[#555] pointer-events-none">
              {layer.type[0].toUpperCase()}
            </div>
          </div>
        )}

        {/* Mask Thumbnail */}
        {layer.mask && (
          <div
            className={`w-8 h-8 bg-black relative rounded border flex items-center justify-center overflow-hidden shrink-0 transition-colors ${
              isActive && activeMaskId === layer.id
                ? "border-accent ring-1 ring-accent/30"
                : "border-white/10 hover:border-white/30"
            }`}
            onClick={(e) => {
              e.stopPropagation();

              if (e.shiftKey) {
                pushHistory(
                  projectId,
                  layer.mask!.enabled ? "Disable Layer Mask" : "Enable Layer Mask",
                );
                updateLayerMask(projectId, layer.id, { enabled: !layer.mask!.enabled });
                return;
              }

              if (!isActive) {
                onClick(e, layer.id);
              }
              setActiveMask(projectId, layer.id);
              setForegroundColor("#000000");
              setBackgroundColor("#ffffff");
            }}
            onDoubleClick={(e) => {
              e.stopPropagation(); // Prevent opening LayerStylesModal on double click
            }}
          >
            <img
              src={layer.mask.data}
              alt=""
              className={`max-w-full max-h-full object-contain pointer-events-none ${!layer.mask.enabled ? "opacity-30 grayscale" : ""}`}
            />
            {!layer.mask.enabled && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <X size={24} className="text-red-500 opacity-80" strokeWidth={3} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent text-text text-[0.85rem] px-1 rounded outline-none -m-1 selection:bg-accent"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="text-[0.85rem] text-text truncate"
            onDoubleClick={(e) => {
              e.stopPropagation(); // Prevent opening LayerStylesModal on double click
              setEditName(layer.name);
              setIsEditing(true);
            }}
          >
            {layer.name}
          </div>
        )}
      </div>

      <div
        className={`flex items-center text-current ${!layer.locked ? "opacity-0" : ""} group-hover:opacity-100 transition-opacity ml-1`}
      >
        {/* <button
          onClick={handleDuplicate}
          title="Duplicate Layer"
          className="p-1 hover:text-accent text-[#666] transition-colors"
        >
          <Copy size={12} />
        </button> */}
        {/* <button
          onClick={handleDelete}
          title="Delete Layer"
          className="p-1 hover:text-red-400 text-[#666] transition-colors"
        >
          <Trash2 size={12} />
        </button> */}
        {hasStylesEnabled && !isEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setStylingLayerId(layer.id);
              window.dispatchEvent(new CustomEvent("forge:open-layer-styles"));
            }}
            title="Layer Styles"
            className="p-1 !cursor-pointer hover:text-current text-[#666] transition-colors"
          >
            <EffectsIcon size={16} />
          </button>
        )}
        <button
          onClick={toggleLock}
          tabIndex={-1}
          className={`p-1 !cursor-pointer transition-colors ${
            layer.locked ? "text-[#ffcc00]" : "text-[#666] hover:text-text"
          }`}
        >
          {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </div>
    </div>
  );
};

export default LayerItem;
