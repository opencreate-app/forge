/**
 * Purpose: Persisted gradient presets used by the Gradient tool and editor.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { GradientStop, GradientType } from "./projectStore";

export interface GradientPreset {
  id: string;
  name: string;
  type: GradientType;
  colors: GradientStop[];
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
  },
  {
    id: "black-white",
    name: "Black → White",
    type: "linear",
    colors: [
      { color: "#000000", position: 0 },
      { color: "#ffffff", position: 1 },
    ],
  },
];

const builtinPresetIds = new Set(defaultPresets.map((preset) => preset.id));

const clonePreset = (preset: GradientPreset): GradientPreset => ({
  ...preset,
  colors: preset.colors.map((stop) => ({ ...stop })),
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
              ? { ...preset, id, colors: preset.colors.map((stop) => ({ ...stop })) }
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
