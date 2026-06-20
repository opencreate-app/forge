/**
 * Purpose: Abstract base class and context definition for all tools, defining the interface for mouse and keyboard events and rendering.
 */
import { Project, Layer, HistoryEntry } from "@/renderer/store/projectStore";
import { ToolSettings, ToolId } from "@/renderer/store/toolStore";

export type { ToolId };

/**
 * Provides the execution environment and API for tools to interact with the project and engine.
 */
export interface ToolContext {
  /** The currently active project. */
  project: Project;
  /** Global tool settings. */
  settings: ToolSettings;
  /** ID of the currently active tool. */
  activeToolId: ToolId;
  /** ID of the tool that was active previously. */
  previousToolId: ToolId;
  /** The main viewport canvas element. */
  canvas: HTMLCanvasElement;
  /** The 2D rendering context for the main canvas. */
  ctx: CanvasRenderingContext2D;
  /** Updates the project state. */
  updateProject: (updates: Partial<Project>) => void;
  /** Pushes a new entry to the undo history. */
  pushHistory: (description: string) => void;
  /** Adds a raw history entry. */
  addHistoryEntry: (entry: HistoryEntry) => void;
  /** Invalidates the rendered cache for a layer. */
  invalidateCache: (layerId: string) => void;
  /** Manually sets the cached canvas for a layer. */
  setLayerCache: (layerId: string, canvas: HTMLCanvasElement) => void;
  /** Retrieves the cached canvas for a layer. */
  getLayerCanvas: (layerId: string) => { canvas: HTMLCanvasElement; ready: boolean } | null;
  /** Ensures a layer has a cached canvas, creating it if necessary. */
  ensureLayerCanvas: (layer: Layer) => Promise<HTMLCanvasElement>;
  /** Converts screen (mouse) coordinates to project space. */
  screenToProject: (x: number, y: number) => { x: number; y: number };
  /** Current foreground color for painting tools. */
  foregroundColor: string;
  /** Current background color for painting tools. */
  backgroundColor: string;
  /** Returns the canvas and context used for the selection mask. */
  getSelectionCanvas: () => {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  };
  /** Triggers a recalculation of selection edges for marching ants. */
  updateSelectionEdges: () => void;
  /** Sets the last used selection mask dataURL. */
  setLastSelectionMask: (mask: string | undefined) => void;
  /** Lifts the selection from a layer into a floating state. */
  floatSelection: (layerId: string) => Promise<boolean>;
  /** Merges a floating selection back into its target layer. */
  commitFloatingLayer: () => Promise<void>;
  /** Clears the current selection. */
  clearSelection: () => Promise<void>;
  /** Notifies the UI that the tool is currently performing an operation. */
  setInteracting: (isInteracting: boolean) => void;
  /** Changes the active tool. */
  setActiveTool: (id: ToolId) => void;
  /** Updates settings for a specific tool. */
  updateToolSettings: <K extends keyof ToolSettings>(
    id: K,
    settings: Partial<ToolSettings[K]>,
  ) => void;
  /** Subscribes to changes in tool settings. */
  subscribe: (listener: (settings: ToolSettings) => void) => () => void;
  /** Animates the viewport to fit the project on screen. */
  animateFitToScreen: (overrideWidth?: number, overrideHeight?: number) => void;
  /** Checks if a layer is effectively locked (including ancestors). */
  isLayerLocked: (layerId: string) => boolean;
  /** Checks if a layer is effectively visible (including ancestors). */
  isLayerVisible: (layerId: string) => boolean;
}

/**
 * Abstract base class for all tools in the engine.
 * Tools handle user input (mouse/keyboard) and can render custom UI elements.
 */
export abstract class BaseTool {
  /** Unique identifier for the tool. */
  abstract id: ToolId;

  /** Called when the mouse button is pressed. */
  onMouseDown(_e: MouseEvent, _context: ToolContext): void {}
  /** Called when the mouse button is double clicked. */
  onDoubleClick(_e: MouseEvent, _context: ToolContext): void {}
  /** Called when the mouse moves over the canvas. */
  onMouseMove(_e: MouseEvent, _context: ToolContext): void {}
  /** Called when the mouse button is released. */
  onMouseUp(_e: MouseEvent, _context: ToolContext): void {}

  /** Called when the tool becomes the active tool. */
  onActivate(_context: ToolContext): void {}
  /** Called when the tool is replaced by another tool. */
  onDeactivate(_context: ToolContext): void {}

  /**
   * Called when a key is pressed.
   * @returns true if the tool consumed the event, false otherwise.
   */
  onKeyDown(_e: KeyboardEvent, _context: ToolContext): boolean {
    return false;
  }

  /**
   * Returns the ID of the layer currently being edited by this tool (if any).
   */
  getEditingLayerId(): string | null {
    return null;
  }

  /**
   * Returns the active drawing canvas and its position if the tool is currently painting.
   */
  getDrawingCanvas(): { canvas: HTMLCanvasElement; x: number; y: number } | null {
    return null;
  }

  /**
   * Called during the render loop to allow tools to draw custom overlays (e.g., guides, brush previews).
   */
  onRender(_ctx: CanvasRenderingContext2D, _context: ToolContext): void {}
}
