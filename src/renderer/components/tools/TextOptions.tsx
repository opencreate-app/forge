/**
 * Purpose: Comprehensive options panel for the Text tool, including font family, weight, size, alignment, color, and advanced typography settings.
 */
import React, { useEffect, useRef, useMemo } from "react";
import { useToolStore } from "@/renderer/store/toolStore";
import { useProjectStore } from "@/renderer/store/projectStore";
import { useFontStore } from "@/renderer/store/fontStore";
import { useTextEditorStore } from "@/renderer/store/textEditorStore";
import ToolSettingInput from "@/renderer/components/ui/ToolSettingInput";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  X,
  Check,
  Baseline,
  ArrowDownUp,
  Highlighter,
  Palette,
  CaseSensitive,
  TypeOutline,
} from "lucide-react";
import { TextLayer } from "@/core/layers/TextLayer";
import { scaleTextSpanFontSizes } from "@/core/utils/textSpans";
import type { ToolOptionProps } from "../ToolOptions";
import ColorPickerTrigger from "../ui/ColorPickerTrigger";

const WEIGHT_LABELS: Record<string, string> = {
  "100": "Thin",
  "200": "Extra Light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semi Bold",
  "700": "Bold",
  "800": "Extra Bold",
  "900": "Black",
  normal: "Regular",
  bold: "Bold",
};

const TextOverflowIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 20c0 1.1-0.9 2-2 2h-8c-1.1 0-2-0.9-2-2v-16c0-1.1 0.9-2 2-2h8c1.1 0 2 0.9 2 2" />
    <path d="m21 7h-14m8 5h-8m10 5h-10" />
  </svg>
);

export const TextOptions: React.FC<ToolOptionProps> = ({ onOpenColorPicker }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const toolSettings = useToolStore((state) => state.toolSettings);
  const updateToolSettings = useToolStore((state) => state.updateToolSettings);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const activeProject = useProjectStore((state) =>
    state.projects.find((p) => p.id === activeProjectId),
  );

  const {
    systemFonts,
    googleFonts,
    loadSystemFonts,
    loadGoogleFonts,
    ensureFontLoaded,
    getFontWeights,
  } = useFontStore();

  const textSettings = toolSettings.text;
  const textEditor = useTextEditorStore();
  const hasFormattingRange =
    textEditor.isEditing && textEditor.formatStart !== textEditor.formatEnd;
  const textAlign = textEditor.isEditing ? textEditor.lineAlignment : textSettings.textAlign;
  const fontFamilyValue =
    hasFormattingRange && !textEditor.mixedStyles.fontFamily
      ? textEditor.style.fontFamily || textSettings.fontFamily
      : textSettings.fontFamily;
  const fontWeightValue =
    hasFormattingRange && !textEditor.mixedStyles.fontWeight
      ? textEditor.style.fontWeight || textSettings.fontWeight
      : textSettings.fontWeight;
  const fontSizeValue =
    hasFormattingRange && !textEditor.mixedStyles.fontSize
      ? textEditor.style.fontSize || textSettings.fontSize
      : textSettings.fontSize;
  const colorValue =
    hasFormattingRange && !textEditor.mixedStyles.color
      ? textEditor.style.color || textSettings.color
      : textSettings.color;
  const trackingValue =
    hasFormattingRange && !textEditor.mixedStyles.tracking
      ? (textEditor.style.tracking ?? textSettings.tracking)
      : textSettings.tracking;
  const lineHeightValue = textEditor.isEditing ? textEditor.lineHeight : textSettings.lineHeight;
  const activeToolId = useToolStore((state) => state.activeToolId);

  const dispatchFormat = (detail: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("forge:text-format", { detail }));
  };

  const updateTextStyle = (style: Record<string, unknown>, updateSettings: () => void) => {
    if (hasFormattingRange) {
      dispatchFormat({ type: "setStyle", style });
    } else {
      updateSettings();
    }
  };

  // Initialize fonts
  useEffect(() => {
    loadSystemFonts();
    loadGoogleFonts();
  }, [loadSystemFonts, loadGoogleFonts]);

  // Ensure font is loaded when selected
  useEffect(() => {
    ensureFontLoaded(textSettings.fontFamily);
  }, [textSettings.fontFamily, ensureFontLoaded]);

  const availableWeights = useMemo(
    () => getFontWeights(fontFamilyValue),
    [getFontWeights, fontFamilyValue],
  );

  // Fallback if current weight is missing in new font
  useEffect(() => {
    if (
      !hasFormattingRange &&
      availableWeights.length > 0 &&
      !availableWeights.includes(String(textSettings.fontWeight))
    ) {
      const current = parseInt(String(fontWeightValue)) || 400;
      const closest = availableWeights.reduce((prev, curr) => {
        return Math.abs(parseInt(curr) - current) < Math.abs(parseInt(prev) - current)
          ? curr
          : prev;
      });
      updateToolSettings("text", { fontWeight: closest });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableWeights, fontWeightValue, hasFormattingRange, updateToolSettings]);

  // Sync ToolOptions UI with selected layer properties
  useEffect(() => {
    if (activeProject && activeProject.activeLayerId) {
      const layer = activeProject.layers.find((l) => l.id === activeProject.activeLayerId);
      if (layer && layer.type === "text" && !textSettings.isEditing) {
        const currentLayerProps = {
          fontSize: layer.fontSize || 24,
          fontFamily: layer.fontFamily || "Arial",
          fontWeight: layer.fontWeight || "400",
          color: layer.color || "#000000",
          textAlign: layer.textAlign || "left",
          tracking: layer.tracking || 0,
          lineHeight: layer.lineHeight || 1.2,
          textRendering: layer.textRendering || "bilinear",
          textOverflow: layer.textOverflow !== false,
        };

        const needsUpdate = Object.entries(currentLayerProps).some(
          ([key, value]) => (textSettings as any)[key] !== value,
        );

        if (needsUpdate) {
          updateToolSettings("text", currentLayerProps);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.activeLayerId, textSettings.isEditing, updateToolSettings]);

  // Live updates from ToolOptions to the layer
  useEffect(() => {
    if (activeProject && activeProject.activeLayerId) {
      const layer = activeProject.layers.find((l) => l.id === activeProject.activeLayerId);
      if (layer && layer.type === "text" && (textSettings.isEditing || activeToolId === "text")) {
        const baseUpdates: any = {
          fontSize: hasFormattingRange ? layer.fontSize : textSettings.fontSize,
          fontFamily: hasFormattingRange ? layer.fontFamily : textSettings.fontFamily,
          fontWeight: hasFormattingRange ? layer.fontWeight : textSettings.fontWeight,
          color: hasFormattingRange ? layer.color : textSettings.color,
          textAlign: textSettings.isEditing ? layer.textAlign : textSettings.textAlign,
          tracking: hasFormattingRange ? layer.tracking : textSettings.tracking,
          lineHeight: hasFormattingRange ? layer.lineHeight : textSettings.lineHeight,
          textOverflow: textSettings.textOverflow,
          textRendering: textSettings.textRendering,
        };

        if (!textSettings.isEditing && layer.textAlign !== textSettings.textAlign) {
          baseUpdates.textLineAlignments = undefined;
        }

        let dimensionUpdates: any = {};

        if (!hasFormattingRange && layer.fontSize !== textSettings.fontSize) {
          dimensionUpdates.y = Math.round(layer.y + (layer.fontSize || 24) - textSettings.fontSize);

          const ratio = textSettings.fontSize / (layer.fontSize || 24);
          if (layer.textSpans?.length && Number.isFinite(ratio) && ratio > 0) {
            baseUpdates.textSpans = scaleTextSpanFontSizes(
              layer.text || "",
              layer.textSpans,
              0,
              (layer.text || "").length,
              ratio,
              layer.fontSize || 24,
            );
          }
        }

        if (layer.textType === "point") {
          // Use temporary canvas for measurement
          if (!canvasRef.current) {
            (canvasRef as any).current = document.createElement("canvas");
          }
          const ctx = canvasRef.current!.getContext("2d")!;
          const metrics = TextLayer.calculateMetrics(ctx, layer, {
            ...baseUpdates,
            ...dimensionUpdates,
          });
          dimensionUpdates = {
            ...dimensionUpdates,
            width: metrics.width,
            height: metrics.height,
            x: metrics.x ?? layer.x,
          };
        }

        const updates = { ...baseUpdates, ...dimensionUpdates };
        const hasChange = Object.keys(updates).some(
          (key) => (updates as any)[key] !== (layer as any)[key],
        );

        if (hasChange) {
          useProjectStore
            .getState()
            .updateLayer(activeProject.id, layer.id, updates, !textSettings.isEditing);
        }
      }
    }
  }, [textSettings, activeProject, activeToolId, hasFormattingRange]);

  const handleApply = () => {
    window.dispatchEvent(new CustomEvent("forge:text-apply"));
  };

  const handleCancel = () => {
    window.dispatchEvent(new CustomEvent("forge:text-cancel"));
  };

  const setAlign = (align: "left" | "center" | "right" | "justify") => {
    if (textEditor.isEditing) {
      dispatchFormat({ type: "setLineAlignment", alignment: align });
    }
    updateToolSettings("text", { textAlign: align });
  };

  const handleFontSizeChange = (
    fontSize: number,
    gestureStartValue?: number,
    gestureId?: number,
  ) => {
    const previousSize =
      gestureStartValue ||
      fontSizeValue ||
      activeProject?.layers.find((layer) => layer.id === activeProject.activeLayerId)?.fontSize ||
      24;
    if (hasFormattingRange && previousSize > 0 && fontSize > 0) {
      dispatchFormat({
        type: "scaleFontSize",
        from: previousSize,
        to: fontSize,
        gestureId,
      });
    } else {
      updateToolSettings("text", { fontSize });
    }
  };

  const handleTrackingChange = (tracking: number) => {
    updateTextStyle({ tracking }, () => updateToolSettings("text", { tracking }));
  };

  const handleLineHeightChange = (lineHeight: number) => {
    if (hasFormattingRange) {
      dispatchFormat({ type: "setLineHeight", lineHeight });
    } else {
      updateToolSettings("text", { lineHeight });
    }
  };

  const sortedSystemFonts = useMemo(
    () => [...systemFonts].sort((a, b) => a.family.localeCompare(b.family)),
    [systemFonts],
  );
  const sortedGoogleFonts = useMemo(
    () => [...googleFonts].sort((a, b) => a.family.localeCompare(b.family)),
    [googleFonts],
  );

  return (
    <div className="flex items-center gap-4 w-full">
      {/* Font Family & Weight */}
      <div className="flex items-center gap-2">
        <TypeOutline size={16} className="text-zinc-500" />
        <select
          value={fontFamilyValue}
          onChange={(e) =>
            updateTextStyle({ fontFamily: e.target.value }, () =>
              updateToolSettings("text", { fontFamily: e.target.value }),
            )
          }
          className="bg-zinc-800 border-none text-[0.75rem] text-white px-2 py-1 rounded outline-none focus:ring-1 focus:ring-accent min-w-[100px] max-w-[150px]"
        >
          <optgroup label="System Fonts">
            {sortedSystemFonts.map((f) => (
              <option key={f.family} value={f.family}>
                {f.family}
              </option>
            ))}
          </optgroup>
          <optgroup label="Google Fonts">
            {sortedGoogleFonts.map((f) => (
              <option key={f.family} value={f.family}>
                {f.family}
              </option>
            ))}
          </optgroup>
        </select>

        <select
          value={fontWeightValue}
          onChange={(e) =>
            updateTextStyle({ fontWeight: e.target.value }, () =>
              updateToolSettings("text", { fontWeight: e.target.value }),
            )
          }
          className="bg-zinc-800 border-none text-[0.75rem] text-white px-2 py-1 rounded outline-none focus:ring-1 focus:ring-accent w-28"
        >
          {availableWeights.map((w) => (
            <option key={w} value={w}>
              {WEIGHT_LABELS[w] || w}
            </option>
          ))}
        </select>
      </div>

      <ToolSettingInput
        label={<CaseSensitive size={14} />}
        unit="pt"
        min={1}
        max={1000}
        value={fontSizeValue}
        onChange={handleFontSizeChange}
      />

      {/* Alignment */}
      <div className="flex items-center bg-black/20 rounded p-0.5">
        <button
          onClick={() => setAlign("left")}
          className={`p-1 rounded transition-colors ${textAlign === "left" ? "bg-accent text-white" : "text-zinc-400 hover:text-white"}`}
          title="Align Left"
        >
          <AlignLeft size={16} />
        </button>
        <button
          onClick={() => setAlign("center")}
          className={`p-1 rounded transition-colors ${textAlign === "center" ? "bg-accent text-white" : "text-zinc-400 hover:text-white"}`}
          title="Align Center"
        >
          <AlignCenter size={16} />
        </button>
        <button
          onClick={() => setAlign("right")}
          className={`p-1 rounded transition-colors ${textAlign === "right" ? "bg-accent text-white" : "text-zinc-400 hover:text-white"}`}
          title="Align Right"
        >
          <AlignRight size={16} />
        </button>
        <button
          onClick={() => setAlign("justify")}
          className={`p-1 rounded transition-colors ${textAlign === "justify" ? "bg-accent text-white" : "text-zinc-400 hover:text-white"}`}
          title="Justify"
        >
          <AlignJustify size={16} />
        </button>
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <Palette size={16} className="text-zinc-500" />
        <ColorPickerTrigger
          color={colorValue}
          label="Text Color"
          onClick={() =>
            onOpenColorPicker?.({
              initialColor: colorValue,
              onApply: (color) =>
                updateTextStyle({ color }, () => updateToolSettings("text", { color })),
            })
          }
          className="h-5 w-5 rounded-full"
        />
      </div>

      {/* Advanced Typography */}
      <div className="flex items-center gap-4">
        <ToolSettingInput
          label={<Baseline size={14} />}
          unit="px"
          min={-50}
          max={200}
          value={trackingValue}
          onChange={handleTrackingChange}
        />

        <ToolSettingInput
          label={<ArrowDownUp size={14} />}
          unit="%"
          min={0.1}
          max={10}
          step={5}
          displayMultiplier={100}
          value={lineHeightValue}
          onChange={handleLineHeightChange}
        />

        <button
          onClick={() => updateToolSettings("text", { textOverflow: !textSettings.textOverflow })}
          title="Text Overflow"
          className={`p-1 flex items-center justify-center rounded transition-colors ${
            textSettings.textOverflow ? "bg-accent text-white" : "text-zinc-400 hover:bg-white/5"
          }`}
        >
          <TextOverflowIcon size={16} />
        </button>
      </div>

      {/* Rendering Mode */}
      <div className="flex items-center gap-2">
        <span title="Rendering Mode">
          <Highlighter size={16} className="text-zinc-500" />
        </span>
        <select
          value={textSettings.textRendering}
          onChange={(e) => updateToolSettings("text", { textRendering: e.target.value as any })}
          className="bg-zinc-800 border-none text-[0.75rem] text-white px-2 py-1 rounded outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="bilinear">Smooth</option>
          <option value="nearest">Pixel</option>
        </select>
      </div>

      {textSettings.isEditing && (
        <>
          <div className="w-[1px] h-4 bg-white/10" />
          <div className="flex items-center gap-1">
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
        </>
      )}
    </div>
  );
};
