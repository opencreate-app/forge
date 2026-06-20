import { create } from "zustand";

/**
 * Base interface for layer styles, indicating whether the style is enabled.
 */
export interface BaseStyle {
  /** Whether this style is currently enabled on the layer. */
  enabled: boolean;
}

/**
 * Represents the style for a layer stroke.
 */
export interface StrokeStyle extends BaseStyle {
  /** Size of the stroke in pixels. */
  size: number;
  /** Position of the stroke relative to the layer content. */
  position: "outside" | "center" | "inside";
  /** Opacity of the stroke from 0 to 100. */
  opacity: number;
  /** Color of the stroke. */
  color: string;
  /** Whether the stroke has rounded corners. */
  rounded: boolean;
  /** Whether the stroke uses anti-aliasing. */
  antiAlias: boolean;
}

/**
 * Configuration for a drop shadow style.
 */
export interface DropShadowStyle extends BaseStyle {
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  spread: number;
  size: number;
  noise: number;
}

/**
 * Configuration for an inner shadow style.
 */
export interface InnerShadowStyle extends BaseStyle {
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  spread: number;
  size: number;
  noise: number;
}

/**
 * Collection of styles applied to a layer.
 */
export interface LayerStyles {
  /** Stroke style configuration. */
  stroke?: StrokeStyle;
  /** Drop shadow style configuration. */
  dropShadow?: DropShadowStyle;
  /** Inner shadow style configuration. */
  innerShadow?: InnerShadowStyle;
}

/**
 * Definition of a specific option for a layer style.
 */
export interface StyleOptionDefinition {
  id: string;
  name: string;
  type: "number" | "select" | "color" | "checkbox";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { label: string; value: string }[];
  default: any;
}

/**
 * Definition of a layer style effect.
 */
export interface LayerStyleDefinition {
  id: keyof LayerStyles;
  name: string;
  options: StyleOptionDefinition[];
}

/**
 * Registry of all available layer styles and their configuration options.
 */
export const LAYER_STYLE_DEFINITIONS: LayerStyleDefinition[] = [
  {
    id: "stroke",
    name: "Stroke",
    options: [
      { id: "size", name: "Size", type: "number", min: 1, max: 250, default: 3, unit: "px" },
      {
        id: "position",
        name: "Position",
        type: "select",
        options: [
          { label: "Outside", value: "outside" },
          { label: "Center", value: "center" },
          { label: "Inside", value: "inside" },
        ],
        default: "outside",
      },
      { id: "opacity", name: "Opacity", type: "number", min: 0, max: 100, default: 100, unit: "%" },
      { id: "color", name: "Color", type: "color", default: "#000000" },
      { id: "rounded", name: "Rounded", type: "checkbox", default: true },
      { id: "antiAlias", name: "Anti-aliasing", type: "checkbox", default: true },
    ],
  },
  {
    id: "dropShadow",
    name: "Drop Shadow",
    options: [
      { id: "color", name: "Color", type: "color", default: "#000000" },
      { id: "opacity", name: "Opacity", type: "number", min: 0, max: 100, default: 75, unit: "%" },
      { id: "angle", name: "Angle", type: "number", min: -180, max: 180, default: 90, unit: "°" },
      {
        id: "distance",
        name: "Distance",
        type: "number",
        min: 0,
        max: 100,
        default: 5,
        unit: "px",
      },
      { id: "spread", name: "Spread", type: "number", min: 0, max: 100, default: 0, unit: "%" },
      { id: "size", name: "Size", type: "number", min: 0, max: 250, default: 5, unit: "px" },
      { id: "noise", name: "Noise", type: "number", min: 0, max: 100, default: 0, unit: "%" },
    ],
  },
  {
    id: "innerShadow",
    name: "Inner Shadow",
    options: [
      { id: "color", name: "Color", type: "color", default: "#000000" },
      { id: "opacity", name: "Opacity", type: "number", min: 0, max: 100, default: 75, unit: "%" },
      { id: "angle", name: "Angle", type: "number", min: -180, max: 180, default: 90, unit: "°" },
      {
        id: "distance",
        name: "Distance",
        type: "number",
        min: 0,
        max: 100,
        default: 5,
        unit: "px",
      },
      { id: "spread", name: "Spread", type: "number", min: 0, max: 100, default: 0, unit: "%" },
      { id: "size", name: "Size", type: "number", min: 0, max: 250, default: 5, unit: "px" },
      { id: "noise", name: "Noise", type: "number", min: 0, max: 100, default: 0, unit: "%" },
    ],
  },
];

interface LayerStylesState {
  getAllLayerStyles: () => LayerStyleDefinition[];
}

export const useLayerStylesStore = create<LayerStylesState>(() => ({
  getAllLayerStyles: () => LAYER_STYLE_DEFINITIONS,
}));
