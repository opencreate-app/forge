/**
 * Purpose: Reusable color swatch trigger that opens the shared ColorPickerModal.
 */
import React from "react";

interface ColorPickerTriggerProps {
  color: string;
  label: string;
  onClick: () => void;
  className?: string;
}

const ColorPickerTrigger: React.FC<ColorPickerTriggerProps> = ({
  color,
  label,
  onClick,
  className = "",
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`cursor-pointer overflow-hidden border border-bg-tertiary outline-none transition-[border-color] hover:border-white/50 focus-visible:ring-1 focus-visible:ring-accent ${className}`}
    style={{ backgroundColor: color }}
  />
);

export default ColorPickerTrigger;
