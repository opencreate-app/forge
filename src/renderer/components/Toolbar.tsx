/**
 * Purpose: Sidebar component containing the primary tool selection buttons and color picker interface.
 */
import React from "react";
import { useToolStore } from "@store/toolStore";
import { useUIStore } from "@store/uiStore";
import { TOOLS } from "../constants/tools";
import { RotateCcw, ArrowRightLeft } from "lucide-react";

interface ToolbarProps {
  onOpenColorPicker: (target: "foreground" | "background") => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ onOpenColorPicker }) => {
  const activeToolId = useToolStore((state) => state.activeToolId);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const transformSettings = useToolStore((state) => state.toolSettings.transform);
  const cropSettings = useToolStore((state) => state.toolSettings.crop);
  const showToast = useUIStore((state) => state.showToast);

  const foregroundColor = useToolStore((state) => state.foregroundColor);
  const backgroundColor = useToolStore((state) => state.backgroundColor);
  const swapColors = useToolStore((state) => state.swapColors);
  const resetColors = useToolStore((state) => state.resetColors);

  const handleToolClick = (id: string) => {
    const isTransformDirty = activeToolId === "transform" && transformSettings.isDirty;
    const isCropDirty = activeToolId === "crop" && cropSettings.isDirty;

    if ((isTransformDirty || isCropDirty) && id !== activeToolId) {
      showToast(
        "<b>Apply (Enter)</b> or <b>Cancel (Esc)</b> before switching tools",
        "warning",
        5000,
      );
      return;
    }
    setActiveTool(id as any);
  };

  return (
    <div className="flex flex-col p-2 pr-[calc(0.5rem-1px)] gap-2 h-full">
      <div className="flex flex-col gap-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            title={tool.label}
            tabIndex={-1}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              activeToolId === tool.id
                ? "bg-accent text-white"
                : "bg-transparent text-[#ccc] hover:bg-white/5"
            } border-none cursor-pointer`}
          >
            <tool.icon size={16} />
          </button>
        ))}
      </div>

      <div className="pt-4 border-t border-white/10 flex flex-col items-center gap-4">
        {/* Color Picker Interface */}
        <div className="relative w-8 h-8">
          {/* Background Color Circle */}
          <div
            className="absolute bottom-0 right-0 w-6 h-6 rounded-full border border-bg-tertiary cursor-pointer overflow-hidden"
            style={{ backgroundColor }}
            title="Background Color"
            onClick={() => onOpenColorPicker("background")}
          />
          {/* Foreground Color Circle */}
          <div
            className="absolute top-0 left-0 w-6 h-6 rounded-full border border-bg-tertiary cursor-pointer overflow-hidden"
            style={{ backgroundColor: foregroundColor }}
            title="Foreground Color"
            onClick={() => onOpenColorPicker("foreground")}
          />

          {/* Swap Button (X) */}
          <button
            onClick={swapColors}
            title="Swap Colors (X)"
            className="absolute -top-2 -right-1 w-4 h-4 hover:bg-[#444] rounded-full flex items-center justify-center text-[#888] hover:text-white transition-colors"
          >
            <ArrowRightLeft size={10} />
          </button>

          {/* Reset Button (D) */}
          <button
            onClick={resetColors}
            title="Default Colors (D)"
            className="absolute -bottom-2 -left-1 w-4 h-4 hover:bg-[#444] rounded-full flex items-center justify-center text-[#888] hover:text-white transition-colors"
          >
            <RotateCcw size={10} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
