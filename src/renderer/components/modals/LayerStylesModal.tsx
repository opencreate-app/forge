/**
 * Purpose: Modal for managing layer styles such as stroke, drop shadows, and other effects, similar to Photoshop's Layer Style dialog.
 */
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useProjectStore } from "@store/projectStore";
import { useLayerStylesStore, LayerStyles } from "@store/layerStylesStore";
import { useUIStore } from "@store/uiStore";
import BaseModal from "./BaseModal";
import { EffectsIcon } from "../Sidebar/LayerItem";
import ColorPickerTrigger from "../ui/ColorPickerTrigger";
import type { ColorPickerOpenRequest } from "@utils/colorPicker";

interface LayerStylesModalProps {
  /** Flag showing if the modal is currently open */
  isOpen: boolean;
  /** Function called when closing the modal */
  onClose: () => void;
  onOpenColorPicker: (request: ColorPickerOpenRequest) => void;
}

/**
 * LayerStylesModal provides a Photoshop-style interface for editing layer effects.
 * It features a list of effects on the left and detailed properties on the right.
 */
export const LayerStylesModal: React.FC<LayerStylesModalProps> = ({
  isOpen,
  onClose,
  onOpenColorPicker,
}) => {
  const layerStyleDefinitions = useLayerStylesStore((state) => state.getAllLayerStyles());
  const activeTab = useUIStore((state) => state.activeTab);
  const stylingLayerId = useUIStore((state) => state.stylingLayerId);
  const lastLayerStyleEffects = useUIStore((state) => state.lastLayerStyleEffects);
  const setLastLayerStyleEffect = useUIStore((state) => state.setLastLayerStyleEffect);
  const project = useProjectStore((state) => state.projects.find((p) => p.id === activeTab));

  // Memoize the currently styled layer to avoid unnecessary re-renders when other parts of the project change
  const layer = useMemo(() => {
    // Return null if there's no project or no styling layer selected
    if (!project || !stylingLayerId) return null;
    return project.layers.find((l) => l.id === stylingLayerId);
  }, [project, stylingLayerId]);

  // Keep a reference to the last valid layer so it stays visible during exit animation
  const [renderedLayer, setRenderedLayer] = useState(layer);
  if (layer && layer !== renderedLayer) {
    setRenderedLayer(layer);
  }

  const [activeEffectId, setActiveEffectId] = useState<keyof LayerStyles | null>(
    layer ? lastLayerStyleEffects[layer.id] || null : null,
  );
  const [localStyles, setLocalStyles] = useState<LayerStyles>(layer?.styles || {});
  const [prevLayerId, setPrevLayerId] = useState(layer?.id);

  // Intelligent History Tracking
  const hasPushedHistoryRef = useRef(false);
  const localStylesRef = useRef<LayerStyles>(localStyles);

  if (layer && layer.id !== prevLayerId) {
    setPrevLayerId(layer.id);
    setLocalStyles(layer.styles || {});
    setActiveEffectId(layer ? lastLayerStyleEffects[layer.id] || null : null);
  }

  useEffect(() => {
    if (layer && layer.id !== prevLayerId) {
      localStylesRef.current = layer.styles || {};
      hasPushedHistoryRef.current = false;
    }
  }, [layer, prevLayerId]);

  const updateLayer = useProjectStore((state) => state.updateLayer);
  const pushHistory = useProjectStore((state) => state.pushHistory);
  const undo = useProjectStore((state) => state.undo);
  const setStylingLayerId = useUIStore((state) => state.setStylingLayerId);

  const ensureHistoryPushed = () => {
    if (!hasPushedHistoryRef.current && project) {
      pushHistory(project.id, "Layer Style");
      hasPushedHistoryRef.current = true;
    }
  };

  const handleCancel = () => {
    if (hasPushedHistoryRef.current && project) {
      undo(project.id);
    }
    setStylingLayerId(null);
    onClose();
  };

  const handleApply = () => {
    if (!project || !renderedLayer) return;

    // Changes are already applied in real-time.
    // We just need to save the last effect and close.
    if (renderedLayer)
      setLastLayerStyleEffect(renderedLayer.id, activeEffectId ? activeEffectId : null);

    setStylingLayerId(null);
    onClose();
  };

  const getDefaultValues = (effectId: keyof LayerStyles) => {
    const def = layerStyleDefinitions.find((d) => d.id === effectId);
    if (!def) return { enabled: false };
    const defaults: any = { enabled: false };
    def.options.forEach((opt) => {
      defaults[opt.id] = opt.default;
    });
    return defaults;
  };

  const toggleEffect = (effectId: keyof LayerStyles, enabled: boolean) => {
    const newStyles = {
      ...localStylesRef.current,
      [effectId]: {
        ...(localStylesRef.current[effectId] || getDefaultValues(effectId)),
        enabled,
      },
    };
    localStylesRef.current = newStyles;
    setLocalStyles(newStyles);

    if (project && renderedLayer) {
      ensureHistoryPushed();
      updateLayer(project.id, renderedLayer.id, { styles: newStyles });
    }
  };

  const updateEffectOption = (effectId: keyof LayerStyles, optionId: string, value: any) => {
    const newStyles = {
      ...localStylesRef.current,
      [effectId]: {
        ...(localStylesRef.current[effectId] || getDefaultValues(effectId)),
        [optionId]: value,
      },
    };
    localStylesRef.current = newStyles;
    setLocalStyles(newStyles);

    if (project && renderedLayer) {
      ensureHistoryPushed();
      updateLayer(project.id, renderedLayer.id, { styles: newStyles });
    }
  };

  if (!renderedLayer && !isOpen) return null;

  const activeEffectDef = activeEffectId
    ? layerStyleDefinitions.find((d) => d.id === activeEffectId)
    : null;
  const activeEffectState = activeEffectId
    ? localStyles[activeEffectId] || getDefaultValues(activeEffectId)
    : null;

  return (
    <BaseModal
      id="layer-styles-modal"
      isOpen={isOpen}
      onClose={handleCancel}
      title={`Layer Styles - ${renderedLayer?.name || "..."}`}
      icon={EffectsIcon}
      width="700px"
      height="550px"
      draggable
      resizable
      centered={true}
      closeOnOutsideClick={false}
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Left Styles List (Photoshop-style) */}
        <div
          className="w-[200px] flex-shrink-0 border-r border-bg-tertiary flex flex-col bg-[#1e1e1e] cursor-default"
          onClick={() => {
            setActiveEffectId(null);
            // if (layer) setLastLayerStyleEffect(layer.id, null);
          }}
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar py-2 space-y-1">
            {layerStyleDefinitions.map((def) => {
              const isEnabled = localStyles[def.id]?.enabled ?? false;
              return (
                <div
                  key={def.id}
                  // className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  //   activeEffectId === def.id
                  //     ? "bg-accent text-white"
                  //     : "hover:bg-bg-tertiary text-text"
                  // }`}
                  className={`flex items-center gap-2 p-2 text-[0.85rem] cursor-pointer transition-colors border-l style-entry-${def.id} ${
                    activeEffectId === def.id
                      ? "bg-bg-tertiary border-accent text-white"
                      : "text-text hover:bg-white/5 border-transparent"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveEffectId(def.id);
                    // if (layer) setLastLayerStyleEffect(layer.id, def.id);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => toggleEffect(def.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-3 h-3 rounded bg-[#333] border-white/10 accent-accent transition-all`}
                  />
                  <span className="text-xs font-medium">{def.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Settings Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {activeEffectId && activeEffectDef && activeEffectState ? (
              <div className="max-w-[400px] space-y-6">
                {/* <h3 className="text-sm font-bold text-text border-b border-bg-tertiary pb-2 mb-4">
                  {activeEffectDef.name} Settings
                </h3> */}

                {activeEffectDef.options.map((opt) => {
                  const val = activeEffectState[opt.id as keyof typeof activeEffectState];

                  if (opt.type === "number") {
                    return (
                      <div key={opt.id} className="flex gap-2 items-center">
                        <div className="flex justify-between">
                          <label className="text-xs">{opt.name}</label>
                          {/* <span className="text-xs text-text bg-bg-tertiary px-1.5 rounded">
                            {val}
                            {opt.unit}
                          </span> */}
                        </div>
                        <div className="flex flex-1 gap-4 items-center">
                          <input
                            type="range"
                            min={opt.min}
                            max={opt.max}
                            step={opt.step || 1}
                            value={val as number}
                            onChange={(e) =>
                              updateEffectOption(activeEffectId, opt.id, parseInt(e.target.value))
                            }
                            className="flex-1 h-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                          />
                          <div className="relative group">
                            <input
                              type="number"
                              min={opt.min}
                              max={opt.max}
                              value={val as number}
                              onChange={(e) =>
                                updateEffectOption(
                                  activeEffectId,
                                  opt.id,
                                  parseInt(e.target.value) || opt.min || 0,
                                )
                              }
                              className="w-16 bg-bg-primary border border-border text-text p-1.5 px-2 rounded text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                            />
                            <span className="text-xs opacity-50 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity">
                              {opt.unit}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (opt.type === "select") {
                    return (
                      <div key={opt.id} className="flex gap-2 items-center">
                        <label className="text-xs">{opt.name}</label>
                        <select
                          value={val as string}
                          onChange={(e) =>
                            updateEffectOption(activeEffectId, opt.id, e.target.value)
                          }
                          className="min-w-30 bg-bg-primary border border-border text-text p-2 rounded text-xs outline-none focus:ring-1 focus:ring-accent cursor-pointer transition-all"
                        >
                          {opt.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  if (opt.type === "color") {
                    const colorValue = val as string;
                    return (
                      <div key={opt.id} className="flex gap-2 items-center">
                        <label className="text-xs">{opt.name}</label>
                        <div className="flex gap-3 items-center">
                          <ColorPickerTrigger
                            color={colorValue}
                            label={`${opt.name} color`}
                            onClick={() =>
                              onOpenColorPicker({
                                initialColor: colorValue,
                                onPreview: (color) =>
                                  updateEffectOption(activeEffectId, opt.id, color),
                                onApply: (color) => {
                                  if (
                                    (localStylesRef.current[activeEffectId] as
                                      | Record<string, unknown>
                                      | undefined)?.[opt.id] !== color
                                  ) {
                                    updateEffectOption(activeEffectId, opt.id, color);
                                  }
                                },
                                onCancel: () => {
                                  if (
                                    (localStylesRef.current[activeEffectId] as
                                      | Record<string, unknown>
                                      | undefined)?.[opt.id] !== colorValue
                                  ) {
                                    updateEffectOption(activeEffectId, opt.id, colorValue);
                                  }
                                },
                              })
                            }
                            className="h-8 w-8 rounded-full border-2 border-white/20"
                          />
                          {/* <input
                            type="text"
                            value={(val as string).toUpperCase()}
                            onChange={(e) =>
                              updateEffectOption(activeEffectId, opt.id, e.target.value)
                            }
                            className="flex-1 bg-bg-primary border border-border text-text p-2 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-accent transition-all"
                          /> */}
                        </div>
                      </div>
                    );
                  }

                  if (opt.type === "checkbox") {
                    return (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          id={`${activeEffectId}-${opt.id}`}
                          type="checkbox"
                          checked={val as boolean}
                          onChange={(e) =>
                            updateEffectOption(activeEffectId, opt.id, e.target.checked)
                          }
                          className="w-3 h-3 accent-accent cursor-pointer rounded"
                        />
                        <label
                          htmlFor={`${activeEffectId}-${opt.id}`}
                          className="text-xs text-text font-medium cursor-pointer"
                        >
                          {opt.name}
                        </label>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#bbb] space-y-4">
                <EffectsIcon size={64} strokeWidth={1} />
                <div className="space-y-2">
                  <p className="text-sm font-bold">No layer style selected</p>
                  <p className="text-xs max-w-[200px] text-balance">
                    Select an layer style from the list on the left to edit its properties.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {/* <div className="h-[65px] border-t border-bg-tertiary px-6 bg-bg-secondary flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-bg-tertiary text-xs rounded hover:bg-bg-tertiary transition-all outline-none focus-visible:ring-1 focus-visible:ring-accent text-text font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-8 py-2 bg-accent text-white border-none rounded font-bold transition-all text-xs outline-none hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent"
            >
              OK
            </button>
          </div> */}
          <button
            onClick={handleApply}
            className="m-4 ml-auto px-8 py-2 bg-accent text-white border-none rounded font-bold transition-all text-xs outline-none hover:brightness-110 focus-visible:ring-1 focus-visible:ring-accent"
          >
            OK
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default LayerStylesModal;
