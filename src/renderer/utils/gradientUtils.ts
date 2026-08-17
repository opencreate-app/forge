/**
 * Purpose: Shared gradient stop normalization and color interpolation helpers.
 */
import { GradientStop } from "@store/projectStore";
import { hexToRgb, rgbToHex } from "./colorUtils";

export const sortGradientStops = (colors: GradientStop[]): GradientStop[] =>
  [...colors].sort((a, b) => a.position - b.position);

export const interpolateGradientColor = (colors: GradientStop[], position: number): string => {
  const stops = sortGradientStops(colors);
  if (stops.length === 0) return "#000000";
  if (position <= stops[0].position) return stops[0].color;
  if (position >= stops[stops.length - 1].position) return stops[stops.length - 1].color;

  const rightIndex = stops.findIndex((stop) => stop.position >= position);
  const right = stops[rightIndex];
  const left = stops[rightIndex - 1];
  const leftRgb = hexToRgb(left.color) || { r: 0, g: 0, b: 0 };
  const rightRgb = hexToRgb(right.color) || { r: 0, g: 0, b: 0 };
  const range = right.position - left.position || 1;
  const ratio = (position - left.position) / range;

  return rgbToHex({
    r: leftRgb.r + (rightRgb.r - leftRgb.r) * ratio,
    g: leftRgb.g + (rightRgb.g - leftRgb.g) * ratio,
    b: leftRgb.b + (rightRgb.b - leftRgb.b) * ratio,
  });
};

export const cloneGradientStops = (colors: GradientStop[]): GradientStop[] =>
  colors.map((stop) => ({ ...stop }));
