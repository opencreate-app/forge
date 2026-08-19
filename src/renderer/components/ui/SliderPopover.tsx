/**
 * Purpose: Shared slider popup presentation used by numeric tool settings and viewport controls.
 */
import React from "react";

export interface SliderPopoverProps {
  isOpen: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLInputElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLInputElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLInputElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLInputElement>) => void;
  minLabel: React.ReactNode;
  maxLabel: React.ReactNode;
  ariaLabel?: string;
  placement?: "top" | "bottom";
  className?: string;
  classNameArrow?: string;
}

const SliderPopover: React.FC<SliderPopoverProps> = ({
  isOpen,
  value,
  min,
  max,
  step,
  onChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  minLabel,
  maxLabel,
  ariaLabel = "Slider",
  placement = "bottom",
  className = "",
  classNameArrow = "",
}) => {
  if (!isOpen) return null;

  const isTopPlacement = placement === "top";

  return (
    <div
      className={`absolute left-[-20px] z-50 min-w-[160px] rounded border border-[#333] bg-[#1a1a1a] p-3 shadow-2xl animate-in fade-in duration-200 ${
        isTopPlacement
          ? "bottom-[calc(100%+8px)] slide-in-from-bottom-2"
          : "top-[calc(100%+8px)] slide-in-from-top-2"
      } ${className}`}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-2">
        <div className="flex justify-between px-0.5 text-[0.65rem] font-bold uppercase text-[#666]">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
        <input
          aria-label={ariaLabel}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onChange={(event) => onChange(parseFloat(event.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#333] accent-accent"
        />
      </div>
      <div
        className={`absolute left-[40px] h-2 w-2 rotate-45 border-[#333] bg-[#1a1a1a] ${
          isTopPlacement ? "bottom-[-5px] border-b border-r" : "top-[-5px] border-l border-t"
        } ${classNameArrow}`}
      />
    </div>
  );
};

export default SliderPopover;
