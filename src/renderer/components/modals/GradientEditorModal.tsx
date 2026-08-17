/**
 * Purpose: Live editor for gradient layers and the two built-in gradient presets.
 */
import React, { useRef, useState } from "react";
import { Blend, Plus, Trash2 } from "lucide-react";
import BaseModal from "./BaseModal";
import ColorPickerTrigger from "../ui/ColorPickerTrigger";
import type { ColorPickerOpenRequest } from "@utils/colorPicker";
import type { GradientEditorOpenRequest } from "@utils/gradientEditor";
import {
  createHistoryState,
  GradientStop,
  HistoryState,
  Project,
  useProjectStore,
} from "@store/projectStore";
import type { GradientPreset } from "@store/gradientStore";
import { interpolateGradientColor } from "@utils/gradientUtils";
import { useUIStore } from "@store/uiStore";

interface GradientEditorModalProps {
  isOpen: boolean;
  request: GradientEditorOpenRequest | null;
  onOpenColorPicker: (request: ColorPickerOpenRequest) => void;
  onClose: () => void;
}

interface DraftStop extends GradientStop {
  id: string;
  positionInput: string;
}

interface DraftPreset {
  name: string;
  type: GradientPreset["type"];
  colors: DraftStop[];
}

const createDraft = (preset: GradientPreset): DraftPreset => ({
  name: preset.name,
  type: preset.type,
  colors: preset.colors.map((stop, index) => ({
    ...stop,
    id: `${preset.id}-stop-${index}`,
    positionInput: `${Math.round(stop.position * 100)}`,
  })),
});

const toStops = (draft: DraftPreset): GradientStop[] =>
  [...draft.colors]
    .sort((a, b) => a.position - b.position)
    .map(({ id: _id, positionInput: _positionInput, ...stop }) => stop);

const cloneHistoryState = (state: HistoryState): HistoryState =>
  JSON.parse(JSON.stringify(state)) as HistoryState;

const isLayerLocked = (project: Project, layerId: string) => {
  const layer = project.layers.find((item) => item.id === layerId);
  if (!layer) return false;
  if (layer.locked) return true;
  let parentId = layer.parentId;
  while (parentId) {
    const parent = project.layers.find((item) => item.id === parentId);
    if (!parent) return false;
    if (parent.locked) return true;
    parentId = parent.parentId;
  }
  return false;
};

const GradientEditorModal: React.FC<GradientEditorModalProps> = ({
  isOpen,
  request,
  onOpenColorPicker,
  onClose,
}) => {
  const [drafts, setDrafts] = useState<Record<string, DraftPreset>>(() =>
    request ? { [request.layerId || "preset"]: createDraft(request.initialPreset) } : {},
  );
  const historySnapshotsRef = useRef<Map<string, HistoryState>>(new Map());
  const stopIdCounterRef = useRef(0);

  const project = useProjectStore((state) =>
    request?.projectId ? state.projects.find((item) => item.id === request.projectId) : undefined,
  );
  const activeGradientLayer = project?.layers.find(
    (layer) =>
      layer.id === project.activeLayerId &&
      layer.type === "gradient_fill" &&
      layer.gradientFill &&
      !isLayerLocked(project, layer.id),
  );

  const editingLayerId =
    request?.target === "layer" ? activeGradientLayer?.id || request.layerId || null : null;
  const draftKey = editingLayerId || "preset";
  const draft =
    drafts[draftKey] ||
    (activeGradientLayer
      ? createDraft({
          id: activeGradientLayer.id,
          name: activeGradientLayer.name,
          type: activeGradientLayer.gradientFill!.type,
          colors: activeGradientLayer.gradientFill!.colors,
        })
      : request
        ? createDraft(request.initialPreset)
        : null);

  const sortedStops = draft ? [...draft.colors].sort((a, b) => a.position - b.position) : [];

  if (!draft) return null;

  const previewStops = sortedStops
    .map((stop) => `${stop.color} ${stop.position * 100}%`)
    .join(", ");
  const previewBackground =
    draft.type === "radial"
      ? `radial-gradient(circle, ${previewStops})`
      : draft.type === "angular"
        ? `conic-gradient(${previewStops})`
        : `linear-gradient(90deg, ${previewStops})`;

  const applyDraftToLayer = (nextDraft: DraftPreset) => {
    if (request?.target !== "layer" || !request.projectId || !editingLayerId) return;

    const store = useProjectStore.getState();
    const currentProject = store.projects.find((item) => item.id === request.projectId);
    const currentLayer = currentProject?.layers.find((layer) => layer.id === editingLayerId);
    if (!currentProject || !currentLayer?.gradientFill) return;
    if (isLayerLocked(currentProject, editingLayerId)) {
      useUIStore.getState().showToast("Unlock the layer to edit its gradient.", "warning");
      return;
    }

    if (!historySnapshotsRef.current.has(editingLayerId)) {
      historySnapshotsRef.current.set(
        editingLayerId,
        cloneHistoryState(createHistoryState(currentProject)),
      );
    }

    const layers = currentProject.layers.map((layer) =>
      layer.id === editingLayerId && layer.gradientFill
        ? {
            ...layer,
            gradientFill: {
              ...layer.gradientFill,
              type: nextDraft.type,
              colors: toStops(nextDraft),
            },
          }
        : layer,
    );
    store.updateProject(request.projectId, { layers, isDirty: true });
  };

  const commitDraft = (nextDraft: DraftPreset) => {
    setDrafts((current) => ({ ...current, [draftKey]: nextDraft }));
    applyDraftToLayer(nextDraft);
  };

  const updateStopColor = (id: string, color: string) => {
    const nextDraft = {
      ...draft,
      colors: draft.colors.map((stop) => (stop.id === id ? { ...stop, color } : stop)),
    };
    commitDraft(nextDraft);
  };

  const updateStopInput = (id: string, positionInput: string) => {
    setDrafts((current) => ({
      ...current,
      [draftKey]: {
        ...draft,
        colors: draft.colors.map((stop) => (stop.id === id ? { ...stop, positionInput } : stop)),
      },
    }));
  };

  const commitStopPosition = (id: string) => {
    const nextDraft = {
      ...draft,
      colors: draft.colors.map((stop) => {
        if (stop.id !== id) return stop;
        const parsed = Number(stop.positionInput);
        const position = Number.isFinite(parsed)
          ? Math.min(100, Math.max(0, parsed))
          : stop.position * 100;
        return {
          ...stop,
          position: position / 100,
          positionInput: `${position}`,
        };
      }),
    };
    commitDraft(nextDraft);
  };

  const addStop = () => {
    const position = 0.5;
    const nextStop: DraftStop = {
      id: `gradient-stop-${stopIdCounterRef.current++}-${draft.colors.length}`,
      color: interpolateGradientColor(draft.colors, position),
      position,
      positionInput: "50",
    };
    commitDraft({ ...draft, colors: [...draft.colors, nextStop] });
  };

  const removeStop = (id: string) => {
    if (draft.colors.length <= 2) return;
    commitDraft({ ...draft, colors: draft.colors.filter((stop) => stop.id !== id) });
  };

  const handleApply = () => {
    if (!request) return;

    if (request.target === "preset") {
      request.onApply?.({ name: draft.name, type: draft.type, colors: toStops(draft) });
    } else if (request.projectId) {
      const store = useProjectStore.getState();
      historySnapshotsRef.current.forEach((state) => {
        store.addHistoryEntry(request.projectId!, {
          description: "Edit Gradient",
          state,
        });
      });
      historySnapshotsRef.current.clear();
    }

    onClose();
  };

  const handleCancel = () => {
    if (request?.target === "layer" && request.projectId && historySnapshotsRef.current.size > 0) {
      const store = useProjectStore.getState();
      const currentProject = store.projects.find((item) => item.id === request.projectId);
      if (currentProject) {
        const originalLayers = new Map(
          [...historySnapshotsRef.current.entries()].flatMap(([layerId, state]) => {
            const originalLayer = state.layers.find((layer) => layer.id === layerId);
            return originalLayer ? [[layerId, originalLayer] as const] : [];
          }),
        );
        const layers = currentProject.layers.map((layer) => {
          const originalLayer = originalLayers.get(layer.id);
          return originalLayer
            ? { ...layer, type: originalLayer.type, gradientFill: originalLayer.gradientFill }
            : layer;
        });
        store.updateProject(request.projectId, { layers, isDirty: true });
      }
    }
    historySnapshotsRef.current.clear();
    onClose();
  };

  return (
    <BaseModal
      id="gradient-editor-modal"
      isOpen={isOpen}
      onClose={handleCancel}
      title="Gradient Editor"
      icon={Blend}
      width="520px"
      height="500px"
      draggable
      resizable={false}
      centered
      closeOnOutsideClick={false}
    >
      <div className="flex min-h-0 flex-1 flex-col text-text">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div
            className="h-24 rounded border border-border"
            style={{ background: previewBackground }}
          />

          <div className="flex items-center justify-end">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-text-secondary">Type</span>
              <select
                value={draft.type}
                onChange={(event) =>
                  commitDraft({ ...draft, type: event.target.value as GradientPreset["type"] })
                }
                className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
                <option value="angular">Angular</option>
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Color stops</span>
              <button
                type="button"
                onClick={addStop}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs transition-colors hover:bg-bg-tertiary focus-visible:ring-1 focus-visible:ring-accent"
              >
                <Plus size={13} />
                Add stop
              </button>
            </div>
            {sortedStops.map((stop) => (
              <div
                key={stop.id}
                className="flex items-center gap-3 rounded border border-border p-2"
              >
                <ColorPickerTrigger
                  color={stop.color}
                  label="Edit gradient stop color"
                  onClick={() => {
                    const originalColor = stop.color;
                    onOpenColorPicker({
                      initialColor: originalColor,
                      onPreview: (color) => updateStopColor(stop.id, color),
                      onApply: (color) => updateStopColor(stop.id, color),
                      onCancel: () => updateStopColor(stop.id, originalColor),
                    });
                  }}
                  className="h-7 w-7 shrink-0 rounded-full"
                />
                <label className="flex flex-1 items-center gap-2 text-xs">
                  <span className="text-text-secondary">Position</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={stop.positionInput}
                    onChange={(event) => updateStopInput(stop.id, event.target.value)}
                    onBlur={() => commitStopPosition(stop.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="w-16 rounded border border-border bg-bg-primary px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-text-secondary">%</span>
                </label>
                <button
                  type="button"
                  disabled={draft.colors.length <= 2}
                  onClick={() => removeStop(stop.id)}
                  aria-label="Remove gradient stop"
                  className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-bg-tertiary p-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border border-bg-tertiary px-4 py-2 text-xs font-medium transition-all hover:bg-bg-tertiary focus-visible:ring-1 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded bg-accent px-8 py-2 text-xs font-bold text-white transition-all hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent"
          >
            OK
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default GradientEditorModal;
