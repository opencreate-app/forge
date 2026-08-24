/**
 * Purpose: Comprehensive tool for creating and editing text layers, featuring rich text input, caret management, selection, and transformations.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";
import {
  Layer,
  useProjectStore,
  HistoryState,
  type TextAlignment,
} from "@/renderer/store/projectStore";
import { TextLayer } from "../layers/TextLayer";
import { useUIStore } from "@/renderer/store/uiStore";
import {
  applyTextSpanStyle,
  getTextSpanStyleAtCaret,
  getTextSpanStyleAt,
  getTextLineIndex,
  getTextWordRangeAt,
  replaceTextWithSpans,
  scaleTextSpanFontSizes,
  updateTextLineAlignments,
  updateTextLineHeights,
  normalizeTextFontWeight,
  promoteTextStyleToLayer,
  type TextSpanStyle,
} from "../utils/textSpans";
import { useTextEditorStore, type TextFormatCommand } from "@/renderer/store/textEditorStore";

export class TextTool extends BaseTool {
  id: ToolId = "text";

  private previousState: HistoryState | null = null;

  private isDragging = false;
  private isMoving = false;
  private startPos = { x: 0, y: 0 };
  private currentPos = { x: 0, y: 0 };
  private layerStartPos = { x: 0, y: 0 };
  private layerStartBounds = { x: 0, y: 0, width: 0, height: 0 };
  private handleStartOffset = { x: 0, y: 0 };
  private activeSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];

  private editingLayerId: string | null = null;
  private caretIndex: number = 0;
  private selectionStart: number = 0;
  private isEditing = false;
  private isSelecting = false;
  private isResizing = false;
  private isRotating = false;
  private resizeHandle: string | null = null;
  private isCtrlPressed = false;
  private originalText: string = "";
  private hiddenInput: HTMLTextAreaElement | null = null;
  private isComposing = false;
  private lastContext: ToolContext | null = null;
  private dragStartRotation: number = 0;
  private pendingTextStyle: TextSpanStyle = {};
  private fontSizeScaleSession: {
    gestureId: number;
    layerId: string;
    text: string;
    start: number;
    end: number;
    textSpans?: Layer["textSpans"];
  } | null = null;

  private onApply = () => this.commit(this.lastContext!);
  private onCancel = () => this.cancel(this.lastContext!);
  private onFormat = (event: Event) => {
    if (!this.lastContext) return;
    const command = (event as CustomEvent<TextFormatCommand>).detail;
    if (command) this.applyFormat(command, this.lastContext);
  };
  private handleKeyChange = (e: KeyboardEvent) => {
    this.isCtrlPressed = e.ctrlKey || e.metaKey;
    useTextEditorStore.getState().setState({ isCtrlPressed: this.isCtrlPressed });
    if (this.lastContext) this.lastContext.invalidateCache("render-only");
  };

  onActivate(context: ToolContext): void {
    this.lastContext = context;
    window.addEventListener("forge:text-apply", this.onApply);
    window.addEventListener("forge:text-cancel", this.onCancel);
    window.addEventListener("forge:text-format", this.onFormat);
    window.addEventListener("keydown", this.handleKeyChange);
    window.addEventListener("keyup", this.handleKeyChange);
    this.createHiddenInput(context);
  }

  onDeactivate(context: ToolContext): void {
    if (this.isEditing) {
      this.commit(context);
    }
    this.activeSnapLines = [];
    this.isCtrlPressed = false;
    useTextEditorStore.getState().setState({ isCtrlPressed: false });
    this.fontSizeScaleSession = null;
    window.removeEventListener("forge:text-apply", this.onApply);
    window.removeEventListener("forge:text-cancel", this.onCancel);
    window.removeEventListener("forge:text-format", this.onFormat);
    window.removeEventListener("keydown", this.handleKeyChange);
    window.removeEventListener("keyup", this.handleKeyChange);
    this.removeHiddenInput();
  }

  private createHiddenInput(context: ToolContext) {
    if (this.hiddenInput) return;
    this.hiddenInput = document.createElement("textarea");
    this.hiddenInput.style.position = "fixed";
    this.hiddenInput.style.left = "0px";
    this.hiddenInput.style.top = "0px";
    this.hiddenInput.style.width = "1px";
    this.hiddenInput.style.height = "1px";
    this.hiddenInput.style.opacity = "0";
    this.hiddenInput.style.zIndex = "-1";
    this.hiddenInput.id = "forge-text-input";
    document.body.appendChild(this.hiddenInput);

    this.hiddenInput.addEventListener("input", (_e: any) => {
      if (!this.isEditing || this.isComposing) return;
      const val = this.hiddenInput!.value;
      if (val) {
        this.insertText(val, context);
        this.hiddenInput!.value = "";
      }
    });

    this.hiddenInput.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });

    this.hiddenInput.addEventListener("compositionend", (e: any) => {
      this.isComposing = false;
      if (e.data) {
        this.insertText(e.data, context);
        this.hiddenInput!.value = "";
      }
    });

    this.hiddenInput.addEventListener("blur", () => {
      setTimeout(() => {
        if (!this.isEditing || !this.hiddenInput) return;

        // Don't steal focus if user clicked on another interactive UI element
        const active = document.activeElement;
        const isInteractiveUI =
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "SELECT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "BUTTON" ||
            (active as HTMLElement).isContentEditable);

        if (!isInteractiveUI && active !== this.hiddenInput) {
          this.hiddenInput.focus();
        }
      }, 50);
    });

    // We do NOT add a keydown listener here because ForgeEngine already
    // has a window-level listener that calls tool.onKeyDown(e).
  }

  private removeHiddenInput() {
    if (this.hiddenInput) {
      document.body.removeChild(this.hiddenInput);
      this.hiddenInput = null;
    }
  }

  getEditingLayerId(): string | null {
    return this.isEditing ? this.editingLayerId : null;
  }

  private getTransformHandles(layer: Layer, zoom: number) {
    const { x, y, width, height, rotation = 0 } = layer;
    const midX = x + width / 2;
    const midY = y + height / 2;

    const rawHandles = [
      { name: "top-left", x, y, cursor: "nwse-resize" },
      { name: "top-middle", x: midX, y, cursor: "ns-resize" },
      { name: "top-right", x: x + width, y, cursor: "nesw-resize" },
      { name: "center-left", x, y: midY, cursor: "ew-resize" },
      { name: "center-right", x: x + width, y: midY, cursor: "ew-resize" },
      { name: "bottom-left", x, y: y + height, cursor: "nesw-resize" },
      { name: "bottom-middle", x: midX, y: y + height, cursor: "ns-resize" },
      { name: "bottom-right", x: x + width, y: y + height, cursor: "nwse-resize" },
      { name: "rotate", x: midX, y: y - 20 / zoom, cursor: "crosshair" },
    ];

    if (rotation === 0) return rawHandles;

    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return rawHandles.map((h) => {
      const dx = h.x - midX;
      const dy = h.y - midY;
      return {
        ...h,
        x: midX + (dx * cos - dy * sin),
        y: midY + (dx * sin + dy * cos),
        cursor: this.getRotatedCursor(h.name, rotation),
      };
    });
  }

  private getRotatedCursor(handleName: string, rotation: number): string {
    if (handleName === "rotate") return "crosshair";
    const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
    let baseDir = "";
    if (handleName.includes("top")) baseDir += "n";
    else if (handleName.includes("bottom")) baseDir += "s";
    if (handleName.includes("left")) baseDir += "w";
    else if (handleName.includes("right")) baseDir += "e";

    if (baseDir === "wn") baseDir = "nw";
    if (baseDir === "en") baseDir = "ne";
    if (baseDir === "ws") baseDir = "sw";
    if (baseDir === "es") baseDir = "se";

    const index = directions.indexOf(baseDir);
    if (index === -1) return "default";

    const steps = Math.round(rotation / 45);
    const newIndex = (index + steps + directions.length) % directions.length;
    return `${directions[newIndex]}-resize`;
  }

  private worldToLocal(px: number, py: number, layer: Layer): { x: number; y: number } {
    const rotation = layer.rotation || 0;
    if (rotation === 0) return { x: px, y: py };

    const midX = layer.x + layer.width / 2;
    const midY = layer.y + layer.height / 2;

    const dx = px - midX;
    const dy = py - midY;

    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      x: midX + (dx * cos - dy * sin),
      y: midY + (dx * sin + dy * cos),
    };
  }

  private getHandleAtPoint(x: number, y: number, layer: Layer, zoom: number) {
    const handles = this.getTransformHandles(layer, zoom);
    const handleSize = 8 / zoom;
    const threshold = handleSize * 1.5;

    let bestHandle = null;
    let minRectDist = threshold;

    for (const h of handles) {
      const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
      if (dist < minRectDist) {
        minRectDist = dist;
        bestHandle = h;
      }
    }
    return bestHandle;
  }

  getEditingState() {
    return {
      caretIndex: this.caretIndex,
      selectionStart: this.selectionStart,
      isFocused: this.isEditing,
    };
  }

  private getFormattingRange(text: string): { start: number; end: number } {
    const selectionStart = Math.min(this.caretIndex, this.selectionStart);
    const selectionEnd = Math.max(this.caretIndex, this.selectionStart);
    if (selectionStart !== selectionEnd) {
      return { start: selectionStart, end: selectionEnd };
    }

    return (
      getTextWordRangeAt(text, this.caretIndex) || {
        start: this.caretIndex,
        end: this.caretIndex,
      }
    );
  }

  private getLineHeightState(
    layer: Layer,
    text: string,
    start: number,
    end: number,
  ): { lineHeight: number; mixed: boolean } {
    const baseLineHeight = layer.lineHeight || 1.2;
    const startLine = getTextLineIndex(text, start);
    const endLine = getTextLineIndex(text, end);
    const values: number[] = [];
    for (let line = startLine; line <= endLine; line++) {
      values.push(layer.textLineHeights?.[line] ?? baseLineHeight);
    }
    const lineHeight =
      layer.textLineHeights?.[getTextLineIndex(text, this.caretIndex)] ?? baseLineHeight;
    return { lineHeight, mixed: values.some((value) => value !== values[0]) };
  }

  private getTextEditorAnchor(layer: Layer, start: number, end: number) {
    const fallback = {
      x: layer.x,
      y: layer.y,
    };
    const ctx = this.lastContext?.ctx;
    if (!ctx) return fallback;

    const bounds = TextLayer.getTextRangeBounds(ctx, layer, start, end);
    const anchor = {
      x: bounds.x,
      y: bounds.y,
    };
    const rotation = layer.rotation || 0;
    if (rotation === 0) return anchor;

    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const offsetX = anchor.x - centerX;
    const offsetY = anchor.y - centerY;

    return {
      x: centerX + offsetX * cos - offsetY * sin,
      y: centerY + offsetX * sin + offsetY * cos,
    };
  }

  private syncEditorStore(layer?: Layer) {
    if (!this.isEditing || !this.editingLayerId || !layer) {
      useTextEditorStore.getState().reset();
      return;
    }

    const text = layer.text || "";
    const { start, end } = this.getFormattingRange(text);
    const selectionStyle =
      start === end
        ? {
            style: {
              ...this.getBaseTextStyle(layer),
              ...getTextSpanStyleAtCaret(text, layer.textSpans, this.caretIndex),
              ...this.pendingTextStyle,
            },
            mixedStyles: {},
          }
        : this.getSelectionStyle(layer, start, end);
    const lineIndex = getTextLineIndex(text, this.caretIndex);
    const lineHeightState = this.getLineHeightState(layer, text, start, end);

    useTextEditorStore.getState().setState({
      isEditing: true,
      layerId: layer.id,
      caretIndex: this.caretIndex,
      selectionStart: this.selectionStart,
      formatStart: start,
      formatEnd: end,
      isCtrlPressed: this.isCtrlPressed,
      anchor: this.getTextEditorAnchor(layer, start, end),
      style: selectionStyle.style,
      mixedStyles: selectionStyle.mixedStyles,
      lineAlignment: layer.textLineAlignments?.[lineIndex] || layer.textAlign || "left",
      lineHeight: lineHeightState.lineHeight,
      mixedLineHeight: lineHeightState.mixed,
    });
  }

  private getSelectionStyle(
    layer: Layer,
    start: number,
    end: number,
  ): { style: TextSpanStyle; mixedStyles: Partial<Record<keyof TextSpanStyle, boolean>> } {
    const first = {
      ...this.getBaseTextStyle(layer),
      ...getTextSpanStyleAt(layer.textSpans, start),
    };
    const style: TextSpanStyle = {};
    const keys: (keyof TextSpanStyle)[] = [
      "color",
      "fontSize",
      "fontFamily",
      "fontWeight",
      "italic",
      "underline",
      "strikethrough",
      "verticalAlign",
      "tracking",
    ];
    const mixedStyles: Partial<Record<keyof TextSpanStyle, boolean>> = {};
    for (const key of keys) {
      let matches = true;
      for (let index = start + 1; index < end; index++) {
        const current = {
          ...this.getBaseTextStyle(layer),
          ...getTextSpanStyleAt(layer.textSpans, index),
        };
        if (current[key] !== first[key]) {
          matches = false;
          break;
        }
      }
      if (matches) style[key] = first[key] as never;
      else mixedStyles[key] = true;
    }
    return { style, mixedStyles };
  }

  private getBaseTextStyle(layer: Layer): TextSpanStyle {
    return {
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      color: layer.color,
      tracking: layer.tracking,
    };
  }

  private applyFormat(command: TextFormatCommand, context: ToolContext) {
    if (!this.isEditing || !this.editingLayerId) return;
    const layer = context.project.layers.find((item) => item.id === this.editingLayerId);
    if (!layer) return;

    const text = layer.text || "";
    const formattingRange = this.getFormattingRange(text);
    const start = command.scope === "all" ? 0 : formattingRange.start;
    const end = command.scope === "all" ? text.length : formattingRange.end;
    const style = command.style || {};

    if (command.type !== "scaleFontSize" || command.gestureId === undefined) {
      this.fontSizeScaleSession = null;
    }

    if (command.type === "setLineAlignment") {
      const lineIndex = getTextLineIndex(text, this.caretIndex);
      const textLineAlignments = { ...(layer.textLineAlignments || {}) };
      if (command.alignment && command.alignment !== (layer.textAlign || "left")) {
        textLineAlignments[lineIndex] = command.alignment;
      } else {
        delete textLineAlignments[lineIndex];
      }
      this.updateText(text, context, layer.textSpans, textLineAlignments);
      this.syncEditorStore({ ...layer, textLineAlignments });
      return;
    }

    if (command.type === "setLineHeight") {
      const lineHeight = command.lineHeight;
      if (lineHeight === undefined || !Number.isFinite(lineHeight) || lineHeight <= 0) return;
      const textLineHeights = { ...(layer.textLineHeights || {}) };
      const startLine = getTextLineIndex(text, start);
      const endLine = getTextLineIndex(text, end);
      for (let line = startLine; line <= endLine; line++) {
        if (lineHeight === (layer.lineHeight || 1.2)) delete textLineHeights[line];
        else textLineHeights[line] = lineHeight;
      }
      this.updateText(text, context, layer.textSpans, layer.textLineAlignments, textLineHeights);
      this.syncEditorStore({ ...layer, textLineHeights });
      return;
    }

    if (start === end) {
      this.pendingTextStyle = { ...this.pendingTextStyle, ...style };
      this.syncEditorStore(layer);
      return;
    }

    let sourceSpans = layer.textSpans;
    if (command.type === "scaleFontSize" && command.gestureId !== undefined) {
      const session = this.fontSizeScaleSession;
      const matchesSession =
        session &&
        session.gestureId === command.gestureId &&
        session.layerId === layer.id &&
        session.text === text &&
        session.start === start &&
        session.end === end;
      if (matchesSession) {
        sourceSpans = session.textSpans;
      } else {
        this.fontSizeScaleSession = {
          gestureId: command.gestureId,
          layerId: layer.id,
          text,
          start,
          end,
          textSpans: layer.textSpans?.map((span) => ({ ...span })),
        };
        sourceSpans = this.fontSizeScaleSession.textSpans;
      }
    }

    const isWholeTextSelection = text.length > 0 && start === 0 && end === text.length;
    if (isWholeTextSelection && command.type === "setStyle") {
      const promoted = promoteTextStyleToLayer(text, layer.textSpans, style);
      this.updateText(text, context, promoted.textSpans, undefined, undefined, promoted.layerStyle);
      this.syncEditorStore({ ...layer, ...promoted.layerStyle, textSpans: promoted.textSpans });
      return;
    }

    const textSpans =
      command.type === "scaleFontSize"
        ? scaleTextSpanFontSizes(
            text,
            sourceSpans,
            start,
            end,
            Number(command.to) / Number(command.from),
            layer.fontSize || Number(command.from) || 24,
          )
        : applyTextSpanStyle(text, layer.textSpans, start, end, {
            ...style,
            ...(style.fontWeight !== undefined
              ? { fontWeight: normalizeTextFontWeight(style.fontWeight) }
              : {}),
          });
    const layerUpdates =
      isWholeTextSelection && command.type === "scaleFontSize" && command.to !== undefined
        ? { fontSize: Number(command.to) }
        : undefined;
    this.updateText(text, context, textSpans, undefined, undefined, layerUpdates);
    this.syncEditorStore({ ...layer, ...layerUpdates, textSpans });
  }

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    this.lastContext = context;
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    this.startPos = { x, y };
    this.currentPos = { x, y };

    // 1. Hit-test existing text layers
    const hitLayer = this.findTextLayerAt(x, y, context);

    if (this.isEditing && this.editingLayerId) {
      const editingLayer = context.project.layers.find((l) => l.id === this.editingLayerId);

      if (this.isCtrlPressed && editingLayer) {
        const handle = this.getHandleAtPoint(x, y, editingLayer, context.project.zoom);
        if (handle) {
          if (handle.name === "rotate") {
            this.isRotating = true;
            this.dragStartRotation = editingLayer.rotation || 0;
          } else {
            this.isResizing = true;
            this.resizeHandle = handle.name;
            this.handleStartOffset = { x: x - handle.x, y: y - handle.y };
            this.layerStartBounds = {
              x: editingLayer.x,
              y: editingLayer.y,
              width: editingLayer.width,
              height: editingLayer.height,
            };
          }
          this.layerStartPos = { x: editingLayer.x, y: editingLayer.y };
          this.startPos = { x, y };
          context.setInteracting(true);
          return;
        }
      }

      // Focus hidden input to ensure we catch keyboard
      setTimeout(() => this.hiddenInput?.focus(), 50);

      // If clicked outside the current editing layer, but inside another text layer
      if (hitLayer && hitLayer.id !== this.editingLayerId) {
        this.commit(context);
        this.startEditing(hitLayer, context);
        return;
      }

      // If clicked inside the current editing layer
      if (hitLayer && hitLayer.id === this.editingLayerId) {
        const localPos = this.worldToLocal(x, y, hitLayer);
        const index = TextLayer.getCaretIndexAt(context.ctx, hitLayer, localPos.x, localPos.y);
        this.caretIndex = index;
        if (!e.shiftKey) {
          this.selectionStart = index;
        }
        this.isSelecting = true;
        context.setInteracting(true);
        this.syncEditorStore(hitLayer);
        return;
      }

      // If clicked far from the current editing layer, start moving it
      if (!hitLayer) {
        this.isMoving = true;
        this.layerStartPos = { x: editingLayer?.x || 0, y: editingLayer?.y || 0 };
        context.setInteracting(true);
        return;
      }
    }

    if (hitLayer) {
      this.startEditing(hitLayer, context, x, y);
      return;
    }

    // 2. Prepare for new layer (click or drag)
    this.isDragging = true;
    context.setInteracting(true);

    let startX = x;
    let startY = y;
    this.activeSnapLines = [];

    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;

    const vSnaps = [0, context.project.width / 2, context.project.width];
    const hSnaps = [0, context.project.height / 2, context.project.height];

    if (showGuides && snapToGuides) {
      const guides = context.project.guides || [];
      vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
      hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
    }

    const snapMargin = 5 / context.project.zoom;

    let bestDiffX = Infinity;
    let bestGuideX = null;
    for (const snapPos of vSnaps) {
      const diff = snapPos - startX;
      if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
        bestDiffX = diff;
        bestGuideX = snapPos;
      }
    }
    if (bestGuideX !== null) {
      startX = bestGuideX;
      this.activeSnapLines.push({ type: "vertical", position: bestGuideX });
    }

    let bestDiffY = Infinity;
    let bestGuideY = null;
    for (const snapPos of hSnaps) {
      const diff = snapPos - startY;
      if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
        bestDiffY = diff;
        bestGuideY = snapPos;
      }
    }
    if (bestGuideY !== null) {
      startY = bestGuideY;
      this.activeSnapLines.push({ type: "horizontal", position: bestGuideY });
    }

    this.startPos = { x: startX, y: startY };
    this.currentPos = { x: startX, y: startY };
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    this.lastContext = context;
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    this.activeSnapLines = [];

    const uiState = useUIStore.getState();
    const showGuides = uiState.showGuides;
    const snapToGuides = uiState.snapToGuides;
    const snapMargin = 5 / context.project.zoom;
    const guides = context.project.guides || [];

    if (this.isSelecting && this.editingLayerId) {
      const editingLayer = context.project.layers.find((l) => l.id === this.editingLayerId);
      if (editingLayer) {
        const localPos = this.worldToLocal(x, y, editingLayer);
        this.caretIndex = TextLayer.getCaretIndexAt(
          context.ctx,
          editingLayer,
          localPos.x,
          localPos.y,
        );
        this.syncEditorStore(editingLayer);
      }
      return;
    }

    if (this.isRotating && this.editingLayerId) {
      const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
      if (!layer) return;

      const midX = layer.x + layer.width / 2;
      const midY = layer.y + layer.height / 2;

      const startAngle = Math.atan2(this.startPos.y - midY, this.startPos.x - midX);
      const currentAngle = Math.atan2(y - midY, x - midX);

      let newRotation = this.dragStartRotation + ((currentAngle - startAngle) * 180) / Math.PI;

      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }

      useProjectStore.getState().updateLayer(context.project.id, this.editingLayerId, {
        rotation: newRotation % 360,
      });
      return;
    }

    if (this.isResizing && this.editingLayerId && this.resizeHandle) {
      const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
      if (!layer) return;

      // 1. Correct mouse position by initial handle offset
      let targetX = x - this.handleStartOffset.x;
      let targetY = y - this.handleStartOffset.y;

      const potentialSnapLines: { type: "horizontal" | "vertical"; position: number }[] = [];

      let bestDiffX = Infinity;
      let bestGuideX = null;
      let bestDiffY = Infinity;
      let bestGuideY = null;

      const vSnaps = [0, context.project.width / 2, context.project.width];
      const hSnaps = [0, context.project.height / 2, context.project.height];

      if (showGuides && snapToGuides) {
        vSnaps.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
        hSnaps.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
      }

      for (const snapPos of vSnaps) {
        const diff = snapPos - targetX;
        if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
          bestDiffX = diff;
          bestGuideX = snapPos;
        }
      }
      for (const snapPos of hSnaps) {
        const diff = snapPos - targetY;
        if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
          bestDiffY = diff;
          bestGuideY = snapPos;
        }
      }

      if (bestGuideX !== null) {
        targetX = bestGuideX;
        potentialSnapLines.push({ type: "vertical", position: bestGuideX });
      }
      if (bestGuideY !== null) {
        targetY = bestGuideY;
        potentialSnapLines.push({ type: "horizontal", position: bestGuideY });
      }

      const isRotated = Math.abs(layer.rotation || 0) > 0.01;

      let newX = layer.x;
      let newY = layer.y;
      let newW = layer.width;
      let newH = layer.height;

      if (!isRotated) {
        // Use initial bounds to avoid drift
        const b = this.layerStartBounds;
        if (this.resizeHandle.includes("right")) newW = Math.max(10, targetX - b.x);
        if (this.resizeHandle.includes("left")) {
          const right = b.x + b.width;
          newX = Math.min(right - 10, targetX);
          newW = right - newX;
        }
        if (this.resizeHandle.includes("bottom")) newH = Math.max(10, targetY - b.y);
        if (this.resizeHandle.includes("top")) {
          const bottom = b.y + b.height;
          newY = Math.min(bottom - 10, targetY);
          newH = bottom - newY;
        }

        newX = Math.round(newX);
        newY = Math.round(newY);
        newW = Math.round(newW);
        newH = Math.round(newH);
      } else {
        // Rotated text still uses delta logic
        const localPos = this.worldToLocal(targetX, targetY, layer);
        const localStartPos = this.worldToLocal(this.startPos.x, this.startPos.y, layer);

        const dx = localPos.x - localStartPos.x;
        const dy = localPos.y - localStartPos.y;

        if (this.resizeHandle.includes("right")) newW = Math.max(10, layer.width + dx);
        if (this.resizeHandle.includes("left")) {
          const delta = Math.min(layer.width - 10, dx);
          newX = layer.x + delta;
          newW = layer.width - delta;
        }
        if (this.resizeHandle.includes("bottom")) newH = Math.max(10, layer.height + dy);
        if (this.resizeHandle.includes("top")) {
          const delta = Math.min(layer.height - 10, dy);
          newY = layer.y + delta;
          newH = layer.height - delta;
        }

        newX = Math.round(newX);
        newY = Math.round(newY);
        newW = Math.round(newW);
        newH = Math.round(newH);

        this.startPos = { x: targetX, y: targetY };
      }

      useProjectStore.getState().updateLayer(context.project.id, this.editingLayerId, {
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      });

      // Verify snap lines
      const updatedLayer = { ...layer, x: newX, y: newY, width: newW, height: newH };
      const handles = this.getTransformHandles(updatedLayer, context.project.zoom);
      const currentHandle = handles.find((h) => h.name === this.resizeHandle);
      if (currentHandle) {
        for (const line of potentialSnapLines) {
          if (line.type === "vertical" && Math.abs(currentHandle.x - line.position) < 0.1) {
            this.activeSnapLines.push(line);
          } else if (
            line.type === "horizontal" &&
            Math.abs(currentHandle.y - line.position) < 0.1
          ) {
            this.activeSnapLines.push(line);
          }
        }
      }
      return;
    }

    if (this.isMoving && this.editingLayerId) {
      const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
      if (!layer) return;

      let dx = x - this.startPos.x;
      let dy = y - this.startPos.y;

      const potentialX = this.layerStartPos.x + dx;
      const potentialY = this.layerStartPos.y + dy;

      const snapPointsX = [
        potentialX, // left
        potentialX + layer.width / 2, // center
        potentialX + layer.width, // right
      ];

      let bestDiffX = Infinity;
      let bestGuideX = null;

      const vSnapsCurrent = [0, context.project.width / 2, context.project.width];
      if (showGuides && snapToGuides) {
        vSnapsCurrent.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
      }

      for (const snapPos of vSnapsCurrent) {
        for (const sp of snapPointsX) {
          const diff = snapPos - sp;
          if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
            bestDiffX = diff;
            bestGuideX = snapPos;
          }
        }
      }

      if (bestGuideX !== null) {
        dx += bestDiffX;
        this.activeSnapLines.push({ type: "vertical", position: bestGuideX });
      }

      const snapPointsY = [
        potentialY, // top
        potentialY + layer.height / 2, // center
        potentialY + layer.height, // bottom
      ];

      let bestDiffY = Infinity;
      let bestGuideY = null;

      const hSnapsCurrent = [0, context.project.height / 2, context.project.height];
      if (showGuides && snapToGuides) {
        hSnapsCurrent.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
      }

      for (const snapPos of hSnapsCurrent) {
        for (const sp of snapPointsY) {
          const diff = snapPos - sp;
          if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
            bestDiffY = diff;
            bestGuideY = snapPos;
          }
        }
      }

      if (bestGuideY !== null) {
        dy += bestDiffY;
        this.activeSnapLines.push({ type: "horizontal", position: bestGuideY });
      }

      useProjectStore.getState().updateLayer(context.project.id, this.editingLayerId, {
        x: Math.round(this.layerStartPos.x + dx),
        y: Math.round(this.layerStartPos.y + dy),
      });
      return;
    }

    if (this.isDragging) {
      let curX = x;
      let curY = y;

      let bestDiffX = Infinity;
      let bestGuideX = null;
      let bestDiffY = Infinity;
      let bestGuideY = null;

      const vSnapsCreate = [0, context.project.width / 2, context.project.width];
      const hSnapsCreate = [0, context.project.height / 2, context.project.height];

      if (showGuides && snapToGuides) {
        vSnapsCreate.push(...guides.filter((g) => g.type === "vertical").map((g) => g.position));
        hSnapsCreate.push(...guides.filter((g) => g.type === "horizontal").map((g) => g.position));
      }

      for (const snapPos of vSnapsCreate) {
        const diff = snapPos - curX;
        if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffX)) {
          bestDiffX = diff;
          bestGuideX = snapPos;
        }
      }
      for (const snapPos of hSnapsCreate) {
        const diff = snapPos - curY;
        if (Math.abs(diff) < snapMargin && Math.abs(diff) < Math.abs(bestDiffY)) {
          bestDiffY = diff;
          bestGuideY = snapPos;
        }
      }

      if (bestGuideX !== null) {
        curX = bestGuideX;
        this.activeSnapLines.push({ type: "vertical", position: bestGuideX });
      }
      if (bestGuideY !== null) {
        curY = bestGuideY;
        this.activeSnapLines.push({ type: "horizontal", position: bestGuideY });
      }

      this.currentPos = { x: curX, y: curY };
    } else {
      const hitLayer = this.findTextLayerAt(x, y, context);

      if (this.isEditing && this.editingLayerId) {
        const editingLayer = context.project.layers.find((l) => l.id === this.editingLayerId);
        if (this.isCtrlPressed && editingLayer) {
          const handle = this.getHandleAtPoint(x, y, editingLayer, context.project.zoom);
          if (handle) {
            context.canvas.style.cursor = handle.cursor;
            return;
          }
        }
        context.canvas.style.cursor = hitLayer ? "text" : "move";
      } else {
        context.canvas.style.cursor = hitLayer ? "text" : "default";
      }
    }
  }

  onMouseUp(e: MouseEvent, context: ToolContext): void {
    this.lastContext = context;
    this.activeSnapLines = [];
    if (this.isSelecting) {
      this.isSelecting = false;
      context.setInteracting(false);
      return;
    }

    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      context.setInteracting(false);
      return;
    }

    if (this.isRotating) {
      this.isRotating = false;
      context.setInteracting(false);
      return;
    }

    if (this.isMoving) {
      this.isMoving = false;
      context.setInteracting(false);
      return;
    }

    if (!this.isDragging) return;
    this.isDragging = false;
    context.setInteracting(false);

    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    const dist = Math.sqrt(Math.pow(x - this.startPos.x, 2) + Math.pow(y - this.startPos.y, 2));

    if (dist < 5) {
      this.createNewTextLayer(context, "point");
    } else {
      this.createNewTextLayer(context, "area");
    }

    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
    if (layer && layer.textType === "point") {
      this.updateText("", context);
    }
  }

  onDoubleClick(e: MouseEvent, context: ToolContext): void {
    const { x, y } = context.screenToProject(e.offsetX, e.offsetY);
    const hitLayer = this.findTextLayerAt(x, y, context);

    if (hitLayer) {
      if (!this.isEditing || this.editingLayerId !== hitLayer.id) {
        this.startEditing(hitLayer, context, x, y);
      }

      const localPos = this.worldToLocal(x, y, hitLayer);
      const index = TextLayer.getCaretIndexAt(context.ctx, hitLayer, localPos.x, localPos.y);
      const text = hitLayer.text || "";

      const wordRange = getTextWordRangeAt(text, index);
      this.selectionStart = wordRange?.start ?? index;
      this.caretIndex = wordRange?.end ?? index;
      this.syncEditorStore(hitLayer);
    }
  }

  private findTextLayerAt(x: number, y: number, context: ToolContext): Layer | null {
    const layers = [...context.project.layers].reverse();
    for (const layer of layers) {
      if (
        layer.type === "text" &&
        context.isLayerVisible(layer.id) &&
        !context.isLayerLocked(layer.id)
      ) {
        const localPos = this.worldToLocal(x, y, layer);
        const padding = 10;
        if (
          localPos.x >= layer.x - padding &&
          localPos.x <= layer.x + layer.width + padding &&
          localPos.y >= layer.y - padding &&
          localPos.y <= layer.y + layer.height + padding
        ) {
          return layer;
        }
      }
    }
    return null;
  }

  private startEditing(layer: Layer, context: ToolContext, hitX?: number, hitY?: number) {
    this.fontSizeScaleSession = null;
    this.editingLayerId = layer.id;
    this.isEditing = true;
    this.originalText = layer.text || "";
    this.pendingTextStyle = {};
    this.activeSnapLines = [];
    context.updateProject({ activeLayerId: layer.id });

    // Sync tool settings with layer properties
    context.updateToolSettings("text", {
      fontSize: layer.fontSize,
      fontFamily: layer.fontFamily,
      fontWeight: layer.fontWeight,
      color: layer.color,
      textAlign: layer.textAlign,
      lineHeight: layer.lineHeight,
      tracking: layer.tracking,
      textOverflow: layer.textOverflow,
      textRendering: layer.textRendering,
    });

    if (!this.previousState) {
      this.previousState = {
        width: context.project.width,
        height: context.project.height,
        layers: JSON.parse(JSON.stringify(context.project.layers)),
        guides: JSON.parse(JSON.stringify(context.project.guides)),
        activeLayerId: context.project.activeLayerId,
        selectedLayerIds: [...context.project.selectedLayerIds],
        selection: JSON.parse(JSON.stringify(context.project.selection)),
      };
    }

    // Save initial state to history for this layer
    const newUndoStack = [
      ...(layer.textUndoStack || []),
      {
        text: layer.text || "",
        textSpans: layer.textSpans,
        textLineAlignments: layer.textLineAlignments,
        textLineHeights: layer.textLineHeights,
      },
    ];
    useProjectStore
      .getState()
      .updateLayer(context.project.id, layer.id, { textUndoStack: newUndoStack });

    if (hitX !== undefined && hitY !== undefined) {
      const localPos = this.worldToLocal(hitX, hitY, layer);
      this.caretIndex = TextLayer.getCaretIndexAt(context.ctx, layer, localPos.x, localPos.y);
    } else {
      this.caretIndex = layer.text?.length || 0;
    }
    this.selectionStart = this.caretIndex;
    this.syncEditorStore(layer);

    context.updateToolSettings("text", { isEditing: true });
    setTimeout(() => this.hiddenInput?.focus(), 50);
  }

  private createNewTextLayer(context: ToolContext, type: "point" | "area") {
    const settings = context.settings.text;
    const id = Math.random().toString(36).substring(2, 11);

    this.previousState = {
      width: context.project.width,
      height: context.project.height,
      layers: JSON.parse(JSON.stringify(context.project.layers)),
      guides: JSON.parse(JSON.stringify(context.project.guides)),
      activeLayerId: context.project.activeLayerId,
      selectedLayerIds: [...context.project.selectedLayerIds],
      selection: JSON.parse(JSON.stringify(context.project.selection)),
    };

    let x = this.startPos.x;
    let y = this.startPos.y;
    let width = 0;
    let height = settings.fontSize * 1.2;

    if (type === "area") {
      x = Math.min(this.startPos.x, this.currentPos.x);
      y = Math.min(this.startPos.y, this.currentPos.y);
      width = Math.max(10, Math.abs(this.currentPos.x - this.startPos.x));
      height = Math.max(settings.fontSize, Math.abs(this.currentPos.y - this.startPos.y));
    } else {
      if (settings.textAlign === "center") x = this.startPos.x - width / 2;
      else if (settings.textAlign === "right") x = this.startPos.x - width;
      y = this.startPos.y - settings.fontSize;
    }

    const newLayer: Partial<Layer> = {
      id,
      name: "Text Layer",
      type: "text",
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      text: "",
      textType: type,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      fontWeight: settings.fontWeight,
      color: settings.color,
      textAlign: settings.textAlign,
      lineHeight: settings.lineHeight,
      tracking: settings.tracking,
      textOverflow: settings.textOverflow,
      opacity: 100,
      visible: true,
      blendMode: "source-over",
      textRendering: settings.textRendering || "bilinear",
    };

    useProjectStore.getState().addLayer(context.project.id, newLayer, true);

    this.editingLayerId = id;
    this.isEditing = true;
    this.caretIndex = 0;
    this.selectionStart = 0;
    this.originalText = "";
    this.pendingTextStyle = {};
    this.syncEditorStore(newLayer as Layer);
    context.updateToolSettings("text", { isEditing: true });
    setTimeout(() => this.hiddenInput?.focus(), 50);
  }

  onKeyDown(e: KeyboardEvent, context: ToolContext): boolean {
    this.lastContext = context;
    if (!this.isEditing || !this.editingLayerId) return false;

    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.id !== "forge-text-input" &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return false;
    }

    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
    if (!layer) return false;

    const text = layer.text || "";
    const hasSelection = this.caretIndex !== this.selectionStart;

    // Helper to consume event
    const consume = () => {
      e.preventDefault();
      e.stopPropagation();
      return true;
    };

    if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey) {
        this.commit(context);
        return consume();
      }
      this.insertText("\n", context);
      this.syncEditorStore(layer);
      return consume();
    } else if (e.key === "Backspace") {
      if (hasSelection) {
        this.deleteSelection(context);
      } else if (this.caretIndex > 0) {
        const newText = text.substring(0, this.caretIndex - 1) + text.substring(this.caretIndex);
        const oldCaret = this.caretIndex;
        this.caretIndex--;
        this.selectionStart = this.caretIndex;
        this.updateText(
          newText,
          context,
          replaceTextWithSpans(text, layer.textSpans, newText, oldCaret - 1, oldCaret),
          updateTextLineAlignments(
            text,
            newText,
            layer.textLineAlignments,
            oldCaret - 1,
            oldCaret,
          ) || null,
          updateTextLineHeights(text, newText, layer.textLineHeights, oldCaret - 1, oldCaret) ||
            null,
        );
      }
      return consume();
    } else if (e.key === "Delete") {
      if (hasSelection) {
        this.deleteSelection(context);
      } else if (this.caretIndex < text.length) {
        const newText = text.substring(0, this.caretIndex) + text.substring(this.caretIndex + 1);
        this.updateText(
          newText,
          context,
          replaceTextWithSpans(
            text,
            layer.textSpans,
            newText,
            this.caretIndex,
            this.caretIndex + 1,
          ),
          updateTextLineAlignments(
            text,
            newText,
            layer.textLineAlignments,
            this.caretIndex,
            this.caretIndex + 1,
          ) || null,
          updateTextLineHeights(
            text,
            newText,
            layer.textLineHeights,
            this.caretIndex,
            this.caretIndex + 1,
          ) || null,
        );
      }
      return consume();
    } else if (e.key === "ArrowLeft") {
      if (e.ctrlKey || e.altKey) {
        // Jump word
        let i = this.caretIndex;
        while (i > 0 && !/\w/.test(text[i - 1])) i--;
        while (i > 0 && /\w/.test(text[i - 1])) i--;
        this.caretIndex = i;
      } else {
        this.caretIndex = Math.max(0, this.caretIndex - 1);
      }

      if (!e.shiftKey) {
        this.selectionStart = this.caretIndex;
      }
      this.syncEditorStore(layer);
      return consume();
    } else if (e.key === "ArrowRight") {
      if (e.ctrlKey || e.altKey) {
        // Jump word
        let i = this.caretIndex;
        while (i < text.length && /\w/.test(text[i])) i++;
        while (i < text.length && !/\w/.test(text[i])) i++;
        this.caretIndex = i;
      } else {
        this.caretIndex = Math.min(text.length, this.caretIndex + 1);
      }

      if (!e.shiftKey) {
        this.selectionStart = this.caretIndex;
      }
      this.syncEditorStore(layer);
      return consume();
    } else if (e.key === "Escape") {
      this.cancel(context);
      return consume();
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      if (e.shiftKey) {
        useProjectStore.getState().redoText(context.project.id, this.editingLayerId);
      } else {
        useProjectStore.getState().undoText(context.project.id, this.editingLayerId);
      }
      const updatedLayer = context.project.layers.find((item) => item.id === this.editingLayerId);
      this.syncEditorStore(updatedLayer);
      return consume();
    } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
      this.selectionStart = 0;
      this.caretIndex = text.length;
      this.syncEditorStore(layer);
      return consume();
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      this.copySelectedText(layer);
      return consume();
    } else if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
      this.copySelectedText(layer);
      this.deleteSelection(context);
      return consume();
    } else if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      this.pasteTextFromClipboard(context);
      return consume();
    }

    // Allow OS shortcuts (like Emoji Panel Cmd+Ctrl+Space) to pass through
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return false;
    }

    // Return false for any printable characters or dead keys so they can reach the hidden input natively
    if (e.key.length === 1 || e.key === "Dead") {
      return false;
    }

    return false;
  }

  private async copySelectedText(layer: Layer) {
    if (this.caretIndex === this.selectionStart) return;
    const start = Math.min(this.caretIndex, this.selectionStart);
    const end = Math.max(this.caretIndex, this.selectionStart);
    const text = (layer.text || "").substring(start, end);
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  }

  private async pasteTextFromClipboard(context: ToolContext) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        this.insertText(text, context);
      }
    } catch (err) {
      console.error("Failed to paste text:", err);
    }
  }

  private deleteSelection(context: ToolContext) {
    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
    if (!layer) return;
    const text = layer.text || "";
    const start = Math.min(this.caretIndex, this.selectionStart);
    const end = Math.max(this.caretIndex, this.selectionStart);
    const newText = text.substring(0, start) + text.substring(end);
    this.caretIndex = start;
    this.selectionStart = start;
    const textSpans = replaceTextWithSpans(text, layer.textSpans, newText, start, end);
    this.updateText(
      newText,
      context,
      textSpans,
      updateTextLineAlignments(text, newText, layer.textLineAlignments, start, end) || null,
      updateTextLineHeights(text, newText, layer.textLineHeights, start, end) || null,
    );
    this.syncEditorStore({ ...layer, text: newText, textSpans });
  }

  private insertText(char: string, context: ToolContext) {
    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
    if (!layer) return;

    // Normalize text to NFC to ensure accented characters are single characters (not decomposed)
    const normalizedChar = char.normalize("NFC");

    const start = Math.min(this.caretIndex, this.selectionStart);
    const end = Math.max(this.caretIndex, this.selectionStart);
    const text = (layer.text || "").normalize("NFC");

    const newText = text.substring(0, start) + normalizedChar + text.substring(end);
    this.caretIndex = start + normalizedChar.length;
    this.selectionStart = this.caretIndex;
    const textSpans = replaceTextWithSpans(text, layer.textSpans, newText, start, end, {
      ...getTextSpanStyleAtCaret(text, layer.textSpans, start),
      ...this.pendingTextStyle,
    });
    this.updateText(
      newText,
      context,
      textSpans,
      updateTextLineAlignments(text, newText, layer.textLineAlignments, start, end) || null,
      updateTextLineHeights(text, newText, layer.textLineHeights, start, end) || null,
    );
    this.syncEditorStore({ ...layer, text: newText, textSpans });
  }

  private updateText(
    text: string,
    context: ToolContext,
    textSpans?: Layer["textSpans"],
    textLineAlignments?: Record<number, TextAlignment> | null,
    textLineHeights?: Record<number, number> | null,
    layerUpdates: Partial<Layer> = {},
  ) {
    if (!this.editingLayerId) return;
    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
    if (!layer) return;

    // Push previous text to undo stack before updating
    const newUndoStack = [
      ...(layer.textUndoStack || []),
      {
        text: layer.text || "",
        textSpans: layer.textSpans,
        textLineAlignments: layer.textLineAlignments,
        textLineHeights: layer.textLineHeights,
      },
    ];

    const baseUpdates: Partial<Layer> = {
      text,
      textSpans: textSpans?.length ? textSpans : undefined,
      textLineAlignments:
        textLineAlignments === undefined
          ? layer.textLineAlignments
          : textLineAlignments || undefined,
      textLineHeights:
        textLineHeights === undefined ? layer.textLineHeights : textLineHeights || undefined,
      textUndoStack: newUndoStack,
      textRedoStack: [],
      ...layerUpdates,
    };
    let dimensionUpdates = {};

    if (layer.textType === "point") {
      const metrics = TextLayer.calculateMetrics(context.ctx, layer, baseUpdates);
      dimensionUpdates = {
        width: metrics.width,
        height: metrics.height,
        x: metrics.x ?? layer.x,
        y: metrics.y ?? layer.y,
      };
    }

    const updates = { ...baseUpdates, ...dimensionUpdates };
    useProjectStore.getState().updateLayer(context.project.id, this.editingLayerId, {
      ...updates,
      width: (updates as any).width ?? layer.width,
      height: (updates as any).height ?? layer.height,
    });
    context.invalidateCache(this.editingLayerId);
    this.syncEditorStore({ ...layer, ...updates });
  }

  private commit(context: ToolContext) {
    if (!this.editingLayerId) return;
    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);

    // If text is empty and there was nothing originally, remove silently
    if (layer && !layer.text && this.originalText === "") {
      useProjectStore.getState().removeLayer(context.project.id, this.editingLayerId, true);
    } else if (this.previousState && layer) {
      const prevLayer = this.previousState.layers.find((l: Layer) => l.id === this.editingLayerId);

      // Generate automatic name from content
      let newName = layer.name;
      if (layer.text) {
        // Sanitize: remove newlines, trim, and truncate
        const sanitized = layer.text.replace(/\r?\n|\r/g, " ").trim();
        if (sanitized.length > 0) {
          const truncated = sanitized.substring(0, 20);
          newName = truncated.length < sanitized.length ? `${truncated}...` : truncated;
        } else {
          newName = "Empty Text";
        }
      }

      // We only auto-rename if the layer was never renamed by the user
      // or if it still has the default "Text Layer" name.
      const shouldRename =
        layer.name === "Text Layer" ||
        layer.name === "Empty Text" ||
        (this.originalText !== "" && layer.name.startsWith(this.originalText.substring(0, 10)));

      if (shouldRename && newName !== layer.name) {
        useProjectStore
          .getState()
          .updateLayer(context.project.id, layer.id, { name: newName }, true);
      }

      // Push history ONLY if there is an actual modification (text, position, color, etc)
      // Note: We check against the project state AFTER potentially updating the name
      const currentLayer = context.project.layers.find((l) => l.id === this.editingLayerId);
      if (!prevLayer || JSON.stringify(currentLayer) !== JSON.stringify(prevLayer)) {
        useProjectStore.getState().addHistoryEntry(context.project.id, {
          description: "Text Tool",
          state: this.previousState,
        });
      }
    }

    this.isEditing = false;
    this.previousState = null; // Clear state after commit
    this.editingLayerId = null;
    this.pendingTextStyle = {};
    useTextEditorStore.getState().reset();
    if (this.hiddenInput) {
      this.hiddenInput.value = "";
      this.hiddenInput.blur();
    }
    context.setInteracting(false);
    context.updateToolSettings("text", { isEditing: false });
  }

  private cancel(context: ToolContext) {
    if (!this.editingLayerId) return;
    const layer = context.project.layers.find((l) => l.id === this.editingLayerId);

    // If layer was created and cancelled without typing, remove silently.
    if (this.originalText === "" && (!layer || !layer.text)) {
      useProjectStore.getState().removeLayer(context.project.id, this.editingLayerId, true);
    } else if (this.previousState) {
      // If an existing layer was being edited, restore the exact properties it had before
      const prevLayer = this.previousState.layers.find((l: Layer) => l.id === this.editingLayerId);
      if (prevLayer) {
        useProjectStore.getState().updateLayer(context.project.id, this.editingLayerId, prevLayer);
      }
    }

    this.isEditing = false;
    this.previousState = null; // Clear state after cancellation
    this.editingLayerId = null;
    this.pendingTextStyle = {};
    useTextEditorStore.getState().reset();
    if (this.hiddenInput) {
      this.hiddenInput.value = "";
      this.hiddenInput.blur();
    }
    context.setInteracting(false);
    context.updateToolSettings("text", { isEditing: false });
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (this.isDragging) {
      ctx.save();
      ctx.strokeStyle = "#0078ff";
      ctx.lineWidth = 1 / context.project.zoom;
      ctx.setLineDash([4 / context.project.zoom, 2 / context.project.zoom]);

      const x = Math.min(this.startPos.x, this.currentPos.x);
      const y = Math.min(this.startPos.y, this.currentPos.y);
      const w = Math.max(1, Math.abs(this.currentPos.x - this.startPos.x));
      const h = Math.max(1, Math.abs(this.currentPos.y - this.startPos.y));

      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // Auto-commit if active layer changed externally
    if (
      this.isEditing &&
      this.editingLayerId &&
      context.project.activeLayerId !== this.editingLayerId
    ) {
      this.commit(context);
    }

    // Render active layer border and handles
    if (this.isEditing && this.editingLayerId) {
      const layer = context.project.layers.find((l) => l.id === this.editingLayerId);
      if (!layer) return;

      this.syncEditorStore(layer);

      const scale = context.project.zoom;

      // Render Text UI (Caret, Selection, Underline, Pivot)
      TextLayer.renderUI(ctx, layer as any, this.getEditingState() as any, scale);

      if (this.isCtrlPressed) {
        // Render Transform-like handles
        const handles = this.getTransformHandles(layer, scale);
        ctx.save();
        ctx.strokeStyle = "#0078ff";
        ctx.lineWidth = 1 / scale;

        // Draw connections (rotated)
        const cornerNames = ["top-left", "top-right", "bottom-right", "bottom-left"];
        const corners = cornerNames
          .map((name) => handles.find((h) => h.name === name))
          .filter((h): h is any => !!h);

        if (corners.length === 4) {
          ctx.beginPath();
          ctx.moveTo(corners[0].x, corners[0].y);
          ctx.lineTo(corners[1].x, corners[1].y);
          ctx.lineTo(corners[2].x, corners[2].y);
          ctx.lineTo(corners[3].x, corners[3].y);
          ctx.closePath();
          ctx.stroke();
        }

        // Draw rotation line
        const rotateHandle = handles.find((h) => h.name === "rotate");
        const topMiddle = handles.find((h) => h.name === "top-middle");
        if (rotateHandle && topMiddle) {
          ctx.beginPath();
          ctx.moveTo(topMiddle.x, topMiddle.y);
          ctx.lineTo(rotateHandle.x, rotateHandle.y);
          ctx.stroke();
        }

        const handleSize = 8 / scale;
        handles.forEach((h) => {
          ctx.fillStyle = "white";
          ctx.strokeStyle = "#0078ff";
          ctx.lineWidth = 1 / scale;
          if (h.name === "rotate") {
            ctx.beginPath();
            ctx.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          }
        });
        ctx.restore();
      } else if (layer.textType !== "point") {
        // Show boundary for area text
        ctx.save();
        ctx.strokeStyle = "#0078ff";
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([4 / scale, 2 / scale]);

        if (layer.rotation) {
          const midX = layer.x + layer.width / 2;
          const midY = layer.y + layer.height / 2;
          ctx.translate(midX, midY);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
        } else {
          ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
        }
        ctx.restore();
      }
    }

    if (this.activeSnapLines.length > 0) {
      ctx.save();
      context.setViewportTransform(
        context.project.zoom,
        context.project.panX,
        context.project.panY,
      );
      ctx.strokeStyle = "red";
      ctx.lineWidth = 1 / context.project.zoom;

      const viewportWidth = context.viewportWidth / context.project.zoom;
      const viewportHeight = context.viewportHeight / context.project.zoom;
      const startX = -context.project.panX / context.project.zoom;
      const startY = -context.project.panY / context.project.zoom;

      for (const line of this.activeSnapLines) {
        ctx.beginPath();
        if (line.type === "horizontal") {
          ctx.moveTo(startX, line.position);
          ctx.lineTo(startX + viewportWidth, line.position);
        } else {
          ctx.moveTo(line.position, startY);
          ctx.lineTo(line.position, startY + viewportHeight);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
