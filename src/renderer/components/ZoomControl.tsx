/**
 * Purpose: Status-bar zoom control with logarithmic slider precision and fit-to-screen shortcut.
 */
import React, { useEffect, useRef, useState } from "react";
import SliderPopover from "./ui/SliderPopover";
import { forgeEvents, FORGE_EVENTS } from "@utils/events";
import {
  sliderValueToZoom,
  zoomToSliderValue,
  ZOOM_SLIDER_MAX,
  ZOOM_SLIDER_MIN,
} from "@utils/zoomUtils";

interface ZoomControlProps {
  zoom: number;
}

const ZoomControl: React.FC<ZoomControlProps> = ({ zoom }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sliderValue, setSliderValue] = useState(() => zoomToSliderValue(zoom));
  const [isSliderDetached, setIsSliderDetached] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStartX = useRef<number | null>(null);
  const isPointerDragging = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsSliderDetached(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen((open) => !open);
    setSliderValue(zoomToSliderValue(zoom));
    setIsSliderDetached(false);
  };

  const handleZoomChange = (sliderValue: number) => {
    setSliderValue(sliderValue);
    setIsSliderDetached(true);
    window.dispatchEvent(
      new CustomEvent("forge:zoom-to", {
        detail: {
          zoom: sliderValueToZoom(sliderValue),
          immediate: isPointerDragging.current,
        },
      }),
    );
  };

  const handleSliderPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    pointerStartX.current = event.clientX;
    isPointerDragging.current = false;
    setSliderValue(zoomToSliderValue(zoom));
    setIsSliderDetached(true);
  };

  const handleSliderPointerMove = (event: React.PointerEvent<HTMLInputElement>) => {
    if (pointerStartX.current === null) return;
    if (Math.abs(event.clientX - pointerStartX.current) > 2) {
      isPointerDragging.current = true;
    }
  };

  const handleSliderPointerUp = () => {
    pointerStartX.current = null;
  };

  const handleSliderPointerCancel = () => {
    pointerStartX.current = null;
    isPointerDragging.current = false;
    setSliderValue(zoomToSliderValue(zoom));
    setIsSliderDetached(false);
  };

  const handleFitToScreen = () => {
    setIsSliderDetached(false);
    setIsOpen(true);
    forgeEvents.emit(FORGE_EVENTS.FIT_TO_SCREEN);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="text-accent font-bold"
        aria-label="Zoom"
        onClick={handleToggle}
        onDoubleClick={handleFitToScreen}
      >
        Zoom: {Math.round(zoom * 100)}%
      </button>
      <SliderPopover
        isOpen={isOpen}
        value={isSliderDetached ? sliderValue : zoomToSliderValue(zoom)}
        min={ZOOM_SLIDER_MIN}
        max={ZOOM_SLIDER_MAX}
        step={1}
        minLabel="5%"
        maxLabel="5000%"
        ariaLabel="Zoom level"
        placement="top"
        onChange={handleZoomChange}
        onPointerDown={handleSliderPointerDown}
        onPointerMove={handleSliderPointerMove}
        onPointerUp={handleSliderPointerUp}
        onPointerCancel={handleSliderPointerCancel}
        className="left-[auto] right-[-10px]"
        classNameArrow="left-[auto] right-[40px]"
      />
    </div>
  );
};

export default ZoomControl;
