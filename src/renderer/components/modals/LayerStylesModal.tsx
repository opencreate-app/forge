/**
 * Purpose: Modal for managing layer styles such as stroke, drop shadows, and other effects, similar to Photoshop's Layer Style dialog.
 */
import React, { useState, useMemo } from "react";
import { useProjectStore, LayerStyles } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import { Palette } from "lucide-react";
import BaseModal from "./BaseModal";

interface LayerStylesModalProps {
  /** Flag showing if the modal is currently open */
  isOpen: boolean;
  /** Function called when closing the modal */
  onClose: () => void;
}

/**
 * LayerStylesModal provides a Photoshop-style interface for editing layer effects.
 * It features a list of effects on the left and detailed properties on the right.
 */
export const LayerStylesModal: React.FC<LayerStylesModalProps> = ({ isOpen, onClose }) => {
  const activeTab = useUIStore((state) => state.activeTab);
  const stylingLayerId = useUIStore((state) => state.stylingLayerId);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === activeTab));

  const layer = useMemo(() => {
    if (!project || !stylingLayerId) return null;
    return project.layers.find((l) => l.id === stylingLayerId);
  }, [project, stylingLayerId]);

  const [activeEffect, setActiveEffect] = useState<string>("Stroke");

  // Local state for Stroke, initialized from layer data
  const [strokeEnabled, setStrokeEnabled] = useState(layer?.styles?.stroke?.enabled ?? false);
  const [strokeSize, setStrokeSize] = useState(layer?.styles?.stroke?.size ?? 3);
  const [strokePosition, setStrokePosition] = useState<"outside" | "center" | "inside">(
    layer?.styles?.stroke?.position ?? "outside",
  );
  const [strokeOpacity, setStrokeOpacity] = useState(layer?.styles?.stroke?.opacity ?? 100);
  const [strokeColor, setStrokeColor] = useState(layer?.styles?.stroke?.color ?? "#000000");

  const updateLayer = useProjectStore((state) => state.updateLayer);
  const pushHistory = useProjectStore((state) => state.pushHistory);
  const setStylingLayerId = useUIStore((state) => state.setStylingLayerId);

  const handleClose = () => {
    setStylingLayerId(null);
    onClose();
  };

  const handleApply = () => {
    if (!project || !layer) return;

    const newStyles: LayerStyles = {
      ...layer.styles,
      stroke: {
        enabled: strokeEnabled,
        size: strokeSize,
        position: strokePosition,
        opacity: strokeOpacity,
        color: strokeColor,
      },
    };

    pushHistory(project.id, "Layer Style");
    updateLayer(project.id, layer.id, { styles: newStyles });
    handleClose();
  };

  if (!layer) return null;

  return (
    <BaseModal
      id="layer-styles-modal"
      isOpen={isOpen}
      onClose={handleClose}
      title={`Layer Style - ${layer.name}`}
      icon={Palette}
      width="800px"
      height="550px"
    >
      <div className="flex flex-1 overflow-hidden bg-bg-secondary">
        {/* Left Styles List (Photoshop-style) */}
        <div className="w-[200px] border-r border-bg-tertiary flex flex-col bg-bg-secondary">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 py-4 space-y-1">
            <div
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                activeEffect === "Stroke" ? "bg-accent text-white" : "hover:bg-bg-tertiary text-text"
              }`}
              onClick={() => setActiveEffect("Stroke")}
            >
              <input
                type="checkbox"
                checked={strokeEnabled}
                onChange={(e) => setStrokeEnabled(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="w-3 h-3 accent-accent cursor-pointer"
              />
              <span className="text-xs font-medium">Stroke</span>
            </div>
            {/* Future styles like Drop Shadow, Inner Glow, etc. will go here */}
          </div>
        </div>

        {/* Right Settings Area */}
        <div className="flex-1 flex flex-col bg-[#1e1e1e]">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {activeEffect === "Stroke" && (
              <div className="max-w-[400px] space-y-6">
                <h3 className="text-sm font-bold text-text border-b border-bg-tertiary pb-2 mb-4">
                  Stroke Settings
                </h3>

                {/* Size Control */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-xs text-[#aaa] font-medium uppercase tracking-wider">
                      Size
                    </label>
                    <span className="text-xs text-text bg-bg-tertiary px-1.5 rounded">
                      {strokeSize}px
                    </span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <input
                      type="range"
                      min="1"
                      max="250"
                      value={strokeSize}
                      onChange={(e) => setStrokeSize(parseInt(e.target.value))}
                      className="flex-1 h-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                    <input
                      type="number"
                      min="1"
                      max="250"
                      value={strokeSize}
                      onChange={(e) => setStrokeSize(parseInt(e.target.value) || 1)}
                      className="w-16 bg-bg-primary border border-border text-text p-1.5 px-2 rounded text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>

                {/* Position Control */}
                <div className="space-y-3">
                  <label className="text-xs text-[#aaa] font-medium uppercase tracking-wider">
                    Position
                  </label>
                  <select
                    value={strokePosition}
                    onChange={(e) => setStrokePosition(e.target.value as any)}
                    className="w-full bg-bg-primary border border-border text-text p-2 rounded text-xs outline-none focus:ring-1 focus:ring-accent cursor-pointer transition-all"
                  >
                    <option value="outside">Outside</option>
                    <option value="center">Center</option>
                    <option value="inside">Inside</option>
                  </select>
                </div>

                {/* Opacity Control */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-xs text-[#aaa] font-medium uppercase tracking-wider">
                      Opacity
                    </label>
                    <span className="text-xs text-text bg-bg-tertiary px-1.5 rounded">
                      {strokeOpacity}%
                    </span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={strokeOpacity}
                      onChange={(e) => setStrokeOpacity(parseInt(e.target.value))}
                      className="flex-1 h-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={strokeOpacity}
                      onChange={(e) => setStrokeOpacity(parseInt(e.target.value) || 0)}
                      className="w-16 bg-bg-primary border border-border text-text p-1.5 px-2 rounded text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>

                {/* Color Selection */}
                <div className="space-y-3">
                  <label className="text-xs text-[#aaa] font-medium uppercase tracking-wider">
                    Color
                  </label>
                  <div className="flex gap-3 items-center">
                    <div
                      className="w-10 h-10 rounded border border-white/10 overflow-hidden relative"
                      style={{ backgroundColor: strokeColor }}
                    >
                      <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => setStrokeColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <input
                      type="text"
                      value={strokeColor.toUpperCase()}
                      onChange={(e) => setStrokeColor(e.target.value)}
                      className="flex-1 bg-bg-primary border border-border text-text p-2 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="h-[65px] border-t border-bg-tertiary px-6 bg-bg-secondary flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-bg-tertiary text-xs rounded hover:bg-bg-tertiary transition-all outline-none focus-visible:ring-1 focus-visible:ring-accent text-text font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-8 py-2 bg-accent text-white border-none rounded font-bold transition-all text-xs outline-none hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
};

export default LayerStylesModal;
