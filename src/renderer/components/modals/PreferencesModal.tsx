/**
 * Purpose: Modal dialog for managing application preferences such as themes, auto-save parameters, and history settings.
 */
import React, { useState, useMemo } from "react";
import { usePreferencesStore } from "@store/preferencesStore";
import { useUIStore } from "@store/uiStore";
import { Settings, Info } from "lucide-react";
import BaseModal from "./BaseModal";

interface PreferencesModalProps {
  /** Flag showing if the modal is currently open */
  isOpen: boolean;
  /** Function called when closing the modal */
  onClose: () => void;
}

/**
 * Metadata for individual preference options.
 */
interface SettingMetadata {
  id: string; // scope:group:option
  label: string;
  hint: string;
  group: string;
}

const SETTINGS_METADATA: SettingMetadata[] = [
  // {
  //   id: "forge:general:theme",
  //   label: "Theme Style",
  //   hint: "Choose between dark focus, high-contrast light theme, or follow system default.",
  //   group: "General",
  // },
  {
    id: "forge:general:autosave",
    label: "Periodic Auto-Save",
    hint: "Automatically save your work at regular intervals to prevent data loss.",
    group: "General",
  },
  {
    id: "forge:general:save_history",
    label: "Save History in Project",
    hint: "Embed undo/redo steps inside project files (.ocfd). Increases file size.",
    group: "General",
  },
  {
    id: "forge:general:history_limit",
    label: "History Size Limit",
    hint: "Max actions saved in current project history (10 - 200).",
    group: "General",
  },
];

/**
 * Helper component for individual preference options to improve DX.
 */
interface PreferenceOptionProps {
  id: string;
  label: string;
  hint: string;
  onHover: (hint: string | null) => void;
  control: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  hasChanges?: boolean;
}

const PreferenceOption: React.FC<PreferenceOptionProps> = ({
  id,
  label,
  hint,
  onHover,
  control,
  children,
  hasChanges,
  className = "",
}) => (
  <div
    className={`p-3 bg-bg-secondary/40 border rounded-lg flex flex-col gap-2 transition-all hover:border-[#444] ${
      hasChanges ? "border-accent ring-1 ring-accent" : "border-bg-tertiary"
    } ${className}`}
    onMouseEnter={() => onHover(hint)}
    onMouseLeave={() => onHover(null)}
  >
    <div className="flex items-center justify-between gap-4">
      <label className="text-[0.8rem] font-bold text-text cursor-pointer" htmlFor={id}>
        {label}
      </label>
      {control}
    </div>
    {children && <div className="pt-2 border-t border-bg-tertiary w-full">{children}</div>}
  </div>
);

export const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose }) => {
  const preferences = usePreferencesStore();
  const showToast = useUIStore((state) => state.showToast);

  // Local state to support Apply/Cancel conventions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [localTheme, setLocalTheme] = useState<"dark" | "light" | "auto">(preferences.theme);
  const [localAutosave, setLocalAutosave] = useState(preferences.autosave);
  const [localAutosaveInterval, setLocalAutosaveInterval] = useState(preferences.autosaveInterval);
  const [localSaveHistory, setLocalSaveHistory] = useState(preferences.saveHistory);
  const [localHistoryLimit, setLocalHistoryLimit] = useState(preferences.historyLimit);

  const [activeTab, setActiveTab] = useState("General");
  const [hoveredHint, setHoveredHint] = useState<string | null>(null);

  /**
   * Detailed change detection for each field.
   */
  const changes = useMemo(() => {
    return {
      theme: localTheme !== preferences.theme,
      autosave: localAutosave !== preferences.autosave,
      autosaveInterval: localAutosaveInterval !== preferences.autosaveInterval,
      saveHistory: localSaveHistory !== preferences.saveHistory,
      historyLimit: localHistoryLimit !== preferences.historyLimit,
    };
  }, [
    localTheme,
    localAutosave,
    localAutosaveInterval,
    localSaveHistory,
    localHistoryLimit,
    preferences,
  ]);

  /**
   * Computed global hasChanges boolean.
   */
  const hasChanges = Object.values(changes).some((c) => c);

  /**
   * Confirms closure if there are unsaved changes.
   */
  const handleClose = () => {
    if (hasChanges) {
      const confirmDiscard = window.confirm("You have unsaved changes. Discard and close?");
      if (!confirmDiscard) return;
    }
    onClose();
  };

  /**
   * Saves the local preferences state to the persistent store and closes.
   */
  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hasChanges) return;

    preferences.setTheme(localTheme);
    preferences.setAutosave(localAutosave);
    preferences.setAutosaveInterval(localAutosaveInterval);
    preferences.setSaveHistory(localSaveHistory);
    preferences.setHistoryLimit(localHistoryLimit);

    showToast("Preferences applied successfully", "info");
    onClose();
  };

  const groups = Array.from(new Set(SETTINGS_METADATA.map((s) => s.group)));

  const getMetadata = (id: string) => SETTINGS_METADATA.find((s) => s.id === id)!;

  return (
    <BaseModal
      id="preferences-modal"
      isOpen={isOpen}
      onClose={handleClose}
      title="Preferences"
      icon={Settings}
      width="700px"
      height="520px"
      trapFocusSelector="#preferences-form"
    >
      <form
        onSubmit={handleApply}
        id="preferences-form"
        className="flex flex-col flex-1 overflow-hidden bg-bg-secondary"
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e]">
            {/* Dynamic Group Tabs */}
            <div className="flex border-b border-bg-tertiary">
              {groups.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setActiveTab(group)}
                  className={`px-5 py-2 text-xs font-bold uppercase transition-colors outline-none focus-visible:bg-bg-tertiary focus-visible:text-accent ${
                    activeTab === group
                      ? "text-accent border-b border-accent bg-bg-tertiary/50"
                      : "text-[#666] border-b border-transparent hover:text-[#999] hover:bg-bg-tertiary/50"
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
              {activeTab === "General" && (
                <div className="space-y-4">
                  {/* Theme Selection */}
                  {/* <PreferenceOption
                    {...getMetadata("forge:general:theme")}
                    onHover={setHoveredHint}
                    hasChanges={changes.theme}
                    control={
                      <select
                        id="forge:general:theme"
                        value={localTheme}
                        onChange={(e) => setLocalTheme(e.target.value as any)}
                        className="bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary cursor-pointer"
                      >
                        <option value="auto">Auto (System Default)</option>
                        <option value="dark">Dark Theme</option>
                        <option value="light">Light Theme</option>
                      </select>
                    }
                  /> */}

                  {/* Auto-Save */}
                  <PreferenceOption
                    {...getMetadata("forge:general:autosave")}
                    onHover={setHoveredHint}
                    hasChanges={changes.autosave || changes.autosaveInterval}
                    control={
                      <input
                        type="checkbox"
                        id="forge:general:autosave"
                        checked={localAutosave}
                        onChange={(e) => setLocalAutosave(e.target.checked)}
                        className="w-4 h-4 accent-accent cursor-pointer rounded transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                      />
                    }
                  >
                    {localAutosave && (
                      <div className="flex items-center justify-between">
                        <label
                          className="text-xs text-[#aaa] cursor-pointer"
                          htmlFor="autosave-interval"
                        >
                          Save Interval (Minutes)
                        </label>
                        <input
                          id="autosave-interval"
                          type="number"
                          value={localAutosaveInterval}
                          min={1}
                          max={60}
                          onChange={(e) => setLocalAutosaveInterval(parseInt(e.target.value) || 5)}
                          className="w-20 bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                        />
                      </div>
                    )}
                  </PreferenceOption>

                  {/* History Persistence */}
                  <PreferenceOption
                    {...getMetadata("forge:general:save_history")}
                    onHover={setHoveredHint}
                    hasChanges={changes.saveHistory}
                    control={
                      <input
                        type="checkbox"
                        id="forge:general:save_history"
                        checked={localSaveHistory}
                        onChange={(e) => setLocalSaveHistory(e.target.checked)}
                        className="w-4 h-4 accent-accent cursor-pointer rounded transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                      />
                    }
                  />

                  {/* History Size Limit */}
                  <PreferenceOption
                    {...getMetadata("forge:general:history_limit")}
                    onHover={setHoveredHint}
                    hasChanges={changes.historyLimit}
                    control={
                      <input
                        type="number"
                        id="forge:general:history_limit"
                        value={localHistoryLimit}
                        min={10}
                        max={200}
                        onChange={(e) => setLocalHistoryLimit(parseInt(e.target.value) || 50)}
                        className="w-24 bg-bg-primary border border-border text-text p-2 rounded text-sm selection:bg-accent outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
                      />
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="h-[55px] border-t border-bg-tertiary px-4 bg-bg-secondary flex items-center justify-end gap-2">
          <div
            className={`text-xs text-text font-medium truncate flex items-center gap-1 mr-auto ${hoveredHint ? "" : "text-[#888] italic"}`}
          >
            <Info size={12} className="flex-shrink-0" />
            {hoveredHint || "Hover over an option to see a brief description here."}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 border border-bg-tertiary text-xs rounded hover:bg-bg-tertiary transition-all outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!hasChanges}
            className={`px-4 py-2 bg-accent text-white border-none rounded font-bold transition-all text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              !hasChanges ? "opacity-50 cursor-not-allowed grayscale" : "hover:brightness-110"
            }`}
          >
            Apply
          </button>
        </div>
      </form>
    </BaseModal>
  );
};
