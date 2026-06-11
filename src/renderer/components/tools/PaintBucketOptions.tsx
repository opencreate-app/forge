/**
 * Purpose: Tool options component for the Paint Bucket tool, featuring tolerance, anti-aliasing, and contiguous controls.
 */
import React from "react";
import { useToolStore } from "@/renderer/store/toolStore";
import ToolSettingInput from "@/renderer/components/ui/ToolSettingInput";

export const PaintBucketOptions: React.FC = () => {
  const toolSettings = useToolStore((state) => state.toolSettings);
  const updateToolSettings = useToolStore((state) => state.updateToolSettings);

  const settings = toolSettings.paintBucket || {
    tolerance: 40,
    antiAliasing: true,
    contiguous: true,
    fillTarget: "raster",
  };
  const { tolerance, antiAliasing, contiguous, fillTarget } = settings;

  return (
    <div className="flex items-center gap-4 h-full text-[0.75rem]">
      <div className="flex items-center gap-2">
        <span className="text-[#999]">Target</span>
        <select
          value={fillTarget}
          onChange={(e) => updateToolSettings("paintBucket", { fillTarget: e.target.value as any })}
          className="bg-[#1a1a1a] border border-[#333] text-white p-1 rounded text-xs outline-none focus:border-accent transition-all cursor-pointer"
        >
          <option value="raster">Current Layer</option>
          <option value="color_fill">New Fill Layer</option>
        </select>
      </div>

      <ToolSettingInput
        label="Tolerance"
        min={0}
        max={255}
        value={tolerance}
        onChange={(val) => updateToolSettings("paintBucket", { tolerance: val })}
      />

      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => updateToolSettings("paintBucket", { antiAliasing: !antiAliasing })}
      >
        <input
          type="checkbox"
          checked={antiAliasing}
          readOnly
          className="w-3 h-3 rounded bg-[#333] border-white/10 accent-accent transition-all cursor-pointer"
        />
        <span className="font-bold text-[#999]">ANTI-ALIAS</span>
      </div>

      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => updateToolSettings("paintBucket", { contiguous: !contiguous })}
      >
        <input
          type="checkbox"
          checked={contiguous}
          readOnly
          className="w-3 h-3 rounded bg-[#333] border-white/10 accent-accent transition-all cursor-pointer"
        />
        <span className="font-bold text-[#999]">CONTIGUOUS</span>
      </div>
    </div>
  );
};
