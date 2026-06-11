/**
 * Purpose: Core state management for projects, layers, selection, and history (undo/redo), including serialization and project initialization logic.
 */
import { create } from "zustand";
import { usePreferencesStore } from "./preferencesStore";
import { useUIStore } from "./uiStore";
import { LayerStyles } from "./layerStylesStore";
import { getCombinedStyledBounds } from "@utils/projectUtils";
import { ForgeEngine } from "@core/engine/ForgeEngine";

export * from "./layerStylesStore";

/**
 * Represents a formatted segment of text with specific styling.
 */
export interface TextSpan {
  /** The text content of the span. */
  text: string;
  /** CSS color value. */
  color?: string;
  /** Font size in pixels. */
  fontSize?: number;
  /** Font family name. */
  fontFamily?: string;
  /** Font weight (e.g., 'bold', 400). */
  fontWeight?: string | number;
}

/**
 * Represents a non-destructive mask applied to a layer.
 */
export interface LayerMask {
  /** Base64 encoded grayscale image (Black hides, White shows). */
  data: string;
  /** X coordinate in project space. */
  x: number;
  /** Y coordinate in project space. */
  y: number;
  /** Width of the mask in pixels. */
  width: number;
  /** Height of the mask in pixels. */
  height: number;
  /** Whether the mask is enabled. */
  enabled: boolean;
  /** If true, the mask moves with the layer. */
  linked: boolean;
}

/**
 * Represents a layer in the project. Layers can be raster images, text, or groups.
 */
export interface Layer {
  /** Unique identifier for the layer. */
  id: string;
  /** Display name of the layer. */
  name: string;
  /** The type of layer content. */
  type: "raster" | "text" | "group" | "smart_object" | "color_fill";
  /** Whether the layer is currently visible. */
  visible: boolean;
  /** Whether the layer is locked for editing. */
  locked: boolean;
  /** Layer opacity from 0 to 100. */
  opacity: number;
  /** Layer fill from 0 to 100. */
  fill: number;
  /** X coordinate in project space. */
  x: number;
  /** Y coordinate in project space. */
  y: number;
  /** Width of the layer in pixels. */
  width: number;
  /** Height of the layer in pixels. */
  height: number;
  /** Base64 encoded image data for raster layers or flattened smart objects. */
  data?: string;
  /** Original image data used for non-destructive transforms. */
  dataOriginal?: string;
  /** Nested project data for smart objects. */
  dataObject?: Project;
  /** Solid color fill settings for color_fill layers. */
  colorFill?: {
    color: string;
  };
  /** Original transformation for smart objects (used for reset). */
  originalTransform?: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    data?: string;
  };
  /** Raw text content for text layers. */
  text?: string;
  /** Styled text spans for rich text support. */
  textSpans?: TextSpan[];
  /** Whether the text is point-based or area-based. */
  textType?: "point" | "area";
  /** Default font size for the layer. */
  fontSize?: number;
  /** Default font family for the layer. */
  fontFamily?: string;
  /** Default font weight for the layer. */
  fontWeight?: string | number;
  /** Default text color. */
  color?: string;
  /** Horizontal alignment of text. */
  textAlign?: "left" | "center" | "right" | "justify";
  /** Line height factor. */
  lineHeight?: number;
  /** Letter spacing in pixels. */
  tracking?: number;
  /** Whether the text overflows its bounds. */
  textOverflow?: boolean;
  /** Rendering quality for text. */
  textRendering?: "nearest" | "bilinear";
  /** Canvas composite operation for blending. */
  blendMode: GlobalCompositeOperation;
  /** Rotation in degrees. */
  rotation?: number;
  /** Internal undo stack for text editing. */
  textUndoStack?: { text: string; textSpans?: TextSpan[] }[];
  /** Internal redo stack for text editing. */
  textRedoStack?: { text: string; textSpans?: TextSpan[] }[];
  /** ID of the parent group, if any. */
  parentId?: string | null;
  /** Whether the group is expanded in the UI. */
  isExpanded?: boolean;
  /** Styles applied to the layer. */
  styles?: LayerStyles;
  /** Non-destructive mask applied to the layer. */
  mask?: LayerMask;
}

/**
 * Represents the current selection state in the project.
 */
export interface Selection {
  /** Whether a selection is currently active. */
  hasSelection: boolean;
  /** The rectangular bounds of the selection in project space. */
  bounds: { x: number; y: number; width: number; height: number } | null;
  /** DataURL of the selection mask. */
  mask?: string;
  /** A temporary layer used for floating selections during transformation. */
  floatingLayer?: Layer | null;
}

/**
 * A snapshot of the project state for history management.
 */
export interface HistoryState {
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string | null;
  activeMaskId?: string | null;
  selectedLayerIds: string[];
  selection: Selection;
}

/**
 * An entry in the history stack.
 */
export interface HistoryEntry {
  /** Description of the action for the UI. */
  description: string;
  /** The project state at that point in time. */
  state: HistoryState;
}

/**
 * Represents a complete project document.
 */
export interface Project {
  /** Unique project identifier. */
  id: string;
  /** Project name. */
  name: string;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
  /** List of layers in the project. */
  layers: Layer[];
  /** ID of the currently selected layer. */
  activeLayerId: string | null;
  /** ID of the layer whose mask is currently being edited. */
  activeMaskId?: string | null;
  /** IDs of all selected layers for multi-selection. */
  selectedLayerIds: string[];
  /** Current selection state. */
  selection: Selection;
  /** Current viewport zoom level. */
  zoom: number;
  /** Viewport pan X offset. */
  panX: number;
  /** Viewport pan Y offset. */
  panY: number;
  /** Whether the project has unsaved changes. */
  isDirty: boolean;
  /** File system path if the project has been saved. */
  filePath?: string;
  /** ID of the parent layer if this is a smart object project. */
  parentLayerId?: string;
  /** ID of the parent project if this is a smart object project. */
  parentProjectId?: string;
  /** Version of the document format. */
  version?: string;
  /** Creation timestamp. */
  createdAt?: string;
  /** Last update timestamp. */
  updatedAt?: string;
  /** Stack of states for undo. */
  undoStack: HistoryEntry[];
  /** Stack of states for redo. */
  redoStack: HistoryEntry[];
}

/**
 * Zustand store state for managing multiple projects and their lifecycle.
 */
interface ProjectState {
  /** List of currently open projects. */
  projects: Project[];
  /** ID of the project currently being edited. */
  activeProjectId: string | null;
  /** The application version. */
  appVersion: string;

  /** Initializes the store, fetching the app version from Electron. */
  initialize: () => Promise<void>;
  /** Adds a new project to the store. */
  addProject: (project: Project) => void;
  /** Removes a project from the store. */
  removeProject: (id: string) => void;
  /** Sets the active project. */
  setActiveProject: (id: string | null) => void;
  /** Updates project-level properties. */
  updateProject: (id: string, updates: Partial<Project>) => void;
  /** Adds a new layer to a specific project. */
  addLayer: (
    projectId: string,
    layer: Partial<Layer>,
    skipHistory?: boolean,
    insertAboveLayerId?: string,
  ) => void;
  /** Removes a layer from a specific project. */
  removeLayer: (projectId: string, layerId: string, skipHistory?: boolean) => void;
  /** Removes multiple layers from a specific project. */
  removeLayers: (projectId: string, layerIds: string[], skipHistory?: boolean) => void;
  /** Adds a manual entry to the project's history stack. */
  addHistoryEntry: (projectId: string, entry: HistoryEntry) => void;
  /** Reorders layers in the project stack. */
  reorderLayers: (
    projectId: string,
    layerIds: string[],
    targetLayerId: string | null,
    position: "above" | "below",
  ) => void;
  /** Duplicates an existing layer. */
  duplicateLayer: (projectId: string, layerId: string) => void;
  /** Duplicates multiple existing layers. */
  duplicateLayers: (projectId: string, layerIds: string[]) => void;
  /** Updates properties of a specific layer. */
  updateLayer: (
    projectId: string,
    layerId: string,
    updates: Partial<Layer>,
    skipDirty?: boolean,
  ) => void;
  /** Renames a layer. */
  renameLayer: (projectId: string, layerId: string, name: string) => void;
  /** Toggles layer visibility. */
  toggleLayerVisibility: (projectId: string, layerId: string) => void;
  /** Isolate a layer (hide all others, or show all if already isolated). */
  isolateLayer: (projectId: string, layerId: string) => void;
  /** Toggles layer lock status. */
  toggleLayerLock: (projectId: string, layerId: string) => void;
  /** Groups specified layers. */
  groupLayers: (projectId: string, layerIds: string[]) => void;
  /** Ungroups a specific group. */
  ungroupLayers: (projectId: string, groupId: string) => void;
  /** Toggles group expansion in the UI. */
  toggleGroupExpansion: (projectId: string, groupId: string) => void;
  /** Converts specified layers into a Smart Object. */
  convertToSmartObject: (projectId: string, layerIds: string[]) => Promise<void>;
  /** Rasterizes a Smart Object layer. */
  rasterizeSmartObject: (projectId: string, layerId: string) => void;
  /** Resets the transformation of a Smart Object to its original state. */
  resetSmartObjectTransform: (projectId: string, layerId: string) => void;
  /** Opens a Smart Object for editing in a new tab. */
  openSmartObject: (projectId: string, layerId: string) => void;
  /** Synchronizes changes from a Smart Object tab back to its parent layer. */
  syncSmartObject: (smartProjectId: string) => Promise<void>;
  /** Adds a layer mask to a specific layer. */
  addLayerMask: (projectId: string, layerId: string) => void;
  /** Removes a layer mask from a specific layer. */
  removeLayerMask: (projectId: string, layerId: string) => void;
  /** Updates properties of a layer mask. */
  updateLayerMask: (projectId: string, layerId: string, updates: Partial<LayerMask>) => void;
  /** Sets the active mask for a project. */
  setActiveMask: (projectId: string, layerId: string | null) => void;
  /** Sets the active layer for a project. */
  setActiveLayer: (projectId: string, layerId: string | null) => void;
  /** Sets the selected layers for a project. */
  setSelectedLayers: (projectId: string, layerIds: string[]) => void;
  /** Reverts the last text change in a text layer. */
  undoText: (projectId: string, layerId: string) => void;
  /** Re-applies the last reverted text change in a text layer. */
  redoText: (projectId: string, layerId: string) => void;
  /** Jumps to a specific point in the project's history stack. */
  jumpToHistory: (projectId: string, index: number) => void;
  /** Pushes the current project state to the undo stack. */
  pushHistory: (projectId: string, description: string) => void;
  /** Reverts to the previous project state. */
  undo: (projectId: string) => void;
  /** Advances to the next project state in the redo stack. */
  redo: (projectId: string) => void;
}

const getMaxHistory = () => usePreferencesStore.getState().historyLimit;

/**
 * Normalizes a HistoryState object, providing default values for missing fields (legacy support).
 */
export const normalizeHistoryState = (state: any): HistoryState => ({
  ...state,
  selectedLayerIds: state.selectedLayerIds || (state.activeLayerId ? [state.activeLayerId] : []),
  selection: state.selection || { hasSelection: false, bounds: null },
});

export const normalizeProject = (project: any): Project => {
  const normalizedLayers = (project.layers || []).map((l: any) => ({
    ...l,
    opacity: l.opacity ?? 100,
    fill: l.fill ?? 100,
    blendMode: l.blendMode || "source-over",
  }));

  const normalized = {
    ...project,
    layers: normalizedLayers,
    activeLayerId: project.activeLayerId || project.layers?.[0]?.id || null,
    selectedLayerIds:
      project.selectedLayerIds ||
      (project.activeLayerId
        ? [project.activeLayerId]
        : project.layers?.[0]
          ? [project.layers[0].id]
          : []),
    selection: project.selection || { hasSelection: false, bounds: null },
    zoom: project.zoom || 1,
    panX: project.panX || 0,
    panY: project.panY || 0,
    isDirty: project.isDirty || false,
    undoStack: (project.undoStack || []).map((entry: any) => ({
      ...entry,
      state: entry.state ? normalizeHistoryState(entry.state) : entry.state,
    })),
    redoStack: (project.redoStack || []).map((entry: any) => ({
      ...entry,
      state: entry.state ? normalizeHistoryState(entry.state) : entry.state,
    })),
  } as Project;
  return normalized;
};

export const createHistoryState = (project: Project): HistoryState => ({
  width: project.width,
  height: project.height,
  layers: JSON.parse(JSON.stringify(project.layers)),
  activeLayerId: project.activeLayerId,
  activeMaskId: project.activeMaskId,
  selectedLayerIds: [
    ...(project.selectedLayerIds || (project.activeLayerId ? [project.activeLayerId] : [])),
  ],
  selection: JSON.parse(JSON.stringify(project.selection)),
});

/**
 * Prepares a project for serialization (saving to disk).
 * Includes history stacks but may limit them to avoid excessively large files.
 */
export const getSerializableProject = (project: Project): any => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isDirty, filePath, undoStack, redoStack, ...rest } = project;

  const saveHistory = usePreferencesStore.getState().saveHistory;
  const historyLimit = usePreferencesStore.getState().historyLimit;

  // We keep the history but limit it to avoid massive files due to Base64 data duplication.
  const persistedUndoStack = saveHistory ? undoStack.slice(-historyLimit) : [];

  // Strip text history if saveHistory is off
  const processedLayers = saveHistory
    ? rest.layers
    : rest.layers.map((layer) => {
        const {
          textUndoStack: _textUndoStack,
          textRedoStack: _textRedoStack,
          ...layerRest
        } = layer;
        return layerRest;
      });

  return {
    ...rest,
    layers: processedLayers,
    undoStack: persistedUndoStack,
    redoStack: [], // Redo stack is typically not persisted across sessions
    updatedAt: new Date().toISOString(),
  };
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  appVersion: "0.0.0",

  initialize: async () => {
    if ((window as any).electronAPI) {
      const version = await (window as any).electronAPI.getAppVersion();
      set({ appVersion: version });
    }
  },

  addProject: (project) =>
    set((state) => {
      const existingProject = state.projects.find(
        (p) => p.id === project.id || (p.filePath && p.filePath === project.filePath),
      );

      if (existingProject) {
        return { activeProjectId: existingProject.id };
      }

      // Normalize project for legacy data
      const normalizedProject = normalizeProject(project);

      const initialState = createHistoryState(normalizedProject);

      let finalUndoStack = normalizedProject.undoStack || [];
      if (finalUndoStack.length === 0) {
        const description = normalizedProject.filePath ? "Open Project" : "Initial State";
        finalUndoStack = [{ description, state: initialState }];
      } else {
        // If it's an existing project being opened, ensure the base item is "Open Project"
        // and that it has a valid state (populating it if empty)
        if (normalizedProject.filePath) {
          const firstItem = finalUndoStack[0];
          if (
            firstItem.description === "Initial State" ||
            firstItem.description === "New Project"
          ) {
            firstItem.description = "Open Project";
          }
        }

        if (
          finalUndoStack.length === 1 &&
          (!finalUndoStack[0].state || Object.keys(finalUndoStack[0].state).length === 0)
        ) {
          finalUndoStack = [{ ...finalUndoStack[0], state: initialState }];
        }
      }

      const now = new Date().toISOString();
      return {
        projects: [
          ...state.projects,
          {
            ...normalizedProject,
            version: normalizedProject.version || state.appVersion,
            createdAt: normalizedProject.createdAt || now,
            updatedAt: normalizedProject.updatedAt || now,
            undoStack: finalUndoStack,
            redoStack: normalizedProject.redoStack || [],
          },
        ],
        activeProjectId: normalizedProject.id,
      };
    }),

  removeProject: (id) =>
    set((state) => {
      const newProjects = state.projects.filter((p) => p.id !== id);
      let newActiveId = state.activeProjectId;
      if (state.activeProjectId === id) {
        newActiveId = newProjects.length > 0 ? newProjects[newProjects.length - 1].id : null;
      }
      return { projects: newProjects, activeProjectId: newActiveId };
    }),

  setActiveProject: (id) => set({ activeProjectId: id }),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id
          ? {
              ...p,
              ...updates,
              isDirty: updates.isDirty !== undefined ? updates.isDirty : p.isDirty,
            }
          : p,
      ),
    })),

  addLayer: (projectId, partialLayer, skipHistory = false, insertAboveLayerId?: string) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      let newUndoStack = project.undoStack;

      if (!skipHistory) {
        const historyState = createHistoryState(project);

        let newDescrition = "Add Layer";
        switch (partialLayer.type) {
          case "text":
            newDescrition = "Text Tool";
            break;
        }

        newUndoStack = [...project.undoStack, { description: newDescrition, state: historyState }];
        if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();
      }

      const id = partialLayer.id || Math.random().toString(36).substr(2, 9);
      const newLayer: Layer = {
        id,
        name: partialLayer.name || `Layer ${project.layers.length + 1}`,
        type: partialLayer.type || "raster",
        visible: partialLayer.visible ?? true,
        locked: partialLayer.locked ?? false,
        opacity: partialLayer.opacity ?? 100,
        fill: partialLayer.fill ?? 100,
        x: partialLayer.x ?? 0,
        y: partialLayer.y ?? 0,
        width: partialLayer.width ?? project.width,
        height: partialLayer.height ?? project.height,
        blendMode: partialLayer.blendMode || "source-over",
        ...partialLayer,
      };

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: (() => {
                  const targetId = insertAboveLayerId ?? p.activeLayerId;
                  const targetIndex = targetId ? p.layers.findIndex((l) => l.id === targetId) : -1;
                  const layers = [...p.layers];
                  if (targetIndex !== -1) {
                    layers.splice(targetIndex + 1, 0, newLayer);
                  } else {
                    layers.push(newLayer);
                  }
                  return layers;
                })(),
                activeLayerId: id,
                selectedLayerIds: [id],
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: !skipHistory ? [] : p.redoStack,
              }
            : p,
        ),
      };
    }),

  removeLayer: (projectId, layerId, skipHistory = false) => {
    get().removeLayers(projectId, [layerId], skipHistory);
  },

  removeLayers: (projectId, layerIds, skipHistory = false) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project || project.layers.length <= 1) return state;

      // Identify all layers to remove, including descendants of groups
      const layersToRemove = new Set<string>();
      const findDescendants = (parentId: string) => {
        project.layers
          .filter((l) => l.parentId === parentId)
          .forEach((l) => {
            layersToRemove.add(l.id);
            if (l.type === "group") findDescendants(l.id);
          });
      };

      layerIds.forEach((id) => {
        layersToRemove.add(id);
        const layer = project.layers.find((l) => l.id === id);
        if (layer?.type === "group") findDescendants(id);
      });

      // Prevent removing all layers
      if (layersToRemove.size >= project.layers.length) {
        // Find one layer that is NOT being removed to keep as fallback
        const fallback = project.layers.find((l) => !layersToRemove.has(l.id));
        if (!fallback) return state; // Should not happen if we check layers.length > 1
      }

      let newUndoStack = project.undoStack;

      if (!skipHistory) {
        const historyState = createHistoryState(project);
        newUndoStack = [
          ...project.undoStack,
          {
            description: layersToRemove.size > 1 ? "Remove Layers" : "Remove Layer",
            state: historyState,
          },
        ];
        if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();
      }

      const newLayers = project.layers.filter((l) => !layersToRemove.has(l.id));

      let newActiveLayerId = project.activeLayerId;
      if (project.activeLayerId && layersToRemove.has(project.activeLayerId)) {
        // Find index of the first layer being removed among original layers
        const firstRemovedIndex = project.layers.findIndex((l) => layersToRemove.has(l.id));
        newActiveLayerId = newLayers[Math.max(0, firstRemovedIndex - 1)]?.id || null;
      }

      const newSelectedLayerIds = project.selectedLayerIds.filter((id) => !layersToRemove.has(id));
      if (newSelectedLayerIds.length === 0 && newActiveLayerId) {
        newSelectedLayerIds.push(newActiveLayerId);
      }

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: newLayers,
                activeLayerId: newActiveLayerId,
                selectedLayerIds: newSelectedLayerIds,
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: !skipHistory ? [] : p.redoStack,
              }
            : p,
        ),
      };
    }),

  addHistoryEntry: (projectId, entry) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const newUndoStack = [...project.undoStack, entry];
      if (newUndoStack.length > getMaxHistory()) {
        newUndoStack.shift();
      }

      return {
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, undoStack: newUndoStack, redoStack: [] } : p,
        ),
      };
    }),

  duplicateLayer: (projectId: string, layerId: string) => {
    get().duplicateLayers(projectId, [layerId]);
  },

  duplicateLayers: (projectId: string, layerIds: string[]) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      // Filter and sort target layers by their index to maintain relative order
      const targetIds = new Set(layerIds);
      const targets = project.layers
        .map((l, index) => ({ l, index }))
        .filter((item) => targetIds.has(item.l.id))
        .sort((a, b) => a.index - b.index); // Process from bottom to top

      if (targets.length === 0) return state;

      // Push to history
      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        {
          description: targets.length > 1 ? "Duplicate Layers" : "Duplicate Layer",
          state: historyState,
        },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      const newlyCreatedIds: string[] = [];
      const allNewClones: Layer[] = [];
      let maxInsertionIndex = -1;

      targets.forEach(({ l: layerToDuplicate, index }) => {
        const idMap = new Map<string, string>();
        const generateId = () => Math.random().toString(36).substr(2, 9);

        const cloneLayer = (layer: Layer, newParentId: string | null): Layer => {
          const newId = generateId();
          idMap.set(layer.id, newId);
          return {
            ...JSON.parse(JSON.stringify(layer)),
            id: newId,
            parentId: newParentId,
            name: !newParentId ? `${layer.name} copy` : layer.name, // Only suffix top-level duplicates
          };
        };

        // 1. Identify all descendants if it's a group
        const descendantsToClone: Layer[] = [];
        const findDescendants = (parentId: string) => {
          project.layers
            .filter((l) => l.parentId === parentId)
            .forEach((l) => {
              descendantsToClone.push(l);
              if (l.type === "group") findDescendants(l.id);
            });
        };

        if (layerToDuplicate.type === "group") {
          findDescendants(layerToDuplicate.id);
        }

        // 2. Clone the main layer
        const clonedMain = cloneLayer(layerToDuplicate, layerToDuplicate.parentId || null);
        newlyCreatedIds.push(clonedMain.id);

        // 3. Clone descendants and update their parentIds
        const clonedDescendants = descendantsToClone.map((d) => {
          const newParentId = idMap.get(d.parentId!) || clonedMain.id;
          return cloneLayer(d, newParentId);
        });

        // 4. Collect clones and track the highest index for insertion
        allNewClones.push(clonedMain, ...clonedDescendants);

        let lastDescendantIndex = index;
        if (descendantsToClone.length > 0) {
          const descendantIds = new Set(descendantsToClone.map((d) => d.id));
          for (let i = index + 1; i < project.layers.length; i++) {
            if (descendantIds.has(project.layers[i].id)) {
              lastDescendantIndex = i;
            } else {
              break;
            }
          }
        }
        maxInsertionIndex = Math.max(maxInsertionIndex, lastDescendantIndex);
      });

      const newLayers = [...project.layers];
      newLayers.splice(maxInsertionIndex + 1, 0, ...allNewClones);

      return {
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;

          // Sort newly created IDs by their index in the new layers array to maintain consistency
          const idToIndex = new Map(newLayers.map((l, i) => [l.id, i]));
          const sortedNewIds = [...newlyCreatedIds].sort(
            (a, b) => (idToIndex.get(a) || 0) - (idToIndex.get(b) || 0),
          );

          return {
            ...p,
            layers: newLayers,
            activeLayerId: sortedNewIds[sortedNewIds.length - 1], // Active top-most new layer
            selectedLayerIds: sortedNewIds,
            isDirty: true,
            undoStack: newUndoStack,
            redoStack: [],
          };
        }),
      };
    }),

  reorderLayers: (projectId, layerIds, targetLayerId, position) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      // Push to history
      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        { description: layerIds.length > 1 ? "Move Layers" : "Move Layer", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      const movingLayerIds = new Set(layerIds);
      const movingLayers = project.layers.filter((l) => movingLayerIds.has(l.id));

      const remainingLayers = project.layers.filter((l) => !movingLayerIds.has(l.id));

      let targetIndex = 0;
      let newParentId: string | null = null;

      if (targetLayerId) {
        const foundIndex = remainingLayers.findIndex((l) => l.id === targetLayerId);
        if (foundIndex !== -1) {
          const targetLayer = remainingLayers[foundIndex];
          targetIndex = position === "above" ? foundIndex + 1 : foundIndex;
          newParentId = targetLayer.parentId || null;

          // Special case: if dropping "below" a group (in UI), make it the first child
          if (position === "below" && targetLayer.type === "group") {
            newParentId = targetLayer.id;
          }
        }
      }

      const newLayers = [...remainingLayers];
      const updatedMovingLayers = movingLayers.map((l) => {
        // Only update parent if the layer's current parent is NOT among the layers being moved
        // (This preserves internal group structure during move)
        if (l.parentId && movingLayerIds.has(l.parentId)) {
          return l;
        }
        return { ...l, parentId: newParentId };
      });

      newLayers.splice(targetIndex, 0, ...updatedMovingLayers);

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: newLayers,
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: [],
              }
            : p,
        ),
      };
    }),

  updateLayer: (projectId, layerId, updates, skipDirty = false) =>
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;

        const layer = p.layers.find((l) => l.id === layerId);
        if (!layer) return p;

        // Check if there's an actual change to avoid unnecessary dirtying
        const hasActualChange = Object.entries(updates).some(([key, value]) => {
          return (layer as any)[key] !== value;
        });

        if (!hasActualChange) return p;

        return {
          ...p,
          isDirty: skipDirty ? p.isDirty : true,
          layers: p.layers.map((l) => (l.id === layerId ? { ...l, ...updates } : l)),
        };
      }),
    })),

  renameLayer: (projectId, layerId, name) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        { description: "Rename Layer", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: p.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
                undoStack: newUndoStack,
                redoStack: [],
                isDirty: true,
              }
            : p,
        ),
      };
    }),

  toggleLayerVisibility: (projectId, layerId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        { description: "Visibility Change", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: p.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
                undoStack: newUndoStack,
                redoStack: [],
                isDirty: true,
              }
            : p,
        ),
      };
    }),

  isolateLayer: (projectId, layerId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const historyState = createHistoryState(project);

      // Check if it's already "isolated" (this one is visible and ALL others are hidden)
      const isAlreadyIsolated =
        project.layers.find((l) => l.id === layerId)?.visible &&
        project.layers.every((l) => l.id === layerId || !l.visible);

      let newLayers;
      let description;

      if (isAlreadyIsolated) {
        // Restore: show all layers
        newLayers = project.layers.map((l) => ({ ...l, visible: true }));
        description = "Show All Layers";
      } else {
        // Isolate: show only this one
        newLayers = project.layers.map((l) => ({ ...l, visible: l.id === layerId }));
        description = "Isolate Layer";
      }

      const newUndoStack = [...project.undoStack, { description, state: historyState }];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: newLayers,
                undoStack: newUndoStack,
                redoStack: [],
                isDirty: true,
              }
            : p,
        ),
      };
    }),

  toggleLayerLock: (projectId, layerId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        { description: "Lock Change", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: p.layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
                undoStack: newUndoStack,
                redoStack: [],
                isDirty: true,
              }
            : p,
        ),
      };
    }),

  groupLayers: (projectId, layerIds) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project || layerIds.length === 0) return state;

      const historyState = createHistoryState(project);

      const movingLayerIds = new Set(layerIds);
      const selectedLayers = project.layers.filter((l) => movingLayerIds.has(l.id));

      if (selectedLayers.length === 0) return state;

      // Identify insertion point: the highest index among selected layers
      const indices = selectedLayers.map((l) => project.layers.indexOf(l));
      const targetIndex = Math.max(...indices);

      const groupId = Math.random().toString(36).substr(2, 9);
      const newGroup: Layer = {
        id: groupId,
        name: "New Group",
        type: "group",
        visible: true,
        locked: false,
        opacity: 100,
        fill: 100,
        isExpanded: true,
        parentId: selectedLayers[0].parentId || null,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        blendMode: "source-over",
      };

      // Remove moving layers and insert group + layers
      const remainingLayers = project.layers.filter((l) => !movingLayerIds.has(l.id));
      const adjustedTargetIndex = project.layers
        .slice(0, targetIndex + 1)
        .filter((l) => !movingLayerIds.has(l.id)).length;

      const newLayers = [...remainingLayers];
      newLayers.splice(
        adjustedTargetIndex,
        0,
        ...selectedLayers.map((l) => {
          // If the layer's parent is also being moved (part of the selection),
          // keep its original parentId to preserve the internal hierarchy.
          const isParentInSelection = l.parentId && movingLayerIds.has(l.parentId);
          return {
            ...l,
            parentId: isParentInSelection ? l.parentId : groupId,
          };
        }),
        newGroup,
      );

      const newUndoStack = [
        ...project.undoStack,
        { description: "Group Layers", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: newLayers,
                activeLayerId: groupId,
                selectedLayerIds: [groupId],
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: [],
              }
            : p,
        ),
      };
    }),

  ungroupLayers: (projectId, groupId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const groupLayer = project.layers.find((l) => l.id === groupId);
      if (!groupLayer || groupLayer.type !== "group") return state;

      const historyState = createHistoryState(project);

      const newLayers = project.layers
        .filter((l) => l.id !== groupId)
        .map((l) => (l.parentId === groupId ? { ...l, parentId: groupLayer.parentId || null } : l));

      const newUndoStack = [
        ...project.undoStack,
        { description: "Ungroup Layers", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: newLayers,
                activeLayerId: null,
                selectedLayerIds: [],
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: [],
              }
            : p,
        ),
      };
    }),

  toggleGroupExpansion: (projectId, groupId) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              layers: p.layers.map((l) =>
                l.id === groupId ? { ...l, isExpanded: !l.isExpanded } : l,
              ),
            }
          : p,
      ),
    })),

  convertToSmartObject: async (projectId, layerIds) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || layerIds.length === 0) return;

    // Helper to get all descendants recursively
    const getAllDescendants = (parentId: string): string[] => {
      const children = project.layers.filter((l) => l.parentId === parentId);
      let descendants = children.map((l) => l.id);
      children.forEach((child) => {
        if (child.type === "group") {
          descendants = [...descendants, ...getAllDescendants(child.id)];
        }
      });
      return descendants;
    };

    const movingLayerIds = new Set(layerIds);
    layerIds.forEach((id) => {
      const layer = project.layers.find((l) => l.id === id);
      if (layer?.type === "group") {
        getAllDescendants(id).forEach((descId) => movingLayerIds.add(descId));
      }
    });

    const selectedLayers = project.layers.filter((l) => movingLayerIds.has(l.id));
    if (selectedLayers.length === 0) return;

    // Calculate bounding box of all selected layers including their styles
    const styledBounds = getCombinedStyledBounds(selectedLayers);
    const minX = styledBounds.x;
    const minY = styledBounds.y;
    const width = styledBounds.width;
    const height = styledBounds.height;

    const smartObjectId = Math.random().toString(36).substr(2, 9);

    // Create a preview by rendering the layers using the engine (headless)
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = width;
    previewCanvas.height = height;

    const nestedLayers: Layer[] = selectedLayers.map((l) => {
      const layerClone = JSON.parse(JSON.stringify(l));
      if (layerClone.mask) {
        layerClone.mask.x -= minX;
        layerClone.mask.y -= minY;
      }
      return {
        ...layerClone,
        x: l.x - minX,
        y: l.y - minY,
        parentId: l.parentId && movingLayerIds.has(l.parentId) ? l.parentId : null,
      };
    });

    // Use ForgeEngine to render a high-quality preview with all styles
    const tempEngine = new ForgeEngine(previewCanvas, () => {}, { headless: true });
    tempEngine.setProject({
      ...project,
      width,
      height,
      layers: nestedLayers,
      zoom: 1,
      panX: 0,
      panY: 0,
    });

    await tempEngine.preloadImages();
    const dataURL = await tempEngine.exportProject("image/png", 1);
    tempEngine.stopRenderLoop(); // Just in case, although headless shouldn't start it

    // Find the correct parentId for the Smart Object itself.
    // It should inherit the parent of the topmost moving layer,
    // BUT only if that parent is NOT also moving.
    const topMovingLayer = selectedLayers[selectedLayers.length - 1];
    let finalParentId: string | null = null;
    let currentCheckId = topMovingLayer.parentId;

    while (currentCheckId && movingLayerIds.has(currentCheckId)) {
      const parent = project.layers.find((l) => l.id === currentCheckId);
      currentCheckId = parent?.parentId || null;
    }
    finalParentId = currentCheckId || null;

    const dataObject: Project = {
      id: smartObjectId,
      name: selectedLayers[selectedLayers.length - 1].name, // Use the topmost layer's name for the smart object
      width,
      height,
      layers: nestedLayers,
      activeLayerId: nestedLayers[0].id,
      selectedLayerIds: [nestedLayers[0].id],
      selection: { hasSelection: false, bounds: null },
      zoom: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    };

    const smartLayer: Layer = {
      id: smartObjectId,
      name: selectedLayers[selectedLayers.length - 1].name, // Use the topmost layer's name for the smart object
      type: "smart_object",
      visible: true,
      locked: false,
      opacity: 100,
      fill: 100,
      x: minX,
      y: minY,
      width,
      height,
      data: dataURL,
      dataOriginal: dataURL,
      dataObject,
      blendMode: "source-over",
      originalTransform: {
        x: minX,
        y: minY,
        width,
        height,
        rotation: 0,
        data: dataURL,
      },
      parentId: finalParentId,
    };

    // Push to history
    const historyState = createHistoryState(project);
    const newUndoStack = [
      ...project.undoStack,
      { description: "Convert to Smart Object", state: historyState },
    ];
    if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

    // Replace selected layers with the new smart object layer
    // Find the highest index among selected layers to insert the smart object
    const indices = selectedLayers.map((l) => project.layers.indexOf(l));
    const targetIndex = Math.max(...indices);

    const remainingLayers = project.layers.filter((l) => !movingLayerIds.has(l.id));
    const adjustedTargetIndex = project.layers
      .slice(0, targetIndex + 1)
      .filter((l) => !movingLayerIds.has(l.id)).length;

    const newLayers = [...remainingLayers];
    newLayers.splice(adjustedTargetIndex, 0, smartLayer);

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              layers: newLayers,
              activeLayerId: smartObjectId,
              selectedLayerIds: [smartObjectId],
              isDirty: true,
              undoStack: newUndoStack,
              redoStack: [],
            }
          : p,
      ),
    }));
  },

  rasterizeSmartObject: (projectId, layerId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const layer = project.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== "smart_object") return state;

      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        { description: "Rasterize Smart Object", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: p.layers.map((l) =>
                  l.id === layerId ? { ...l, type: "raster", dataObject: undefined } : l,
                ),
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: [],
              }
            : p,
        ),
      };
    }),

  resetSmartObjectTransform: (projectId, layerId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const layer = project.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== "smart_object" || !layer.originalTransform) return state;

      const historyState = createHistoryState(project);
      const newUndoStack = [
        ...project.undoStack,
        { description: "Reset Smart Object Transform", state: historyState },
      ];
      if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                layers: p.layers.map((l) =>
                  l.id === layerId
                    ? {
                        ...l,
                        x: l.originalTransform!.x,
                        y: l.originalTransform!.y,
                        width: l.originalTransform!.width,
                        height: l.originalTransform!.height,
                        rotation: l.originalTransform!.rotation,
                        data: l.originalTransform!.data || l.data,
                        dataOriginal: l.originalTransform!.data || l.dataOriginal,
                      }
                    : l,
                ),
                isDirty: true,
                undoStack: newUndoStack,
                redoStack: [],
              }
            : p,
        ),
      };
    }),

  openSmartObject: (projectId, layerId) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;

    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== "smart_object" || !layer.dataObject) return;

    // Check if it's already open
    const alreadyOpen = state.projects.find((p) => p.id === layer.id);
    if (alreadyOpen) {
      useUIStore.getState().setActiveTab(alreadyOpen.id);
      get().setActiveProject(alreadyOpen.id);
      return;
    }

    // Create a new project instance from dataObject
    const newProject: Project = {
      ...JSON.parse(JSON.stringify(layer.dataObject)),
      id: layer.id, // Use layer ID as project ID to link them
      parentLayerId: layer.id,
      parentProjectId: projectId,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    };

    set((state) => ({
      projects: [...state.projects, newProject],
    }));

    useUIStore.getState().setActiveTab(newProject.id);
    get().setActiveProject(newProject.id);
  },

  syncSmartObject: async (smartProjectId) => {
    const state = get();
    const smartProject = state.projects.find((p) => p.id === smartProjectId);
    if (!smartProject || !smartProject.parentProjectId || !smartProject.parentLayerId) return;

    const parentProject = state.projects.find((p) => p.id === smartProject.parentProjectId);
    if (!parentProject) return;

    const parentLayer = parentProject.layers.find((l) => l.id === smartProject.parentLayerId);
    if (!parentLayer || !parentLayer.dataObject) return;

    // 1. Render the smart project to a DataURL (High Quality)
    const width = smartProject.width;
    const height = smartProject.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const tempEngine = new ForgeEngine(canvas, () => {}, { headless: true });
    tempEngine.setProject({
      ...smartProject,
      zoom: 1,
      panX: 0,
      panY: 0,
    });

    await tempEngine.preloadImages();
    const dataURL = await tempEngine.exportProject("image/png", 1);
    tempEngine.stopRenderLoop();

    // Calculate new dimensions to prevent distortion
    const oldInternalWidth = parentLayer.dataObject.width;
    const oldInternalHeight = parentLayer.dataObject.height;

    // Preserve current scale factor
    const scaleX = parentLayer.width / oldInternalWidth;
    const scaleY = parentLayer.height / oldInternalHeight;

    const newParentWidth = smartProject.width * scaleX;
    const newParentHeight = smartProject.height * scaleY;

    // 2. Update parent layer
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== smartProject.parentProjectId) return p;

        const historyState = createHistoryState(p);
        const newUndoStack = [
          ...p.undoStack,
          { description: "Update Smart Object", state: historyState },
        ];
        if (newUndoStack.length > getMaxHistory()) newUndoStack.shift();

        return {
          ...p,
          layers: p.layers.map((l) =>
            l.id === smartProject.parentLayerId
              ? {
                  ...l,
                  width: newParentWidth,
                  height: newParentHeight,
                  data: dataURL,
                  dataOriginal: dataURL,
                  dataObject: JSON.parse(JSON.stringify(getSerializableProject(smartProject))),
                  originalTransform: l.originalTransform
                    ? {
                        ...l.originalTransform,
                        width: smartProject.width,
                        height: smartProject.height,
                        data: dataURL,
                      }
                    : undefined,
                }
              : l,
          ),
          isDirty: true,
          undoStack: newUndoStack,
          redoStack: [],
        };
      }),
    }));
  },

  undoText: (projectId, layerId) =>
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const layer = p.layers.find((l) => l.id === layerId);
        if (!layer || !layer.textUndoStack || layer.textUndoStack.length === 0) return p;

        const undoStack = [...(layer.textUndoStack || [])];
        const lastEntry = undoStack.pop()!;
        const redoStack = [
          ...(layer.textRedoStack || []),
          { text: layer.text || "", textSpans: layer.textSpans },
        ];

        return {
          ...p,
          layers: p.layers.map((l) =>
            l.id === layerId
              ? { ...l, ...lastEntry, textUndoStack: undoStack, textRedoStack: redoStack }
              : l,
          ),
          isDirty: true,
        };
      }),
    })),

  redoText: (projectId, layerId) =>
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const layer = p.layers.find((l) => l.id === layerId);
        if (!layer || !layer.textRedoStack || layer.textRedoStack.length === 0) return p;

        const redoStack = [...(layer.textRedoStack || [])];
        const nextEntry = redoStack.pop()!;
        const undoStack = [
          ...(layer.textUndoStack || []),
          { text: layer.text || "", textSpans: layer.textSpans },
        ];

        return {
          ...p,
          layers: p.layers.map((l) =>
            l.id === layerId
              ? { ...l, ...nextEntry, textUndoStack: undoStack, textRedoStack: redoStack }
              : l,
          ),
          isDirty: true,
        };
      }),
    })),

  addLayerMask: (projectId, layerId) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;

    get().pushHistory(projectId, "Add Layer Mask");

    const canvas = document.createElement("canvas");
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mask: LayerMask = {
      data: canvas.toDataURL(),
      x: 0,
      y: 0,
      width: project.width,
      height: project.height,
      enabled: true,
      linked: true,
    };

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              activeMaskId: layerId,
              layers: p.layers.map((l) => (l.id === layerId ? { ...l, mask } : l)),
              isDirty: true,
            }
          : p,
      ),
    }));
  },

  removeLayerMask: (projectId, layerId) => {
    get().pushHistory(projectId, "Delete Layer Mask");
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              activeMaskId: p.activeMaskId === layerId ? null : p.activeMaskId,
              layers: p.layers.map((l) => (l.id === layerId ? { ...l, mask: undefined } : l)),
              isDirty: true,
            }
          : p,
      ),
    }));
  },

  updateLayerMask: (projectId, layerId, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              layers: p.layers.map((l) =>
                l.id === layerId && l.mask ? { ...l, mask: { ...l.mask, ...updates } } : l,
              ),
              isDirty: true,
            }
          : p,
      ),
    })),

  setActiveMask: (projectId, layerId) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, activeMaskId: layerId } : p,
      ),
    })),

  setActiveLayer: (projectId, layerId) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              activeLayerId: layerId,
              activeMaskId: null,
              selectedLayerIds: layerId ? [layerId] : [],
            }
          : p,
      ),
    })),

  setSelectedLayers: (projectId, layerIds) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              selectedLayerIds: layerIds,
              // Keep the active layer as the first one if not specified or already in selection
              activeLayerId:
                layerIds.length > 0
                  ? layerIds.includes(p.activeLayerId || "")
                    ? p.activeLayerId
                    : layerIds[layerIds.length - 1]
                  : null,
            }
          : p,
      ),
    })),

  pushHistory: (projectId, description) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const historyState = createHistoryState(project);

      const newEntry: HistoryEntry = {
        description,
        state: historyState,
      };

      const newUndoStack = [...project.undoStack, newEntry];
      if (newUndoStack.length > getMaxHistory()) {
        newUndoStack.shift();
      }

      return {
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, undoStack: newUndoStack, redoStack: [] } : p,
        ),
      };
    }),

  undo: (projectId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      // Impede undo se tiver apenas o estado inicial
      if (!project || project.undoStack.length <= 1) return state;

      const newUndoStack = [...project.undoStack];
      const lastEntry = newUndoStack.pop()!;

      // Save current state to redo stack
      const currentHistoryState = createHistoryState(project);

      const redoEntry: HistoryEntry = {
        description: lastEntry.description,
        state: currentHistoryState,
      };

      const newRedoStack = [...project.redoStack, redoEntry];

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                ...lastEntry.state,
                undoStack: newUndoStack,
                redoStack: newRedoStack,
                isDirty: true,
              }
            : p,
        ),
      };
    }),

  redo: (projectId) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project || project.redoStack.length === 0) return state;

      const newRedoStack = [...project.redoStack];
      const nextEntry = newRedoStack.pop()!;

      // Save current state to undo stack
      const currentHistoryState = createHistoryState(project);

      const undoEntry: HistoryEntry = {
        description: nextEntry.description,
        state: currentHistoryState,
      };

      const newUndoStack = [...project.undoStack, undoEntry];

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                ...nextEntry.state,
                undoStack: newUndoStack,
                redoStack: newRedoStack,
                isDirty: true,
              }
            : p,
        ),
      };
    }),

  jumpToHistory: (projectId, index) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;

      const historyLength = project.undoStack.length + project.redoStack.length;
      if (index < 0 || index >= historyLength) return state;

      // Use mutable arrays internally for the loop
      const currentUndoStack = [...project.undoStack];
      const currentRedoStack = [...project.redoStack];

      // Capture the current live state ONCE before the loop
      let currentHistoryState = createHistoryState(project);

      // The user's current index is always based on the undoStack size
      const currentIndex = currentUndoStack.length - 1;

      if (index === currentIndex) return state;

      if (index < currentIndex) {
        // Going back in time (Simulates Undo calls)
        const steps = currentIndex - index;
        for (let i = 0; i < steps; i++) {
          const lastEntry = currentUndoStack.pop()!;
          currentRedoStack.push({
            description: lastEntry.description,
            state: currentHistoryState,
          });
          currentHistoryState = lastEntry.state;
        }
      } else {
        // Going forward in time (Simulates Redo calls)
        const steps = index - currentIndex;
        for (let i = 0; i < steps; i++) {
          const nextEntry = currentRedoStack.pop()!;
          currentUndoStack.push({
            description: nextEntry.description,
            state: currentHistoryState,
          });
          currentHistoryState = nextEntry.state;
        }
      }

      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                ...currentHistoryState,
                undoStack: currentUndoStack,
                redoStack: currentRedoStack,
                isDirty: true,
              }
            : p,
        ),
      };
    }),
}));
