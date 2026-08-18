/**
 * Purpose: Reactive bridge between the canvas TextTool and rich-text controls in the renderer.
 */
import { create } from "zustand";
import type { TextSpanStyle } from "@core/utils/textSpans";
import type { TextAlignment } from "@store/projectStore";

export interface TextEditorState {
  isEditing: boolean;
  layerId: string | null;
  caretIndex: number;
  selectionStart: number;
  formatStart: number;
  formatEnd: number;
  anchor: { x: number; y: number } | null;
  isCtrlPressed: boolean;
  style: TextSpanStyle;
  mixedStyles: Partial<Record<keyof TextSpanStyle, boolean>>;
  lineAlignment: TextAlignment;
  lineHeight: number;
  mixedLineHeight: boolean;
  setState: (state: Partial<Omit<TextEditorState, "setState" | "reset">>) => void;
  reset: () => void;
}

export interface TextFormatCommand {
  type: "setStyle" | "scaleFontSize" | "setLineAlignment" | "setLineHeight";
  style?: TextSpanStyle;
  from?: number;
  to?: number;
  scope?: "formatRange" | "all";
  gestureId?: number;
  alignment?: TextAlignment;
  lineHeight?: number;
}

const initialState = {
  isEditing: false,
  layerId: null,
  caretIndex: 0,
  selectionStart: 0,
  formatStart: 0,
  formatEnd: 0,
  anchor: null,
  isCtrlPressed: false,
  style: {},
  mixedStyles: {},
  lineAlignment: "left" as TextAlignment,
  lineHeight: 1.2,
  mixedLineHeight: false,
};

function sameRecord(a: object, b: object) {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function sameAnchor(a: { x: number; y: number } | null, b: { x: number; y: number } | null) {
  return a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
}

export const useTextEditorStore = create<TextEditorState>((set) => ({
  ...initialState,
  setState: (state) =>
    set((current) => {
      const nextStyle = state.style || current.style;
      const nextMixedStyles = state.mixedStyles || current.mixedStyles;
      const nextLineAlignment = state.lineAlignment || current.lineAlignment;
      const nextLineHeight = state.lineHeight ?? current.lineHeight;
      const nextMixedLineHeight = state.mixedLineHeight ?? current.mixedLineHeight;
      const nextAnchor = state.anchor === undefined ? current.anchor : state.anchor;
      const unchanged =
        (state.isEditing === undefined || state.isEditing === current.isEditing) &&
        (state.layerId === undefined || state.layerId === current.layerId) &&
        (state.caretIndex === undefined || state.caretIndex === current.caretIndex) &&
        (state.selectionStart === undefined || state.selectionStart === current.selectionStart) &&
        (state.formatStart === undefined || state.formatStart === current.formatStart) &&
        (state.formatEnd === undefined || state.formatEnd === current.formatEnd) &&
        (state.isCtrlPressed === undefined || state.isCtrlPressed === current.isCtrlPressed) &&
        sameAnchor(nextAnchor, current.anchor) &&
        sameRecord(nextStyle, current.style) &&
        sameRecord(nextMixedStyles, current.mixedStyles) &&
        nextLineAlignment === current.lineAlignment &&
        nextLineHeight === current.lineHeight &&
        nextMixedLineHeight === current.mixedLineHeight;
      return unchanged
        ? current
        : {
            ...current,
            ...state,
            style: nextStyle,
            mixedStyles: nextMixedStyles,
            lineAlignment: nextLineAlignment,
            lineHeight: nextLineHeight,
            mixedLineHeight: nextMixedLineHeight,
            anchor: nextAnchor,
          };
    }),
  reset: () => set(initialState),
}));
