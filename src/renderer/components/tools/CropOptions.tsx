/**
 * Purpose: Tool options component for the Crop tool, featuring mode selection, ratio inputs, and action buttons for applying or canceling crops.
 */
import React from "react";
import { ArrowLeftRight, Check, X, RotateCcw } from "lucide-react";
import { useToolStore, CropMode } from "@/renderer/store/toolStore";
import ToolSettingInput from "@/renderer/components/ui/ToolSettingInput";

const RATIO_PRESETS = [
  { value: "1:1", ratioW: 1, ratioH: 1 },
  { value: "4:3", ratioW: 4, ratioH: 3 },
  { value: "3:2", ratioW: 3, ratioH: 2 },
  { value: "16:9", ratioW: 16, ratioH: 9 },
] as const;

export const CropOptions: React.FC = () => {
  const crop = useToolStore((state) => state.toolSettings.crop);
  const updateSettings = useToolStore((state) => state.updateToolSettings);

  const selectedRatio =
    crop.mode === "Fixed Ratio"
      ? (RATIO_PRESETS.find(
          (preset) => preset.ratioW === crop.ratioW && preset.ratioH === crop.ratioH,
        )?.value ?? "Fixed Ratio")
      : crop.mode;

  const handleModeChange = (value: string) => {
    const preset = RATIO_PRESETS.find((candidate) => candidate.value === value);
    if (preset) {
      updateSettings("crop", {
        mode: "Fixed Ratio",
        ratioW: preset.ratioW,
        ratioH: preset.ratioH,
      });
      return;
    }

    updateSettings("crop", { mode: value as CropMode });
  };

  const handleSwapRatio = () => {
    updateSettings("crop", {
      mode: "Fixed Ratio",
      ratioW: crop.ratioH,
      ratioH: crop.ratioW,
    });
  };

  const handleApply = () => {
    window.dispatchEvent(new CustomEvent("forge:crop-apply"));
  };

  const handleCancel = () => {
    window.dispatchEvent(new CustomEvent("forge:crop-cancel"));
  };

  const handleReset = () => {
    window.dispatchEvent(new CustomEvent("forge:crop-reset"));
  };

  return (
    <div className="flex items-center gap-4 h-full text-[0.75rem]">
      <div className="flex items-center gap-2">
        <span className="text-[#999] font-bold">MODE:</span>
        <select
          value={selectedRatio}
          onChange={(e) => handleModeChange(e.target.value)}
          className="bg-[#333] border border-white/10 text-text rounded px-1 outline-none h-6"
        >
          <optgroup label="Modes">
            <option value="Free">Free</option>
            <option value="Fixed Ratio">Fixed Ratio</option>
          </optgroup>
          {/* <option disabled value="ratio-divider">
            ──────────
          </option> */}
          <optgroup label="Presets">
            <option value="Original Ratio">Original Ratio</option>
            {RATIO_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.value}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {crop.mode === "Fixed Ratio" && (
        <div className="flex items-center gap-2">
          <ToolSettingInput
            label="W"
            value={crop.ratioW}
            onChange={(v) => updateSettings("crop", { ratioW: v })}
            min={1}
            max={10000}
          />
          <button
            type="button"
            onClick={handleSwapRatio}
            tabIndex={-1}
            aria-label="Swap width and height"
            title="Swap width and height"
            className="p-1 rounded text-[#999] hover:text-white hover:bg-[#444] transition-colors"
          >
            <ArrowLeftRight size={13} />
          </button>
          <span className="text-[#666]">:</span>
          <ToolSettingInput
            label="H"
            value={crop.ratioH}
            onChange={(v) => updateSettings("crop", { ratioH: v })}
            min={1}
            max={10000}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={crop.deleteCropped}
            onChange={(e) => updateSettings("crop", { deleteCropped: e.target.checked })}
            className="w-3 h-3 rounded bg-[#333] border-white/10 accent-accent"
          />
          <span className="text-[#999] font-bold">DELETE OUTSIDE</span>
        </label>
      </div>

      <div className="w-[1px] h-4 bg-white/10" />

      <div className="flex items-center gap-1">
        <button
          onClick={handleReset}
          tabIndex={-1}
          className="p-1 hover:bg-[#444] rounded text-[#ccc] transition-colors"
          title="Reset Crop"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={handleCancel}
          tabIndex={-1}
          className="p-1 hover:bg-[#444] rounded text-red-400 transition-colors"
          title="Cancel (Esc)"
        >
          <X size={18} />
        </button>
        <button
          onClick={handleApply}
          tabIndex={-1}
          className="p-1 hover:bg-[#444] rounded text-green-400 transition-colors"
          title="Apply (Enter)"
        >
          <Check size={18} />
        </button>
      </div>
    </div>
  );
};
