/**
 * Purpose: Modal for editing the color of a color_fill layer.
 */
import React, { useState, useMemo } from "react";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import BaseModal from "./BaseModal";
import { PaintBucket } from "lucide-react";

interface ColorFillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ColorFillModal: React.FC<ColorFillModalProps> = ({ isOpen, onClose }) => {
  const activeTab = useUIStore((state) => state.activeTab);
  const stylingLayerId = useUIStore((state) => state.stylingLayerId);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === activeTab));

  const layer = useMemo(() => {
    if (!project || !stylingLayerId) return null;
    return project.layers.find((l) => l.id === stylingLayerId);
  }, [project, stylingLayerId]);

  // Keep a reference to the last valid layer so it stays visible during exit animation
  const [renderedLayer, setRenderedLayer] = useState(layer);
  if (layer && layer !== renderedLayer) {
    setRenderedLayer(layer);
  }

  const [localColor, setLocalColor] = useState(layer?.colorFill?.color || "#000000");
  const [prevLayerId, setPrevLayerId] = useState(layer?.id);
  const [hasPushedHistory, setHasPushedHistory] = useState(false);

  if (layer && layer.id !== prevLayerId) {
    setPrevLayerId(layer.id);
    setLocalColor(layer.colorFill?.color || "#000000");
    setHasPushedHistory(false);
  }

  const updateLayer = useProjectStore((state) => state.updateLayer);
  const pushHistory = useProjectStore((state) => state.pushHistory);
  const undo = useProjectStore((state) => state.undo);
  const setStylingLayerId = useUIStore((state) => state.setStylingLayerId);

  const handleApply = () => {
    setStylingLayerId(null);
    onClose();
  };

  const handleCancel = () => {
    if (hasPushedHistory && project) {
      undo(project.id);
    }
    setStylingLayerId(null);
    onClose();
  };

  const handleColorChange = (newColor: string) => {
    // Basic validation for hex color if typing
    if (newColor.startsWith("#") || newColor.length === 0) {
      setLocalColor(newColor);
    } else if (/^[0-9A-F]{0,6}$/i.test(newColor)) {
      setLocalColor("#" + newColor);
    }

    if (
      project &&
      renderedLayer &&
      /^#[0-9A-F]{3,6}$/i.test(newColor.startsWith("#") ? newColor : "#" + newColor)
    ) {
      if (!hasPushedHistory) {
        pushHistory(project.id, "Color Fill Change");
        setHasPushedHistory(true);
      }
      const finalColor = newColor.startsWith("#") ? newColor : "#" + newColor;
      updateLayer(project.id, renderedLayer.id, { colorFill: { color: finalColor } });
    }
  };

  if (!renderedLayer && !isOpen) return null;

  return (
    <BaseModal
      id="color-fill-modal"
      isOpen={isOpen}
      onClose={handleCancel}
      title={`Color Fill - ${renderedLayer?.name || "..."}`}
      icon={PaintBucket}
      width="350px"
      height="250px"
      draggable
      centered={true}
      closeOnOutsideClick={false}
    >
      <div className="flex flex-col flex-1 overflow-hidden bg-[#1e1e1e]">
        <div className="p-6 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[0.75rem] text-[#999]">Fill Color</label>
            <div className="flex gap-4 items-center">
              <div
                className="w-10 h-10 rounded-full border-2 border-white/20 hover:border-white/30 has-[input:focus]:border-accent overflow-hidden relative shrink-0 transition-[border-color] duration-200"
                style={{ backgroundColor: localColor }}
              >
                <input
                  type="color"
                  value={localColor.length === 7 ? localColor : "#000000"}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full border-0"
                />
              </div>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={localColor.toUpperCase()}
                  onChange={(e) => handleColorChange(e.target.value)}
                  onBlur={(e) => {
                    // Convert small hex codes to full form on blur
                    const val = e.target.value;
                    if (/^#[0-9A-F]{3}$/i.test(val)) {
                      const expanded = "#" + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                      handleColorChange(expanded);
                    } else if (!/^#[0-9A-F]{6}$/i.test(val)) {
                      // Revert to last valid color if invalid
                      setLocalColor(renderedLayer?.colorFill?.color || "#000000");
                    }
                  }}
                  spellCheck={false}
                  className="bg-bg-primary border border-border text-text p-2 px-3 rounded text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1e1e] transition-all"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-[55px] border-t border-bg-tertiary px-4 bg-bg-secondary flex items-center justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-bg-tertiary text-xs rounded hover:bg-bg-tertiary transition-all outline-none focus-visible:ring-1 focus-visible:ring-accent text-text font-medium"
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
    </BaseModal>
  );
};

export default ColorFillModal;
