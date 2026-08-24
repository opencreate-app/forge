/**
 * Purpose: Floating rich-text controls for the active TextTool selection.
 */
import React from "react";
import { useProjectStore } from "@store/projectStore";
import { useTextEditorStore } from "@store/textEditorStore";
import { useToolStore } from "@store/toolStore";
import {
  isBoldTextFontWeight,
  normalizeTextFontWeight,
  type TextSpanStyle,
} from "@core/utils/textSpans";
import ToolSettingInput from "@/renderer/components/ui/ToolSettingInput";
import ColorPickerTrigger from "@/renderer/components/ui/ColorPickerTrigger";
import type { ColorPickerOpenRequest } from "@utils/colorPicker";

const buttonClass = (active: boolean) =>
  `h-7 min-w-7 rounded px-1.5 text-xs font-semibold transition-colors ${
    active ? "bg-accent text-white" : "text-zinc-300 hover:bg-white/10"
  }`;

interface RichTextToolbarProps {
  onOpenColorPicker: (request: ColorPickerOpenRequest) => void;
}

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({ onOpenColorPicker }) => {
  const editor = useTextEditorStore();
  const textSettings = useToolStore((state) => state.toolSettings.text);
  const updateToolSettings = useToolStore((state) => state.updateToolSettings);
  const project = useProjectStore((state) => {
    const project = state.projects.find((item) => item.id === state.activeProjectId);
    return project;
  });
  const layer = project?.layers.find((item) => item.id === editor.layerId);

  if (!editor.isEditing || editor.isCtrlPressed || !editor.anchor || !layer) return null;

  const hasFormattingRange = editor.formatStart !== editor.formatEnd;
  const style = editor.style;
  const send = (detail: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("forge:text-format", { detail }));
  };
  const toggle = (key: "italic" | "underline" | "strikethrough") => {
    send({ type: "setStyle", style: { [key]: style[key] !== true } });
  };
  const setVerticalAlign = (value: "baseline" | "superscript" | "subscript") => {
    send({
      type: "setStyle",
      style: { verticalAlign: style.verticalAlign === value ? "baseline" : value },
    });
  };
  const currentFontSize = style.fontSize || layer.fontSize || 24;
  const currentColor = style.color || layer.color || "#000000";
  const isBold = isBoldTextFontWeight(style.fontWeight);
  const setStyle = (nextStyle: TextSpanStyle) => {
    send({ type: "setStyle", style: nextStyle });
  };
  const handleFontSizeChange = (
    fontSize: number,
    gestureStartValue?: number,
    gestureId?: number,
  ) => {
    const previousSize =
      gestureStartValue || currentFontSize || textSettings.fontSize || layer.fontSize || 24;
    if (hasFormattingRange && previousSize > 0) {
      send({ type: "scaleFontSize", from: previousSize, to: fontSize, gestureId });
    } else {
      updateToolSettings("text", { fontSize });
    }
  };
  const handleColorApply = (color: string) => {
    setStyle({ color });
    if (!hasFormattingRange) updateToolSettings("text", { color });
  };

  return (
    <div
      className="absolute z-30 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md border border-white/10 bg-zinc-900/95 p-1 shadow-xl backdrop-blur"
      style={{
        left: editor.anchor.x * (project?.zoom || 1) + (project?.panX || 0),
        top: editor.anchor.y * (project?.zoom || 1) + (project?.panY || 0),
        transform: "translateY(-100%) translateY(-8px)",
      }}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).tagName === "BUTTON") event.preventDefault();
      }}
    >
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editor.mixedStyles.fontWeight ? "mixed" : isBold}
        className={buttonClass(isBold)}
        onClick={() =>
          setStyle({
            fontWeight: normalizeTextFontWeight(isBold ? "400" : "700"),
          })
        }
        title="Bold"
      >
        B
      </button>
      {(["italic", "underline", "strikethrough"] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key}
          aria-pressed={editor.mixedStyles[key] ? "mixed" : style[key] === true}
          className={buttonClass(style[key] === true)}
          onClick={() => toggle(key)}
          title={key}
        >
          {key === "italic" ? "I" : key === "underline" ? "U" : "S"}
        </button>
      ))}
      <button
        type="button"
        aria-label="Superscript"
        aria-pressed={
          editor.mixedStyles.verticalAlign ? "mixed" : style.verticalAlign === "superscript"
        }
        className={buttonClass(style.verticalAlign === "superscript")}
        onClick={() => setVerticalAlign("superscript")}
        title="Superscript"
      >
        x²
      </button>
      <button
        type="button"
        aria-label="Subscript"
        aria-pressed={
          editor.mixedStyles.verticalAlign ? "mixed" : style.verticalAlign === "subscript"
        }
        className={buttonClass(style.verticalAlign === "subscript")}
        onClick={() => setVerticalAlign("subscript")}
        title="Subscript"
      >
        x₂
      </button>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <ToolSettingInput
        label="Aa"
        unit="pt"
        min={1}
        max={1000}
        value={currentFontSize}
        onChange={handleFontSizeChange}
      />
      <ColorPickerTrigger
        color={currentColor}
        label="Text Color"
        onClick={() =>
          onOpenColorPicker({
            initialColor: currentColor,
            onApply: handleColorApply,
          })
        }
        className="h-5 w-5 rounded-full mx-1"
      />
    </div>
  );
};
