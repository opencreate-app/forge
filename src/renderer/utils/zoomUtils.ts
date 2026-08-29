/**
 * Purpose: Shared zoom range and logarithmic slider conversion helpers for viewport controls.
 */

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 50;
export const ZOOM_SLIDER_MIN = 0;
export const ZOOM_SLIDER_MAX = 1000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const sliderValueToZoom = (sliderValue: number) => {
  const normalizedValue = clamp(sliderValue, ZOOM_SLIDER_MIN, ZOOM_SLIDER_MAX) / ZOOM_SLIDER_MAX;
  const minPercent = MIN_ZOOM * 100;
  const maxPercent = MAX_ZOOM * 100;
  const percent = minPercent * Math.pow(maxPercent / minPercent, normalizedValue);
  const roundedPercent = Math.round(percent * 10) / 10;

  return roundedPercent / 100;
};

export const zoomToSliderValue = (zoom: number) => {
  const minPercent = MIN_ZOOM * 100;
  const maxPercent = MAX_ZOOM * 100;
  const percent = clamp(zoom, MIN_ZOOM, MAX_ZOOM) * 100;
  const normalizedValue = Math.log(percent / minPercent) / Math.log(maxPercent / minPercent);

  return normalizedValue * ZOOM_SLIDER_MAX;
};
