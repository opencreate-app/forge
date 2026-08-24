/**
 * Purpose: Generic input component for tool settings, supporting numeric values, scrubbing, scrolling, and a slider popup.
 */
import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import SliderPopover from "./SliderPopover";

interface ToolSettingInputProps {
  label: React.ReactNode;
  value: number;
  onChange: (value: number, gestureStartValue?: number, gestureId?: number) => void;
  min?: number;
  max?: number;
  step?: number;
  shiftStep?: number;
  onSliderPointerDown?: (event: React.PointerEvent<HTMLInputElement>) => void;
  onSliderPointerUp?: (event: React.PointerEvent<HTMLInputElement>) => void;
  onSliderPointerCancel?: (event: React.PointerEvent<HTMLInputElement>) => void;
  unit?: string;
  displayMultiplier?: number; // E.g., 100 for percentage (internal value 1.0 -> 100 in UI)
}

const ToolSettingInput: React.FC<ToolSettingInputProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 500,
  step = 1,
  shiftStep,
  onSliderPointerDown,
  onSliderPointerUp,
  onSliderPointerCancel,
  unit = "",
  displayMultiplier = 1,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startValue = useRef(0);
  const sliderStartValue = useRef(0);
  const gestureSequence = useRef(0);
  const sliderGestureId = useRef<number | null>(null);

  // Value converted for display (e.g., 0.5 * 100 = 50)
  const displayValue = Number((value * displayMultiplier).toFixed(displayMultiplier === 1 ? 0 : 2));

  const getStep = (shiftKey: boolean) => (shiftKey && shiftStep !== undefined ? shiftStep : step);

  const clampAndSave = (newValue: number) => {
    const clamped = Math.min(max, Math.max(min, newValue));
    onChange(clamped);
  };

  // Scrubbing logic (dragging on label)
  const handleMouseDown = (e: React.MouseEvent) => {
    const gestureId = ++gestureSequence.current;
    isDragging.current = true;
    startX.current = e.clientX;
    startValue.current = value;
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = moveEvent.clientX - startX.current;

      // 1px = 1 unit of display value, or one accelerated step with Shift.
      const startDisplayValue = startValue.current * displayMultiplier;
      const activeStep = getStep(moveEvent.shiftKey);
      let newDisplayValue = startDisplayValue + delta * activeStep;

      // Snap to step
      newDisplayValue = Math.round(newDisplayValue / activeStep) * activeStep;

      const newValue = newDisplayValue / displayMultiplier;
      const clamped = Math.min(max, Math.max(min, newValue));
      onChange(clamped, startValue.current, gestureId);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "default";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Scroll logic
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    const delta = (direction * getStep(e.shiftKey)) / displayMultiplier;
    clampAndSave(value + delta);
  };

  // Close slider when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className="relative flex items-center gap-2 selection:bg-accent"
      ref={containerRef}
      onWheel={handleWheel}
    >
      <label
        className="text-[0.75rem] text-[#999] cursor-col-resize select-none font-medium hover:text-white transition-colors"
        onMouseDown={handleMouseDown}
      >
        {label}
      </label>

      <div
        className="flex items-center gap-1 bg-[#1a1a1a] border border-[#333] hover:border-accent/50 px-1.5 py-0.5 rounded transition-all cursor-pointer group"
        onClick={() => setIsOpen(!isOpen)}
      >
        <input
          type="number"
          value={displayValue}
          step={step}
          onChange={(e) => {
            const val = parseFloat(e.target.value) || 0;
            onChange(val / displayMultiplier);
          }}
          onKeyDown={(e) => {
            // Prevent arrow keys from move the layer
            e.stopPropagation();
            if (e.key === "Enter") setIsOpen(false);

            if (
              shiftStep !== undefined &&
              e.shiftKey &&
              (e.key === "ArrowUp" || e.key === "ArrowDown")
            ) {
              e.preventDefault();
              const direction = e.key === "ArrowUp" ? 1 : -1;
              clampAndSave(value + (direction * shiftStep) / displayMultiplier);
            }
          }}
          min={min}
          max={max}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent border-none text-[0.75rem] w-10 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-white font-medium"
        />
        <span className="text-[0.65rem] text-[#666] select-none font-bold">{unit}</span>
        <ChevronDown
          size={12}
          className={`text-[#666] group-hover:text-accent transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : ""}`}
        />
      </div>

      <SliderPopover
        isOpen={isOpen}
        min={min * displayMultiplier}
        max={max * displayMultiplier}
        step={step}
        value={displayValue}
        minLabel={`${Math.round(min * displayMultiplier)}${unit}`}
        maxLabel={`${Math.round(max * displayMultiplier)}${unit}`}
        onPointerDown={(event) => {
          sliderGestureId.current = ++gestureSequence.current;
          sliderStartValue.current = value;
          onSliderPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          sliderGestureId.current = null;
          onSliderPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          sliderGestureId.current = null;
          onSliderPointerCancel?.(event);
        }}
        onChange={(sliderValue) => {
          onChange(
            sliderValue / displayMultiplier,
            sliderStartValue.current,
            sliderGestureId.current ?? undefined,
          );
        }}
      />
    </div>
  );
};

export default ToolSettingInput;
