/**
 * Purpose: Tool options component for the Move tool, allowing users to toggle auto-selection functionality.
 */
import React from "react";
import { useToolStore } from "@/renderer/store/toolStore";

export const MoveOptions: React.FC = () => {
  const toolSettings = useToolStore((state) => state.toolSettings);
  const updateToolSettings = useToolStore((state) => state.updateToolSettings);
  const isActive = toolSettings.move.autoSelect;

  return (
    <div className="flex items-center gap-4 h-full text-[0.75rem]">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => updateToolSettings("move", { autoSelect: !toolSettings.move.autoSelect })}
      >
        <input
          type="checkbox"
          checked={isActive}
          readOnly
          className={`w-3 h-3 rounded bg-[#333] border-white/10 accent-accent transition-all`}
        />
        <span className={`font-bold transition-colors text-[#999]`}>AUTO-SELECT</span>
      </div>
    </div>
  );
};
