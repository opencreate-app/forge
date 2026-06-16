/**
 * Purpose: Global state for UI components, managing active tabs, project history, toast notifications, and sidebar configuration.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UIState {
  activeTab: "home" | string; // 'home' or project ID
  tabHistory: string[]; // Stack of IDs (the last one is current)
  toast: {
    message: string;
    type: "info" | "warning" | "error";
    visible: boolean;
    duration: number;
  } | null;
  activeSidebarTab: "layers" | "history";
  sidebarWidth: number;
  isSidebarExpanded: boolean;
  showRulers: boolean;
  showGuides: boolean;
  snapToGuides: boolean;
  snapToLayers: boolean;
  lastExportFormat: string;
  lastExportQuality: number;
  lastLockAspectRatio: boolean;
  activeModals: Set<string>;
  stylingLayerId: string | null;
  lastLayerStyleEffects: Record<string, any>;
  modalSettings: Record<string, { x: number; y: number; width?: number; height?: number }>;
  setActiveTab: (tab: "home" | string) => void;
  removeFromHistory: (tabId: string) => void;
  showToast: (message: string, type?: "info" | "warning" | "error", duration?: number) => void;
  hideToast: () => void;
  setActiveSidebarTab: (tab: "layers" | "history") => void;
  setSidebarWidth: (width: number) => void;
  setIsSidebarExpanded: (expanded: boolean) => void;
  setShowRulers: (show: boolean) => void;
  setShowGuides: (show: boolean) => void;
  setSnapToGuides: (snap: boolean) => void;
  setSnapToLayers: (snap: boolean) => void;
  setExportSettings: (format: string, quality: number, lockAspectRatio: boolean) => void;
  setModalOpen: (modalId: string, isOpen: boolean) => void;
  isAnyModalOpen: () => boolean;
  setStylingLayerId: (layerId: string | null) => void;
  setLastLayerStyleEffect: (layerId: string, effectId: any) => void;
  setModalSettings: (
    modalId: string,
    settings: { x: number; y: number; width?: number; height?: number },
  ) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      activeTab: "home",
      tabHistory: ["home"],
      toast: null,
      activeSidebarTab: "layers",
      sidebarWidth: 280,
      isSidebarExpanded: true,
      showRulers: true,
      showGuides: true,
      snapToGuides: true,
      snapToLayers: true,
      lastExportFormat: "image/png",
      lastExportQuality: 100,
      lastLockAspectRatio: true,
      activeModals: new Set(),
      stylingLayerId: null,
      lastLayerStyleEffects: {},
      modalSettings: {},
      setActiveTab: (tab) =>
        set((state) => {
          const newHistory = state.tabHistory.filter((id) => id !== tab);
          newHistory.push(tab);
          return { activeTab: tab, tabHistory: newHistory };
        }),
      removeFromHistory: (tabId) =>
        set((state) => ({
          tabHistory: state.tabHistory.filter((id) => id !== tabId),
        })),
      showToast: (message, type = "info", duration = 3000) => {
        set({ toast: { message, type, visible: true, duration } });
      },
      hideToast: () => {
        const currentToast = get().toast;
        if (currentToast) {
          set({ toast: { ...currentToast, visible: false } });
          setTimeout(() => {
            set({ toast: null });
          }, 300); // Wait for fade-out animation
        }
      },
      setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(width, 600)) }),
      setIsSidebarExpanded: (expanded) => set({ isSidebarExpanded: expanded }),
      setShowRulers: (show) => set({ showRulers: show }),
      setShowGuides: (show) => set({ showGuides: show }),
      setSnapToGuides: (snap) => set({ snapToGuides: snap }),
      setSnapToLayers: (snap) => set({ snapToLayers: snap }),
      setExportSettings: (format, quality, lockAspectRatio) =>
        set({
          lastExportFormat: format,
          lastExportQuality: quality,
          lastLockAspectRatio: lockAspectRatio,
        }),
      setModalOpen: (modalId, isOpen) =>
        set((state) => {
          const newActiveModals = new Set(state.activeModals);
          if (isOpen) {
            newActiveModals.add(modalId);
          } else {
            newActiveModals.delete(modalId);
          }
          return { activeModals: newActiveModals };
        }),
      isAnyModalOpen: () => get().activeModals.size > 0,
      setStylingLayerId: (layerId) => set({ stylingLayerId: layerId }),
      setLastLayerStyleEffect: (layerId, effectId) =>
        set((state) => ({
          lastLayerStyleEffects: { ...state.lastLayerStyleEffects, [layerId]: effectId },
        })),
      setModalSettings: (modalId, settings) =>
        set((state) => ({
          modalSettings: { ...state.modalSettings, [modalId]: settings },
        })),
    }),
    {
      name: "forge-ui-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSidebarTab: state.activeSidebarTab,
        sidebarWidth: state.sidebarWidth,
        isSidebarExpanded: state.isSidebarExpanded,
        showRulers: state.showRulers,
        showGuides: state.showGuides,
        snapToGuides: state.snapToGuides,
        snapToLayers: state.snapToLayers,
        lastExportFormat: state.lastExportFormat,
        lastExportQuality: state.lastExportQuality,
        lastLockAspectRatio: state.lastLockAspectRatio,
        modalSettings: state.modalSettings,
      }),
    },
  ),
);
