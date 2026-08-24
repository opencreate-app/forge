/**
 * Purpose: Shared gradient stop normalization and color interpolation helpers.
 */
import { GradientOpacityStop, GradientStop } from "@store/projectStore";
import { hexToRgb, rgbToHex } from "./colorUtils";

export const CHECKERBOARD_BACKGROUND_COLOR = "#2f2f2f";
export const CHECKERBOARD_BACKGROUND_IMAGE =
  "linear-gradient(45deg, #454545 25%, transparent 25%), linear-gradient(-45deg, #454545 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #454545 75%), linear-gradient(-45deg, transparent 75%, #454545 75%)";

export const getGradientPreviewStyle = (gradient: string) => ({
  backgroundColor: CHECKERBOARD_BACKGROUND_COLOR,
  backgroundImage: `${gradient}, ${CHECKERBOARD_BACKGROUND_IMAGE}`,
  backgroundPosition: "0 0, 0 0, 0 6px, 6px -6px, -6px 0px",
  backgroundRepeat: "no-repeat, repeat, repeat, repeat, repeat",
  backgroundSize: "100% 100%, 12px 12px, 12px 12px, 12px 12px, 12px 12px",
});

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

export const getGradientStopOpacity = (stop: GradientOpacityStop | GradientStop): number =>
  typeof stop.opacity === "number" ? Math.min(1, Math.max(0, stop.opacity)) : 1;

export const sortGradientOpacityStops = (stops: GradientOpacityStop[]): GradientOpacityStop[] =>
  [...stops].sort((a, b) => a.position - b.position);

export const getGradientOpacityStops = (
  colors: GradientStop[],
  opacityStops?: GradientOpacityStop[],
): GradientOpacityStop[] =>
  opacityStops?.length
    ? opacityStops.map((stop) => ({ ...stop, opacity: getGradientStopOpacity(stop) }))
    : colors.map((stop) => ({
        position: stop.position,
        opacity: getGradientStopOpacity(stop),
      }));

export const interpolateGradientOpacity = (
  opacityStops: GradientOpacityStop[],
  position: number,
): number => {
  const stops = sortGradientOpacityStops(opacityStops);
  if (stops.length === 0) return 1;
  if (position <= stops[0].position) return getGradientStopOpacity(stops[0]);
  if (position >= stops[stops.length - 1].position)
    return getGradientStopOpacity(stops[stops.length - 1]);

  const rightIndex = stops.findIndex((stop) => stop.position >= position);
  const right = stops[rightIndex];
  const left = stops[rightIndex - 1];
  const range = right.position - left.position || 1;
  const ratio = (position - left.position) / range;
  return (
    getGradientStopOpacity(left) +
    (getGradientStopOpacity(right) - getGradientStopOpacity(left)) * ratio
  );
};

export const gradientStopToCssColor = (stop: GradientStop): string => {
  const rgb = hexToRgb(stop.color);
  if (!rgb || getGradientStopOpacity(stop) >= 1) return stop.color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${getGradientStopOpacity(stop)})`;
};

export const cloneGradientStops = (colors: GradientStop[]): GradientStop[] =>
  colors.map((stop) => ({ ...stop }));

export const cloneGradientOpacityStops = (stops: GradientOpacityStop[]): GradientOpacityStop[] =>
  stops.map((stop) => ({ ...stop }));

export const resolveGradientStops = (
  colors: GradientStop[],
  opacityStops?: GradientOpacityStop[],
): GradientStop[] => {
  const resolvedOpacityStops = getGradientOpacityStops(colors, opacityStops);
  const positions = [...new Set([...colors, ...resolvedOpacityStops].map((stop) => stop.position))];

  return positions
    .sort((a, b) => a - b)
    .map((position) => ({
      color: interpolateGradientColor(colors, position),
      position,
      opacity: interpolateGradientOpacity(resolvedOpacityStops, position),
    }));
};
