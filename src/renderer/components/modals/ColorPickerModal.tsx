/**
 * Purpose: Photoshop-style modal for editing foreground/background colors and sampling the canvas.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BaseModal from "./BaseModal";
import { Palette } from "lucide-react";
import { useToolStore } from "@store/toolStore";
import {
  HSBColor,
  RGBColor,
  hexToRgb,
  hsbToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsb,
} from "@utils/colorUtils";
import { ColorSampleRequest, forgeEvents, FORGE_EVENTS, SampledColor } from "@utils/events";

export type ColorPickerTarget = "foreground" | "background";

interface ColorPickerModalProps {
  isOpen: boolean;
  target: ColorPickerTarget;
  onClose: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getPointerTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement ? target.closest('[data-modal-id="color-picker-modal"]') : null;

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ isOpen, target, onClose }) => {
  const foregroundColor = useToolStore((state) => state.foregroundColor);
  const backgroundColor = useToolStore((state) => state.backgroundColor);
  const setForegroundColor = useToolStore((state) => state.setForegroundColor);
  const setBackgroundColor = useToolStore((state) => state.setBackgroundColor);
  const initialColor = target === "foreground" ? foregroundColor : backgroundColor;
  const initialRgb = hexToRgb(initialColor) || { r: 0, g: 0, b: 0 };
  const initialHsb = rgbToHsb(initialRgb);

  const [color, setColorState] = useState<RGBColor>(() => initialRgb);
  const [hexInput, setHexInput] = useState(rgbToHex(color));
  const previousColor = initialColor;
  const pickerRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const activeSelection = useRef<"picker" | "hue" | null>(null);
  const [pickerPosition, setPickerPosition] = useState(() => ({
    x: initialHsb.s / 100,
    y: 1 - initialHsb.b / 100,
  }));
  const [huePosition, setHuePosition] = useState(() => ({ x: 0, y: initialHsb.h / 360 }));

  const hsb = useMemo(() => rgbToHsb(color), [color]);
  const hex = useMemo(() => rgbToHex(color), [color]);

  const setColor = useCallback((nextColor: RGBColor) => {
    setColorState(nextColor);
    setHexInput(rgbToHex(nextColor));
  }, []);

  const colorFromPositions = useCallback(
    (picker: { x: number; y: number }, hue: { x: number; y: number }) =>
      hsbToRgb({
        h: hue.y * 360,
        s: picker.x * 100,
        b: (1 - picker.y) * 100,
      }),
    [],
  );

  useEffect(() => {
    if (!isOpen) return;

    const getCanvasPosition = (event: MouseEvent): DOMRect | null => {
      if (getPointerTarget(event.target)) return null;

      const canvas = document.getElementById("forge-canvas");
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return null;
      }

      return rect;
    };

    const handleMouseMove = (event: MouseEvent) => {
      const isOverCanvas = Boolean(getCanvasPosition(event));
      const canvas = document.getElementById("forge-canvas");
      if (canvas) canvas.style.cursor = isOverCanvas ? "crosshair" : "";
      document.documentElement.style.cursor = isOverCanvas ? "crosshair" : "";
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !getCanvasPosition(event)) return;
      const request: ColorSampleRequest = { x: event.clientX, y: event.clientY };
      forgeEvents.emit(FORGE_EVENTS.REQUEST_COLOR_SAMPLE, request);
      event.preventDefault();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      const canvas = document.getElementById("forge-canvas");
      if (canvas) canvas.style.cursor = "";
      document.documentElement.style.cursor = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleColorSampled = (event: Event) => {
      const sampled = (event as CustomEvent<SampledColor>).detail;
      setColor({ r: sampled.r, g: sampled.g, b: sampled.b });
    };

    forgeEvents.addEventListener(FORGE_EVENTS.COLOR_SAMPLED, handleColorSampled);
    return () => forgeEvents.removeEventListener(FORGE_EVENTS.COLOR_SAMPLED, handleColorSampled);
  }, [isOpen, setColor]);

  const updateHsb = (key: keyof HSBColor, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const nextHsb = { ...hsb, [key]: clamp(parsed, key === "h" ? 0 : 0, key === "h" ? 360 : 100) };
    setColor(hsbToRgb(nextHsb));
  };

  const updateRgb = (key: keyof RGBColor, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setColor({ ...color, [key]: clamp(parsed, 0, 255) });
  };

  const updatePicker = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return;

    const nextPosition = {
      x: clamp(offsetX / bounds.width, 0, 1),
      y: clamp(offsetY / bounds.height, 0, 1),
    };
    setPickerPosition(nextPosition);
    setColor(colorFromPositions(nextPosition, huePosition));
  };

  const updateHue = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;

    const offsetY = event.clientY - bounds.top;
    if (!Number.isFinite(offsetY)) return;

    const nextPosition = { x: 0, y: clamp(offsetY / bounds.height, 0, 1) };
    setHuePosition(nextPosition);
    setColor(colorFromPositions(pickerPosition, nextPosition));
  };

  const beginPointerSelection = (
    event: React.PointerEvent<HTMLDivElement>,
    selection: "picker" | "hue",
    update: (event: React.PointerEvent<HTMLDivElement>) => void,
  ) => {
    activeSelection.current = selection;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some test environments and older WebViews do not implement pointer capture.
    }
    update(event);
  };

  const continuePointerSelection = (
    event: React.PointerEvent<HTMLDivElement>,
    selection: "picker" | "hue",
    update: (event: React.PointerEvent<HTMLDivElement>) => void,
  ) => {
    if (activeSelection.current === selection) update(event);
  };

  const endPointerSelection = (
    event: React.PointerEvent<HTMLDivElement>,
    selection: "picker" | "hue",
  ) => {
    if (activeSelection.current !== selection) return;
    activeSelection.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore browsers without pointer capture support.
    }
  };
  // const [pointerMoving, setPointerMoving] = useState(false);

  // useEffect(() => {
  //   const handlePointerMove = (event: PointerEvent) => {
  //     if (!pointerMoving) return;
  //     const target = getPointerTarget(event.target);
  //     if (!target) return;
  //     const update = target === pickerRef.current ? updatePicker : updateHue;
  //     update(event as unknown as React.PointerEvent<HTMLDivElement>);
  //   };

  //   const handlePointerUp = (event: PointerEvent) => {
  //     if (!pointerMoving) return;
  //     setPointerMoving(false);
  //     const target = getPointerTarget(event.target);
  //     if (!target) return;
  //     event.preventDefault();
  //   };

  //   window.addEventListener("pointermove", handlePointerMove);
  //   window.addEventListener("pointerup", handlePointerUp);
  //   return () => {
  //     window.removeEventListener("pointermove", handlePointerMove);
  //     window.removeEventListener("pointerup", handlePointerUp);
  //   };
  // }, [pointerMoving, updateHue, updatePicker]);

  const handleHexChange = (value: string) => {
    setHexInput(value);
    const parsed = hexToRgb(value);
    if (parsed) setColorState(parsed);
  };

  const handleHexBlur = () => {
    const normalized = normalizeHex(hexInput);
    if (normalized) {
      setHexInput(normalized);
      const parsed = hexToRgb(normalized);
      if (parsed) setColorState(parsed);
    } else {
      setHexInput(hex);
    }
  };

  const handleApply = () => {
    const nextColor = rgbToHex(color);
    if (target === "foreground") setForegroundColor(nextColor);
    else setBackgroundColor(nextColor);
    onClose();
  };

  return (
    <BaseModal
      id="color-picker-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Color Picker"
      icon={Palette}
      width="582px"
      height="433px"
      draggable
      resizable={false}
      closeOnOutsideClick={false}
      // backdropClassName="bg-transparent"
    >
      <div className="flex min-h-0 flex-1 flex-col text-text">
        <div className="flex min-h-0 flex-1 gap-5 overflow-auto p-4">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex min-h-0 flex-1 gap-3">
              <div
                ref={pickerRef}
                role="slider"
                aria-label="Saturation and brightness"
                tabIndex={0}
                className="relative h-[300px] aspect-square cursor-crosshair rounded border border-border"
                style={{ backgroundColor: `hsl(${hsb.h}, 100%, 50%)` }}
                onPointerDown={(event) => beginPointerSelection(event, "picker", updatePicker)}
                onPointerMove={(event) =>
                  continuePointerSelection(event, "picker", updatePicker)
                }
                onPointerUp={(event) => endPointerSelection(event, "picker")}
                onPointerCancel={(event) => endPointerSelection(event, "picker")}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
                <div
                  className={`pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-1 border-white shadow-[0_0_0_1px_#333]`}
                  style={{
                    left: `${pickerPosition.x * 100}%`,
                    top: `${pickerPosition.y * 100}%`,
                    backgroundColor: hex,
                  }}
                />
              </div>
              <div
                ref={hueRef}
                role="slider"
                aria-label="Hue"
                tabIndex={0}
                className="relative h-[300px] w-5 cursor-crosshair rounded border border-border"
                style={{
                  background:
                    "linear-gradient(to bottom, #ff0000 0%, #ffff00 16.6%, #00ff00 33.3%, #00ffff 50%, #0000ff 66.6%, #ff00ff 83.3%, #ff0000 100%)",
                }}
                onPointerDown={(event) => beginPointerSelection(event, "hue", updateHue)}
                onPointerMove={(event) => continuePointerSelection(event, "hue", updateHue)}
                onPointerUp={(event) => endPointerSelection(event, "hue")}
                onPointerCancel={(event) => endPointerSelection(event, "hue")}
              >
                <div
                  className="pointer-events-none absolute left-[-3px] right-[-3px] h-1 rounded border border-white bg-transparent shadow-[0_0_0_1px_#333]"
                  style={{
                    top: `calc(${huePosition.y * 100}% - 2px)`,
                    backgroundColor: `hsl(${huePosition.y * 360}, 100%, 50%)`,
                  }}
                />
              </div>
            </div>
            {/* <p className="text-xs text-[#999]">
              Clique no canvas para capturar uma cor. O valor só será aplicado ao confirmar com OK.
            </p> */}
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 overflow-hidden rounded border border-border">
              <div
                className="h-16"
                style={{ backgroundColor: previousColor }}
                aria-label="Previous color"
              />
              <div className="h-16" style={{ backgroundColor: hex }} aria-label="Current color" />
            </div>

            <div className="grid grid-cols-2 gap-5 text-sm">
              <div className="flex flex-col gap-2">
                <ColorField
                  label="H"
                  value={Math.round(hsb.h)}
                  suffix="°"
                  onChange={(value) => updateHsb("h", value)}
                />
                <ColorField
                  label="S"
                  value={Math.round(hsb.s)}
                  suffix="%"
                  onChange={(value) => updateHsb("s", value)}
                />
                <ColorField
                  label="B"
                  value={Math.round(hsb.b)}
                  suffix="%"
                  onChange={(value) => updateHsb("b", value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <ColorField label="R" value={color.r} onChange={(value) => updateRgb("r", value)} />
                <ColorField label="G" value={color.g} onChange={(value) => updateRgb("g", value)} />
                <ColorField label="B" value={color.b} onChange={(value) => updateRgb("b", value)} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              {/* <span className="w-5 text-[#aaa]">#</span>
              <input
                aria-label="Hex color"
                value={hexInput.replace(/^#/, "")}
                onChange={(event) => handleHexChange(event.target.value)}
                onBlur={handleHexBlur}
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 py-2 font-mono text-sm uppercase outline-none focus-visible:ring-1 focus-visible:ring-accent"
              /> */}
              <ColorField
                label="#"
                type="text"
                value={hexInput.replace(/^#/, "")}
                onChange={(value) => handleHexChange(value)}
                onBlur={handleHexBlur}
                spellCheck={false}
                ariaLabel="Hex color"
                className="font-mono uppercase w-22"
              />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-bg-tertiary p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-bg-tertiary px-4 py-2 text-xs font-medium text-text transition-all hover:bg-bg-tertiary focus-visible:ring-1 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded bg-accent px-8 py-2 text-xs font-bold text-white transition-all hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent"
          >
            OK
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

interface ColorFieldProps {
  label: string;
  value: number | string;
  suffix?: string;
  onChange: (value: string) => void;
  type?: "number" | "text";
  className?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  spellCheck?: boolean;
  ariaLabel?: string;
}

const ColorField: React.FC<ColorFieldProps> = ({
  label,
  value,
  suffix,
  onChange,
  type = "number",
  className,
  onBlur,
  spellCheck,
  ariaLabel,
}) => (
  <div className="flex items-center gap-2">
    <label className="w-4 text-xs">{label}</label>
    <div className="relative group">
      <input
        aria-label={ariaLabel ?? `${label} value`}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        spellCheck={spellCheck}
        onWheel={(event) => {
          if (type === "number" && typeof value === "number") {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -1 : 1;
            onChange(String(value + delta));
          }
        }}
        className={`w-16 rounded border border-border bg-bg-primary p-1.5 px-2 text-xs text-text outline-none transition-all focus:ring-1 focus:ring-accent ${className || ""}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-50 transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

export default ColorPickerModal;
