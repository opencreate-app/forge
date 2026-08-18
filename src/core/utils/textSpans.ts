/**
 * Purpose: Pure helpers for editing, normalizing, and querying rich text spans.
 */
import type { TextSpan } from "@/renderer/store/projectStore";

export type TextSpanStyle = Omit<TextSpan, "text">;
export type TextAlignment = "left" | "center" | "right" | "justify";

const STYLE_KEYS: (keyof TextSpanStyle)[] = [
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

export function sameTextSpanStyle(a: TextSpanStyle | undefined, b: TextSpanStyle | undefined) {
  return STYLE_KEYS.every((key) => a?.[key] === b?.[key]);
}

export function normalizeTextSpans(text: string, spans: TextSpan[] | undefined): TextSpan[] {
  if (!text || !spans?.length) return [];

  const normalized: TextSpan[] = [];
  let position = 0;
  for (const span of spans) {
    if (position >= text.length) break;
    const spanText = span.text.slice(0, text.length - position);
    if (!spanText) continue;
    const { text: _text, ...style } = span;
    const previous = normalized[normalized.length - 1];
    if (previous && sameTextSpanStyle(previous, style)) {
      previous.text += spanText;
    } else {
      normalized.push({ text: spanText, ...style });
    }
    position += spanText.length;
  }
  return normalized;
}

function sourceTextSpans(text: string, spans: TextSpan[] | undefined): TextSpan[] {
  const normalized = normalizeTextSpans(text, spans);
  if (!text) return normalized;
  const coveredLength = normalized.reduce((length, span) => length + span.text.length, 0);
  if (coveredLength < text.length) normalized.push({ text: text.slice(coveredLength) });
  return normalized.length ? normalized : [{ text }];
}

export function getTextLineIndex(text: string, index: number): number {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  return text.slice(0, safeIndex).split("\n").length - 1;
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

export function getTextWordRangeAt(
  text: string,
  index: number,
): { start: number; end: number } | undefined {
  if (!text) return undefined;

  const safeIndex = Math.max(0, Math.min(index, text.length));
  const characterIndex =
    safeIndex < text.length && WORD_CHARACTER.test(text[safeIndex])
      ? safeIndex
      : safeIndex > 0 && WORD_CHARACTER.test(text[safeIndex - 1])
        ? safeIndex - 1
        : -1;
  if (characterIndex < 0) return undefined;

  let start = characterIndex;
  while (start > 0 && WORD_CHARACTER.test(text[start - 1])) start--;

  let end = characterIndex + 1;
  while (end < text.length && WORD_CHARACTER.test(text[end])) end++;

  return { start, end };
}

export function scaleTextSpanFontSizes(
  text: string,
  spans: TextSpan[] | undefined,
  start: number,
  end: number,
  ratio: number,
  baseFontSize: number = 24,
): TextSpan[] {
  if (!Number.isFinite(ratio) || ratio <= 0) return normalizeTextSpans(text, spans);
  const safeStart = Math.max(0, Math.min(start, end, text.length));
  const safeEnd = Math.max(safeStart, Math.min(Math.max(start, end), text.length));
  if (safeStart === safeEnd) return normalizeTextSpans(text, spans);

  const result: TextSpan[] = [];
  let position = 0;
  const append = (spanText: string, style: TextSpanStyle) => {
    if (!spanText) return;
    const previous = result[result.length - 1];
    if (previous && sameTextSpanStyle(previous, style)) previous.text += spanText;
    else result.push({ text: spanText, ...style });
  };

  for (const span of sourceTextSpans(text, spans)) {
    const spanStart = position;
    const spanEnd = position + span.text.length;
    const { text: _text, ...baseStyle } = span;
    const selected = safeStart < spanEnd && safeEnd > spanStart;
    const selectedStart = Math.max(0, safeStart - spanStart);
    const selectedEnd = Math.min(span.text.length, safeEnd - spanStart);

    append(span.text.slice(0, selected ? selectedStart : span.text.length), baseStyle);
    if (selected) {
      append(span.text.slice(selectedStart, selectedEnd), {
        ...baseStyle,
        fontSize: Math.max(1, Math.round((baseStyle.fontSize ?? baseFontSize) * ratio * 100) / 100),
      });
      append(span.text.slice(selectedEnd), baseStyle);
    }
    position = spanEnd;
  }
  return normalizeTextSpans(text, result);
}

export function updateTextLineAlignments(
  oldText: string,
  newText: string,
  alignments: Record<number, TextAlignment> | undefined,
  start: number,
  end: number,
): Record<number, TextAlignment> | undefined {
  if (!alignments || Object.keys(alignments).length === 0) return alignments;
  const startLine = getTextLineIndex(oldText, start);
  const endLine = getTextLineIndex(oldText, end);
  const insertedLength = newText.length - (oldText.length - (end - start));
  const insertedText = newText.slice(start, start + Math.max(0, insertedLength));
  const insertedLineCount = insertedText.split("\n").length - 1;
  const removedLineCount = endLine - startLine;
  const lineDelta = insertedLineCount - removedLineCount;
  const next: Record<number, TextAlignment> = {};

  for (const [lineKey, alignment] of Object.entries(alignments)) {
    const line = Number(lineKey);
    if (line < startLine) next[line] = alignment;
    else if (line > endLine) next[line + lineDelta] = alignment;
    else if (line === startLine) next[startLine] = alignment;
  }

  return Object.keys(next).length ? next : undefined;
}

export function updateTextLineHeights(
  oldText: string,
  newText: string,
  lineHeights: Record<number, number> | undefined,
  start: number,
  end: number,
): Record<number, number> | undefined {
  if (!lineHeights || Object.keys(lineHeights).length === 0) return lineHeights;
  const startLine = getTextLineIndex(oldText, start);
  const endLine = getTextLineIndex(oldText, end);
  const insertedLength = newText.length - (oldText.length - (end - start));
  const insertedText = newText.slice(start, start + Math.max(0, insertedLength));
  const insertedLineCount = insertedText.split("\n").length - 1;
  const removedLineCount = endLine - startLine;
  const lineDelta = insertedLineCount - removedLineCount;
  const next: Record<number, number> = {};

  for (const [lineKey, lineHeight] of Object.entries(lineHeights)) {
    const line = Number(lineKey);
    if (line < startLine) next[line] = lineHeight;
    else if (line > endLine) next[line + lineDelta] = lineHeight;
    else if (line === startLine) next[startLine] = lineHeight;
  }

  return Object.keys(next).length ? next : undefined;
}

export function getTextSpanStyleAt(spans: TextSpan[] | undefined, index: number): TextSpanStyle {
  let position = 0;
  for (const span of spans || []) {
    if (index >= position && index < position + span.text.length) {
      const { text: _text, ...style } = span;
      return style;
    }
    position += span.text.length;
  }
  return {};
}

export function getTextSpanStyleAtCaret(
  text: string,
  spans: TextSpan[] | undefined,
  caretIndex: number,
): TextSpanStyle {
  if (caretIndex > 0) return getTextSpanStyleAt(spans, caretIndex - 1);
  if (text.length > 0) return getTextSpanStyleAt(spans, 0);
  return {};
}

export function applyTextSpanStyle(
  text: string,
  spans: TextSpan[] | undefined,
  start: number,
  end: number,
  style: TextSpanStyle,
): TextSpan[] {
  const safeStart = Math.max(0, Math.min(start, end, text.length));
  const safeEnd = Math.max(safeStart, Math.min(Math.max(start, end), text.length));
  if (safeStart === safeEnd) return normalizeTextSpans(text, spans);

  const source = sourceTextSpans(text, spans);
  const result: TextSpan[] = [];
  let position = 0;

  const append = (spanText: string, spanStyle: TextSpanStyle) => {
    if (!spanText) return;
    const previous = result[result.length - 1];
    if (previous && sameTextSpanStyle(previous, spanStyle)) previous.text += spanText;
    else result.push({ text: spanText, ...spanStyle });
  };

  for (const span of source) {
    const spanStart = position;
    const spanEnd = position + span.text.length;
    const { text: _text, ...baseStyle } = span;

    if (safeStart > spanStart) {
      append(span.text.slice(0, Math.min(span.text.length, safeStart - spanStart)), baseStyle);
    }
    if (safeStart < spanEnd && safeEnd > spanStart) {
      append(
        span.text.slice(
          Math.max(0, safeStart - spanStart),
          Math.min(span.text.length, safeEnd - spanStart),
        ),
        { ...baseStyle, ...style },
      );
    }
    if (safeEnd < spanEnd) {
      append(span.text.slice(Math.max(0, safeEnd - spanStart)), baseStyle);
    }
    position = spanEnd;
  }

  return normalizeTextSpans(text, result);
}

export function replaceTextWithSpans(
  oldText: string,
  oldSpans: TextSpan[] | undefined,
  newText: string,
  replaceStart: number,
  replaceEnd: number,
  insertedStyle?: TextSpanStyle,
): TextSpan[] {
  const start = Math.max(0, Math.min(replaceStart, replaceEnd, oldText.length));
  const end = Math.max(start, Math.min(Math.max(replaceStart, replaceEnd), oldText.length));
  const source = sourceTextSpans(oldText, oldSpans);
  const result: TextSpan[] = [];
  const appendRange = (rangeStart: number, rangeEnd: number) => {
    if (rangeStart >= rangeEnd) return;
    let position = 0;
    for (const span of source) {
      const spanStart = position;
      const spanEnd = position + span.text.length;
      const from = Math.max(rangeStart, spanStart);
      const to = Math.min(rangeEnd, spanEnd);
      if (from < to) {
        const { text: _text, ...style } = span;
        result.push({ text: span.text.slice(from - spanStart, to - spanStart), ...style });
      }
      position = spanEnd;
      if (position >= rangeEnd) break;
    }
  };

  appendRange(0, start);
  const insertionStyle = insertedStyle || getTextSpanStyleAtCaret(oldText, oldSpans, start);
  const insertedLength = newText.length - (oldText.length - (end - start));
  if (insertedLength > 0) {
    const insertedStart = start;
    result.push({
      text: newText.slice(insertedStart, insertedStart + insertedLength),
      ...insertionStyle,
    });
  }
  appendRange(end, oldText.length);
  return normalizeTextSpans(newText, result);
}
