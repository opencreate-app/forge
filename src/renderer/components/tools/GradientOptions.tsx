/**
 * Purpose: Tool options for selecting and editing Gradient presets.
 */
import React, { useMemo } from "react";
import { Edit3 } from "lucide-react";
import { useToolStore } from "@store/toolStore";
import { useGradientStore } from "@store/gradientStore";
import { useProjectStore } from "@store/projectStore";
import type { ToolOptionProps } from "../ToolOptions";
import type { GradientEditorOpenRequest } from "@utils/gradientEditor";
import {
  getGradientPreviewStyle,
  resolveGradientStops,
  gradientStopToCssColor,
} from "@utils/gradientUtils";

interface GradientOptionsProps extends ToolOptionProps {
  onOpenGradientEditor?: (request: GradientEditorOpenRequest) => void;
}

export const GradientOptions: React.FC<GradientOptionsProps> = ({ onOpenGradientEditor }) => {
  const presetId = useToolStore(
    (state) => state.toolSettings.gradient?.presetId || "foreground-background",
  );
  const updateToolSettings = useToolStore((state) => state.updateToolSettings);
  const presets = useGradientStore((state) => state.presets);
  const selectPreset = useGradientStore((state) => state.selectPreset);
  const updatePreset = useGradientStore((state) => state.updatePreset);
  const foregroundColor = useToolStore((state) => state.foregroundColor);
  const backgroundColor = useToolStore((state) => state.backgroundColor);
  const activeProject = useProjectStore((state) =>
    state.projects.find((project) => project.id === state.activeProjectId),
  );

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === presetId) || presets[0],
    [presetId, presets],
  );

  if (!selectedPreset) return null;

  const colors =
    selectedPreset.id === "foreground-background"
      ? [
          { color: foregroundColor, position: 0 },
          { color: backgroundColor, position: 1 },
        ]
      : selectedPreset.id === "foreground-transparent"
        ? selectedPreset.colors.map((stop) => ({ ...stop, color: foregroundColor }))
        : selectedPreset.colors;
  const preview = resolveGradientStops(colors, selectedPreset.opacityStops)
    .map((stop) => `${gradientStopToCssColor(stop)} ${stop.position * 100}%`)
    .join(", ");
  const previewBackground =
    selectedPreset.type === "radial"
      ? `radial-gradient(circle, ${preview})`
      : selectedPreset.type === "angular"
        ? `conic-gradient(${preview})`
        : `linear-gradient(90deg, ${preview})`;

  const openEditor = () => {
    const activeLayer = activeProject?.layers.find(
      (layer) => layer.id === activeProject.activeLayerId,
    );
    const activeGradient = activeLayer?.gradientFill ? activeLayer : null;

    onOpenGradientEditor?.({
      target: activeGradient ? "layer" : "preset",
      projectId: activeGradient ? activeProject?.id : undefined,
      layerId: activeGradient?.id,
      initialPreset: activeGradient
        ? {
            id: activeGradient.id,
            name: activeGradient.name,
            type: activeGradient.gradientFill!.type,
            colors: activeGradient.gradientFill!.colors.map((stop) => ({ ...stop })),
            opacityStops: activeGradient.gradientFill!.opacityStops?.map((stop) => ({ ...stop })),
          }
        : {
            ...selectedPreset,
            colors: colors.map((stop) => ({ ...stop })),
            opacityStops: selectedPreset.opacityStops?.map((stop) => ({ ...stop })),
          },
      onApply: (preset) => {
        if (!activeGradient) {
          updatePreset(selectedPreset.id, preset);
          selectPreset(selectedPreset.id);
          updateToolSettings("gradient", { presetId: selectedPreset.id });
        }
      },
    });
  };

  return (
    <div className="flex h-full items-center gap-3 text-[0.75rem]">
      <label className="flex items-center gap-2 text-[#999]">
        <span>Gradient</span>
        <select
          value={selectedPreset.id}
          onChange={(event) => {
            selectPreset(event.target.value);
            updateToolSettings("gradient", { presetId: event.target.value });
          }}
          className="max-w-48 cursor-pointer rounded border border-[#333] bg-[#1a1a1a] p-1 text-xs text-white outline-none transition-all focus:border-accent"
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <div
        className="h-6 w-28 rounded border border-border"
        style={getGradientPreviewStyle(previewBackground)}
      />
      <button
        type="button"
        onClick={openEditor}
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-text transition-colors hover:bg-bg-tertiary focus-visible:ring-1 focus-visible:ring-accent"
      >
        <Edit3 size={13} />
        Edit
      </button>
    </div>
  );
};
