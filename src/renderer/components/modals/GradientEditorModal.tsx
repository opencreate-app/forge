/**
 * Purpose: Live editor for gradient layers and the two built-in gradient presets.
 */
import React, { useRef, useState } from "react";
import { Blend, Trash2 } from "lucide-react";
import BaseModal from "./BaseModal";
import ColorPickerTrigger from "../ui/ColorPickerTrigger";
import type { ColorPickerOpenRequest } from "@utils/colorPicker";
import type { GradientEditorOpenRequest } from "@utils/gradientEditor";
import {
  createHistoryState,
  GradientOpacityStop,
  GradientStop,
  HistoryState,
  Project,
  useProjectStore,
} from "@store/projectStore";
import type { GradientPreset } from "@store/gradientStore";
import {
  getGradientOpacityStops,
  getGradientPreviewStyle,
  gradientStopToCssColor,
  interpolateGradientColor,
  interpolateGradientOpacity,
  resolveGradientStops,
} from "@utils/gradientUtils";
import { useUIStore } from "@store/uiStore";

interface GradientEditorModalProps {
  isOpen: boolean;
  request: GradientEditorOpenRequest | null;
  onOpenColorPicker: (request: ColorPickerOpenRequest) => void;
  onClose: () => void;
}

interface DraftColorStop extends GradientStop {
  id: string;
  positionInput: string;
}

interface DraftOpacityStop extends GradientOpacityStop {
  id: string;
  opacityInput: string;
  positionInput: string;
}

interface DraftPreset {
  name: string;
  type: GradientPreset["type"];
  colors: DraftColorStop[];
  opacityStops: DraftOpacityStop[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const STOP_REMOVAL_DISTANCE = 40;

const createDraft = (preset: GradientPreset): DraftPreset => {
  const opacityStops = getGradientOpacityStops(preset.colors, preset.opacityStops);

  return {
    name: preset.name,
    type: preset.type,
    colors: preset.colors.map(({ opacity: _opacity, ...stop }, index) => ({
      ...stop,
      id: `${preset.id}-color-stop-${index}`,
      positionInput: `${Math.round(stop.position * 100)}`,
    })),
    opacityStops: opacityStops.map((stop, index) => ({
      ...stop,
      id: `${preset.id}-opacity-stop-${index}`,
      opacityInput: `${Math.round(stop.opacity * 100)}`,
      positionInput: `${Math.round(stop.position * 100)}`,
    })),
  };
};

const toGradientData = (draft: DraftPreset) => ({
  colors: [...draft.colors]
    .sort((a, b) => a.position - b.position)
    .map(({ id: _id, positionInput: _positionInput, ...stop }) => stop),
  opacityStops: [...draft.opacityStops]
    .sort((a, b) => a.position - b.position)
    .map(
      ({ id: _id, opacityInput: _opacityInput, positionInput: _positionInput, ...stop }) => stop,
    ),
});

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
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingStopRef = useRef<{
    kind: "color" | "opacity";
    id: string;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
  } | null>(null);
  const [selectedColorStopId, setSelectedColorStopId] = useState<string | null>(null);
  const [selectedOpacityStopId, setSelectedOpacityStopId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<"color" | "opacity">("color");

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
          opacityStops: activeGradientLayer.gradientFill!.opacityStops,
        })
      : request
        ? createDraft(request.initialPreset)
        : null);

  if (!draft) return null;

  const sortedColors = [...draft.colors].sort((a, b) => a.position - b.position);
  const sortedOpacityStops = [...draft.opacityStops].sort((a, b) => a.position - b.position);
  const selectedColorStop =
    sortedColors.find((stop) => stop.id === selectedColorStopId) || sortedColors[0] || null;
  const selectedOpacityStop =
    sortedOpacityStops.find((stop) => stop.id === selectedOpacityStopId) ||
    sortedOpacityStops[0] ||
    null;
  const previewStops = resolveGradientStops(draft.colors, draft.opacityStops)
    .map((stop) => `${gradientStopToCssColor(stop)} ${stop.position * 100}%`)
    .join(", ");
  // The stop editor is a linear track; the selected gradient type is applied separately.
  const previewBackground = `linear-gradient(90deg, ${previewStops})`;

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
    const gradientData = toGradientData(nextDraft);
    const layers = currentProject.layers.map((layer) =>
      layer.id === editingLayerId && layer.gradientFill
        ? {
            ...layer,
            gradientFill: { ...layer.gradientFill, type: nextDraft.type, ...gradientData },
          }
        : layer,
    );
    store.updateProject(request.projectId, { layers, isDirty: true });
  };

  const commitDraft = (nextDraft: DraftPreset) => {
    setDrafts((current) => ({ ...current, [draftKey]: nextDraft }));
    applyDraftToLayer(nextDraft);
  };

  const updateColorStop = (id: string, update: Partial<DraftColorStop>) =>
    commitDraft({
      ...draft,
      colors: draft.colors.map((stop) => (stop.id === id ? { ...stop, ...update } : stop)),
    });

  const updateOpacityStop = (id: string, update: Partial<DraftOpacityStop>) =>
    commitDraft({
      ...draft,
      opacityStops: draft.opacityStops.map((stop) =>
        stop.id === id ? { ...stop, ...update } : stop,
      ),
    });

  const updateStopOpacity = (id: string, input: string) => {
    const opacityStops = draft.opacityStops.map((stop) =>
      stop.id === id ? { ...stop, opacityInput: input } : stop,
    );
    setDrafts((current) => ({ ...current, [draftKey]: { ...draft, opacityStops } }));
  };

  const commitStopOpacity = (id: string) => {
    const opacityStops = draft.opacityStops.map((stop) => {
      if (stop.id !== id) return stop;
      const parsed = Number(stop.opacityInput);
      const opacity = Number.isFinite(parsed) ? clamp(parsed, 0, 100) : stop.opacity * 100;
      return { ...stop, opacity: opacity / 100, opacityInput: `${opacity}` };
    });
    commitDraft({ ...draft, opacityStops });
  };

  const selectColorStop = (id: string) => {
    setSelectedColorStopId(id);
    setSelectedKind("color");
  };

  const selectOpacityStop = (id: string) => {
    setSelectedOpacityStopId(id);
    setSelectedKind("opacity");
  };

  const updateStopPosition = (kind: "color" | "opacity", id: string, input: string) => {
    const key = kind === "color" ? "colors" : "opacityStops";
    const stops = kind === "color" ? draft.colors : draft.opacityStops;
    const nextStops = stops.map((stop) =>
      stop.id === id ? { ...stop, positionInput: input } : stop,
    );
    setDrafts((current) => ({ ...current, [draftKey]: { ...draft, [key]: nextStops } }));
  };

  const commitStopPosition = (kind: "color" | "opacity", id: string) => {
    const key = kind === "color" ? "colors" : "opacityStops";
    const stops = kind === "color" ? draft.colors : draft.opacityStops;
    const nextStops = stops.map((stop) => {
      if (stop.id !== id) return stop;
      const parsed = Number(stop.positionInput);
      const position = Number.isFinite(parsed) ? clamp(parsed, 0, 100) : stop.position * 100;
      return { ...stop, position: position / 100, positionInput: `${position}` };
    });
    commitDraft({ ...draft, [key]: nextStops });
  };

  const removeColorStop = (id: string) => {
    if (draft.colors.length <= 2) return;
    const colors = draft.colors.filter((stop) => stop.id !== id);
    setSelectedColorStopId(colors[0]?.id || null);
    commitDraft({ ...draft, colors });
  };

  const removeOpacityStop = (id: string) => {
    if (draft.opacityStops.length <= 2) return;
    const opacityStops = draft.opacityStops.filter((stop) => stop.id !== id);
    setSelectedOpacityStopId(opacityStops[0]?.id || null);
    commitDraft({ ...draft, opacityStops });
  };

  const getTrackPosition = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const isPointerBeyondRemovalBoundary = (
    clientX: number,
    clientY: number,
    kind: "color" | "opacity",
  ) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return true;
    if (
      clientX < rect.left - STOP_REMOVAL_DISTANCE ||
      clientX > rect.right + STOP_REMOVAL_DISTANCE
    ) {
      return true;
    }
    return kind === "opacity"
      ? clientY < rect.top - STOP_REMOVAL_DISTANCE
      : clientY > rect.bottom + STOP_REMOVAL_DISTANCE;
  };

  const releasePointerCapture = (target: HTMLButtonElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // Ignore browsers without pointer capture support.
    }
  };

  const updateDraggedStop = (clientX: number) => {
    const draggingStop = draggingStopRef.current;
    if (!draggingStop) return;
    const position = getTrackPosition(clientX);
    const positionInput = `${Math.round(position * 100)}`;
    if (draggingStop.kind === "color") {
      updateColorStop(draggingStop.id, { position, positionInput });
    } else {
      updateOpacityStop(draggingStop.id, { position, positionInput });
    }
  };

  const handleStopPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: "color" | "opacity",
    id: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (kind === "color") selectColorStop(id);
    else selectOpacityStop(id);
    draggingStopRef.current = {
      kind,
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some test environments and older WebViews do not implement pointer capture.
    }
  };

  const handleStopPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const draggingStop = draggingStopRef.current;
    if (!draggingStop) return;
    event.preventDefault();
    if (
      !draggingStop.hasMoved &&
      Math.hypot(
        event.clientX - draggingStop.startClientX,
        event.clientY - draggingStop.startClientY,
      ) <= 3
    ) {
      return;
    }
    draggingStop.hasMoved = true;
    if (isPointerBeyondRemovalBoundary(event.clientX, event.clientY, draggingStop.kind)) {
      draggingStopRef.current = null;
      releasePointerCapture(event.currentTarget, event.pointerId);
      if (draggingStop.kind === "color") removeColorStop(draggingStop.id);
      else removeOpacityStop(draggingStop.id);
      return;
    }
    updateDraggedStop(event.clientX);
  };

  const handleStopPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const draggingStop = draggingStopRef.current;
    if (!draggingStop) return;
    event.preventDefault();
    releasePointerCapture(event.currentTarget, event.pointerId);
    if (!draggingStop.hasMoved) {
      draggingStopRef.current = null;
      return;
    }
    updateDraggedStop(event.clientX);
    draggingStopRef.current = null;
  };

  const handleStopPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    releasePointerCapture(event.currentTarget, event.pointerId);
    draggingStopRef.current = null;
  };

  const handleTrackDoubleClick = (
    event: React.MouseEvent<HTMLDivElement>,
    kind: "color" | "opacity",
  ) => {
    const position = getTrackPosition(event.clientX);
    const id = `gradient-${kind}-stop-${stopIdCounterRef.current++}`;
    if (kind === "color") {
      const stop: DraftColorStop = {
        id,
        color: interpolateGradientColor(draft.colors, position),
        position,
        positionInput: `${Math.round(position * 100)}`,
      };
      setSelectedColorStopId(id);
      setSelectedKind("color");
      commitDraft({ ...draft, colors: [...draft.colors, stop] });
      return;
    }
    const opacity = interpolateGradientOpacity(draft.opacityStops, position);
    const stop: DraftOpacityStop = {
      id,
      opacity,
      opacityInput: `${Math.round(opacity * 100)}`,
      position,
      positionInput: `${Math.round(position * 100)}`,
    };
    setSelectedOpacityStopId(id);
    setSelectedKind("opacity");
    commitDraft({ ...draft, opacityStops: [...draft.opacityStops, stop] });
  };

  const handleApply = () => {
    if (!request) return;
    if (request.target === "preset") {
      request.onApply?.({ name: draft.name, type: draft.type, ...toGradientData(draft) });
    } else if (request.projectId) {
      const store = useProjectStore.getState();
      historySnapshotsRef.current.forEach((state) => {
        store.addHistoryEntry(request.projectId!, { description: "Edit Gradient", state });
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
      width="620px"
      height="560px"
      draggable
      resizable={false}
      centered
      closeOnOutsideClick={false}
    >
      <div className="flex min-h-0 flex-1 flex-col text-text">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-text-secondary">Type</span>
              <select
                value={draft.type}
                onChange={(event) =>
                  commitDraft({ ...draft, type: event.target.value as GradientPreset["type"] })
                }
                className="rounded border border-border bg-bg-primary px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
                <option value="angular">Angular</option>
              </select>
            </label>
            <span className="text-xs text-text-secondary">Double-click a track to add a stop</span>
          </div>

          <div
            ref={trackRef}
            className="relative mx-2 my-5 h-24 rounded border border-border bg-bg-primary"
            style={getGradientPreviewStyle(previewBackground)}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const kind = event.clientY - rect.top < rect.height / 2 ? "opacity" : "color";
              handleTrackDoubleClick(event, kind);
            }}
            aria-label="Gradient stop editor"
          >
            {sortedOpacityStops.map((stop) => (
              <button
                key={`opacity-${stop.id}`}
                type="button"
                aria-label={`Select opacity stop at ${Math.round(stop.position * 100)}%`}
                onClick={(event) => {
                  event.stopPropagation();
                  selectOpacityStop(stop.id);
                }}
                onPointerDown={(event) => handleStopPointerDown(event, "opacity", stop.id)}
                onPointerMove={handleStopPointerMove}
                onPointerUp={handleStopPointerUp}
                onPointerCancel={handleStopPointerCancel}
                className={`absolute top-0 z-20 h-5 w-5 rounded border shadow-[0_0_0_1px_#222] ${
                  selectedKind === "opacity" && selectedOpacityStop?.id === stop.id
                    ? "border-accent"
                    : "border-white"
                }`}
                style={{
                  left: `${stop.position * 100}%`,
                  marginLeft: "-10px",
                  marginTop: "-10px",
                  backgroundColor: `rgb(${stop.opacity * 255} ${stop.opacity * 255} ${stop.opacity * 255})`,
                }}
              />
            ))}
            {sortedColors.map((stop) => (
              <button
                key={`color-${stop.id}`}
                type="button"
                aria-label={`Select color stop at ${Math.round(stop.position * 100)}%`}
                onClick={(event) => {
                  event.stopPropagation();
                  selectColorStop(stop.id);
                }}
                onPointerDown={(event) => handleStopPointerDown(event, "color", stop.id)}
                onPointerMove={handleStopPointerMove}
                onPointerUp={handleStopPointerUp}
                onPointerCancel={handleStopPointerCancel}
                className={`absolute bottom-0 z-20 h-5 w-5 rounded border shadow-[0_0_0_1px_#222] ${
                  selectedKind === "color" && selectedColorStop?.id === stop.id
                    ? "border-accent"
                    : "border-white"
                }`}
                style={{
                  left: `${stop.position * 100}%`,
                  marginLeft: "-10px",
                  marginBottom: "-10px",
                  backgroundColor: stop.color,
                }}
              />
            ))}
          </div>

          {selectedKind === "opacity" && selectedOpacityStop && (
            <section className="flex items-center gap-4 rounded border border-border p-3">
              <div
                className="h-10 w-10 shrink-0 border border-border rounded-full"
                style={{
                  backgroundColor: `rgb(${selectedOpacityStop.opacity * 255} ${selectedOpacityStop.opacity * 255} ${selectedOpacityStop.opacity * 255})`,
                }}
              />
              <div className="flex min-w-0 flex-1 gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-text-secondary">Opacity:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={selectedOpacityStop.opacityInput}
                    onChange={(event) =>
                      updateStopOpacity(selectedOpacityStop.id, event.target.value)
                    }
                    onBlur={() => commitStopOpacity(selectedOpacityStop.id)}
                    aria-label="Gradient stop opacity"
                    className="w-20 rounded border border-border bg-bg-primary px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-text-secondary">%</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-text-secondary">Position:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={selectedOpacityStop.positionInput}
                    onChange={(event) =>
                      updateStopPosition("opacity", selectedOpacityStop.id, event.target.value)
                    }
                    onBlur={() => commitStopPosition("opacity", selectedOpacityStop.id)}
                    aria-label="Gradient opacity stop position"
                    className="w-20 rounded border border-border bg-bg-primary px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-text-secondary">%</span>
                </label>
              </div>
              <button
                type="button"
                disabled={draft.opacityStops.length <= 2}
                onClick={() => removeOpacityStop(selectedOpacityStop.id)}
                aria-label="Remove opacity stop"
                className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-red-400"
                // className="rounded p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
            </section>
          )}

          {selectedKind === "color" && selectedColorStop && (
            <section className="flex items-center gap-4 rounded border border-border p-3">
              <ColorPickerTrigger
                color={selectedColorStop.color}
                label="Edit gradient stop color"
                onClick={() => {
                  const originalColor = selectedColorStop.color;
                  onOpenColorPicker({
                    initialColor: originalColor,
                    onPreview: (color) => updateColorStop(selectedColorStop.id, { color }),
                    onApply: (color) => updateColorStop(selectedColorStop.id, { color }),
                    onCancel: () => updateColorStop(selectedColorStop.id, { color: originalColor }),
                  });
                }}
                className="h-10 w-10 shrink-0 rounded-full"
              />
              <label className="flex flex-1 items-center gap-2 text-xs">
                <span className="text-text-secondary">Position:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedColorStop.positionInput}
                  onChange={(event) =>
                    updateStopPosition("color", selectedColorStop.id, event.target.value)
                  }
                  onBlur={() => commitStopPosition("color", selectedColorStop.id)}
                  aria-label="Gradient color stop position"
                  className="w-20 rounded border border-border bg-bg-primary px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent"
                />
                <span className="text-text-secondary">%</span>
              </label>
              <button
                type="button"
                disabled={draft.colors.length <= 2}
                onClick={() => removeColorStop(selectedColorStop.id)}
                aria-label="Remove color stop"
                className="p-1.5 hover:bg-white/10 rounded transition-colors text-[#ccc] hover:text-red-400"
                // className="rounded p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
            </section>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-bg-tertiary p-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border border-bg-tertiary px-4 py-2 text-xs font-medium transition-all hover:bg-bg-tertiary focus-visible:ring-1 focus:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded bg-accent px-8 py-2 text-xs font-bold text-white transition-all hover:brightness-110 focus-visible:ring-1 focus:ring-accent"
          >
            OK
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default GradientEditorModal;
