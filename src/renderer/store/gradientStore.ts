/**
 * Purpose: Persisted gradient presets used by the Gradient tool and editor.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { GradientStop, GradientType, GradientOpacityStop } from "./projectStore";
import { getGradientOpacityStops } from "@utils/gradientUtils";

export interface GradientPreset {
  id: string;
  name: string;
  type: GradientType;
  colors: GradientStop[];
  opacityStops?: GradientOpacityStop[];
}

interface GradientState {
  presets: GradientPreset[];
  selectedPresetId: string;
  selectPreset: (id: string) => void;
  updatePreset: (id: string, preset: Omit<GradientPreset, "id">) => void;
}

const defaultPresets: GradientPreset[] = [
  {
    id: "foreground-background",
    name: "Foreground → Background",
    type: "linear",
    colors: [
      { color: "#000000", position: 0 },
      { color: "#ffffff", position: 1 },
    ],
    opacityStops: [
      { opacity: 1, position: 0 },
      { opacity: 1, position: 1 },
    ],
  },
  {
    id: "black-white",
    name: "Black → White",
    type: "linear",
    colors: [
      { color: "#000000", position: 0 },
      { color: "#ffffff", position: 1 },
    ],
    opacityStops: [
      { opacity: 1, position: 0 },
      { opacity: 1, position: 1 },
    ],
  },
  {
    id: "foreground-transparent",
    name: "Foreground to Transparent",
    type: "linear",
    colors: [
      { color: "#000000", position: 0 },
      { color: "#000000", position: 1 },
    ],
    opacityStops: [
      { opacity: 1, position: 0 },
      { opacity: 0, position: 1 },
    ],
  },
  {
    id: "rainbow",
    name: "Rainbow",
    type: "linear",
    colors: [
      { color: "#ff0000", position: 0 },
      { color: "#ff8000", position: 0.1667 },
      { color: "#ffff00", position: 0.3333 },
      { color: "#00ff00", position: 0.5 },
      { color: "#00ffff", position: 0.6667 },
      { color: "#0000ff", position: 0.8333 },
      { color: "#8000ff", position: 1 },
    ],
    opacityStops: [
      { opacity: 1, position: 0 },
      { opacity: 1, position: 1 },
    ],
  },
];

const builtinPresetIds = new Set(defaultPresets.map((preset) => preset.id));

const clonePreset = (preset: GradientPreset): GradientPreset => ({
  ...preset,
  colors: preset.colors.map((stop) => ({ ...stop })),
  opacityStops: getGradientOpacityStops(preset.colors, preset.opacityStops),
});

const normalizePresets = (presets: unknown): GradientPreset[] => {
  const persistedPresets = Array.isArray(presets) ? (presets as GradientPreset[]) : [];
  return defaultPresets.map((defaultPreset) => {
    const persistedPreset = persistedPresets.find((preset) => preset?.id === defaultPreset.id);
    return persistedPreset
      ? {
          ...clonePreset(defaultPreset),
          ...persistedPreset,
          id: defaultPreset.id,
          colors: persistedPreset.colors?.map((stop) => ({ ...stop })) || defaultPreset.colors,
          opacityStops: getGradientOpacityStops(
            persistedPreset.colors || defaultPreset.colors,
            persistedPreset.opacityStops,
          ),
        }
      : clonePreset(defaultPreset);
  });
};

export const useGradientStore = create<GradientState>()(
  persist(
    (set) => ({
      presets: defaultPresets.map(clonePreset),
      selectedPresetId: defaultPresets[0].id,
      selectPreset: (id) =>
        set((state) => (builtinPresetIds.has(id) ? { selectedPresetId: id } : state)),
      updatePreset: (id, preset) =>
        set((state) => ({
          presets: state.presets.map((item) =>
            item.id === id && builtinPresetIds.has(id)
              ? {
                  ...preset,
                  id,
                  colors: preset.colors.map((stop) => ({ ...stop })),
                  opacityStops: getGradientOpacityStops(preset.colors, preset.opacityStops),
                }
              : item,
          ),
        })),
    }),
    {
      name: "forge-gradient-storage",
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GradientState>;
        const selectedPresetId =
          persisted.selectedPresetId && builtinPresetIds.has(persisted.selectedPresetId)
            ? persisted.selectedPresetId
            : currentState.selectedPresetId;
        return {
          ...currentState,
          presets: normalizePresets(persisted.presets),
          selectedPresetId,
        };
      },
    },
  ),
);
