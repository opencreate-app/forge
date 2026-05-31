/**
 * Purpose: Specialized rendering engine for text layers, supporting rich text styling, layout (point/area), caret management, and pixel-aligned rendering.
 */
import { Layer } from "@/renderer/store/projectStore";

/**
 * Specialized rendering engine for text layers.
 * Supports rich text styling, layout (point vs area), caret management, and pixel-aligned rendering.
 */
export class TextLayer {
  /**
   * Renders the text content of a layer to the destination context.
   * Utilizes a canvas cache to improve performance of static text.
   * @param ctx The destination rendering context.
   * @param layer The text layer data.
   * @param cache Map of cached canvases.
   * @param readyCache Map of readiness flags.
   * @param editingState Current editing state if the layer is active in the Text Tool.
   */
  public static render(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    cache: Map<string, HTMLCanvasElement>,
    readyCache: Map<string, boolean>,
    editingState?: {
      caretIndex: number;
      selectionStart?: number;
      isFocused: boolean;
      isCtrlPressed?: boolean;
    },
  ) {
    if (!layer.text && !editingState?.isFocused) return;

    // 1. Text Rendering (Always pixel-based, tied to project resolution)
    const textRendering = layer.textRendering || "bilinear";
    const textOverflow = layer.textOverflow !== false; // Default to true if undefined

    // OPTIMIZATION: If text is rotated or being edited, we render vectors directly
    // to the context to avoid "double anti-aliasing" blur caused by rotating a bitmap.
    // Exception: 'nearest' rendering still needs the thresholding cache.
    const isRotated = !!layer.rotation;
    const isEditing = !!editingState?.isFocused;

    if ((isRotated || isEditing) && textRendering !== "nearest") {
      ctx.save();
      if (!textOverflow) {
        ctx.beginPath();
        ctx.rect(layer.x, layer.y, layer.width, layer.height);
        ctx.clip();
      }
      this.drawTextToContext(ctx, layer);
      ctx.restore();
      return;
    }

    const spansKey = JSON.stringify(layer.textSpans || []);
    const strokeKey = layer.styles?.stroke?.enabled
      ? `${layer.styles.stroke.size}|${layer.styles.stroke.position}|${layer.styles.stroke.color}|${layer.styles.stroke.opacity}`
      : "none";
    const propsKey = `${layer.text}|${spansKey}|${layer.fontSize}|${layer.fontFamily}|${layer.fontWeight}|${layer.color}|${layer.textAlign}|${layer.tracking}|${layer.lineHeight}|${layer.width}|${layer.height}|${textRendering}|${textOverflow}|${strokeKey}`;

    let cachedCanvas = cache.get(layer.id);
    const isReady = readyCache.get(layer.id);
    const cachedKey = (cachedCanvas as any)?._propsKey;

    const metrics = this.calculateMetrics(ctx, layer);

    // Width: For area text, it's constrained by layer.width, but point text can overflow.
    // If textOverflow is true, we allow the canvas to grow to fit the content.
    const strokePadding = layer.styles?.stroke?.enabled ? layer.styles.stroke.size * 2 : 0;
    const targetWidth = (textOverflow ? Math.max(layer.width, metrics.width) : Math.max(1, layer.width)) + strokePadding * 2;

    // Height: Allow expansion if textOverflow is true.
    // We add a safety margin for character descents (like 'g', 'j', 'p', 'y').
    const safetyMargin = (layer.fontSize || 24) * 0.5;
    const targetHeight = (textOverflow ? Math.max(layer.height, metrics.height + safetyMargin) : Math.max(1, layer.height)) + strokePadding * 2;

    // Calculate horizontal offset for center/right aligned text that overflows the left boundary
    let offsetX = strokePadding;
    if (textOverflow) {
      if (layer.textAlign === "center") {
        offsetX += Math.max(0, (metrics.width - layer.width) / 2);
      } else if (layer.textAlign === "right") {
        offsetX += Math.max(0, metrics.width - layer.width);
      }
    }

    if (
      !cachedCanvas ||
      !isReady ||
      cachedKey !== propsKey ||
      cachedCanvas.width !== Math.ceil(targetWidth) ||
      cachedCanvas.height !== Math.ceil(targetHeight)
    ) {
      cachedCanvas = document.createElement("canvas");
      cachedCanvas.width = Math.ceil(targetWidth);
      cachedCanvas.height = Math.ceil(targetHeight);
      (cachedCanvas as any)._propsKey = propsKey;
      const cctx = cachedCanvas.getContext("2d")!;

      // Render text at 1:1 scale into the cache
      // Apply offset if text overflows to the left or has stroke
      this.drawTextToContext(cctx, { ...layer, x: offsetX, y: strokePadding });

      if (textRendering === "nearest") {
        this.applyAlphaThreshold(cctx, cachedCanvas.width, cachedCanvas.height);
      }

      cache.set(layer.id, cachedCanvas);
      readyCache.set(layer.id, true);
    }

    ctx.save();
    if (textRendering === "nearest") {
      ctx.imageSmoothingEnabled = false;
    }
    // Draw the cached text, compensating for the horizontal offset and padding
    ctx.drawImage(cachedCanvas, layer.x - offsetX, layer.y - strokePadding);
    ctx.restore();
  }

  /**
   * Renders the editing UI for a text layer, including carets, selection highlights, and underscores.
   * @param ctx The destination rendering context.
   * @param layer The text layer data.
   * @param editingState Current editing state.
   * @param zoom The current viewport zoom level.
   */
  public static renderUI(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    editingState: {
      caretIndex: number;
      selectionStart?: number;
      isFocused: boolean;
      isCtrlPressed?: boolean;
    },
    zoom: number,
  ) {
    if (!editingState.isFocused) return;

    const text = layer.text || "";
    const fontSize = layer.fontSize || 24;
    const fontFamily = layer.fontFamily || "Arial";
    const fontWeight = layer.fontWeight || "normal";
    const textAlign = layer.textAlign || "left";
    const lineHeightMult = layer.lineHeight || 1.2;
    const tracking = layer.tracking || 0;
    const lineHeight = fontSize * lineHeightMult;

    ctx.save();

    // Apply layer transformation for UI
    if (layer.rotation) {
      const midX = layer.x + layer.width / 2;
      const midY = layer.y + layer.height / 2;
      ctx.translate(midX, midY);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-midX, -midY);
    }

    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
    ctx.textAlign = textAlign === "justify" ? "left" : textAlign;
    ctx.textBaseline = "alphabetic";

    const lines = this.layoutText(ctx, layer, text, fontSize, tracking);

    // Keep first line fixed to pivot (baseline at layer.y + fontSize)
    let currentY = layer.y + fontSize;

    lines.forEach((line, lineIndex) => {
      let currentX = layer.x;
      if (textAlign === "center") {
        currentX = layer.x + layer.width / 2;
      } else if (textAlign === "right") {
        currentX = layer.x + layer.width;
      }

      // Render Underlines (Visual Aid)
      this.renderUnderline(ctx, line, currentX, currentY, textAlign, tracking, zoom, layer);

      // Render Caret if editing this line
      if (
        editingState.caretIndex !== undefined &&
        editingState.selectionStart === editingState.caretIndex
      ) {
        this.renderCaret(
          ctx,
          line,
          lineIndex,
          lines,
          editingState.caretIndex,
          currentX,
          currentY,
          fontSize,
          lineHeight,
          textAlign,
          tracking,
          zoom,
          layer,
        );
      }

      currentY += lineHeight;
    });

    // Handle selection rendering
    if (
      editingState.selectionStart !== undefined &&
      editingState.selectionStart !== editingState.caretIndex
    ) {
      this.renderSelection(
        ctx,
        lines,
        editingState.selectionStart,
        editingState.caretIndex,
        layer.x,
        layer.y,
        layer.width,
        fontSize,
        lineHeight,
        textAlign,
        tracking,
        layer,
      );
    }

    // Render pivot point during editing
    if (!editingState.isCtrlPressed) {
      this.renderPivot(ctx, layer);
    }

    ctx.restore();
  }

  private static renderUnderline(
    ctx: CanvasRenderingContext2D,
    lineText: string,
    lineX: number,
    lineY: number,
    textAlign: string,
    tracking: number,
    zoom: number,
    layer: Layer,
  ) {
    if (!lineText && layer.textType === "area") return;

    // For empty point text, draw a small underline representing the start
    const textToMeasure = lineText || " ";
    const lineWidth = this.measureTextWithTracking(ctx, textToMeasure, tracking, layer);

    let startX = lineX;
    if (textAlign === "center") {
      startX = lineX - lineWidth / 2;
    } else if (textAlign === "right") {
      startX = lineX - lineWidth;
    }

    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.moveTo(startX, lineY);
    ctx.lineTo(startX + lineWidth, lineY);
    ctx.stroke();
    ctx.restore();
  }

  private static applyAlphaThreshold(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      // If alpha > 127 (50%), make it fully opaque, otherwise transparent
      data[i] = data[i] > 127 ? 255 : 0;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Calculates the bounding box metrics for a text layer based on its content and styling.
   * @param ctx Context used for measuring text.
   * @param layer The base layer data.
   * @param newProps Optional new properties to simulate the metrics with.
   * @returns The calculated width and height, and optionally a new X position for point text alignment.
   */
  public static calculateMetrics(
    ctx: CanvasRenderingContext2D,
    layer: Partial<Layer>,
    newProps?: Partial<Layer>,
  ): { width: number; height: number; x?: number } {
    const fontSize = newProps?.fontSize ?? layer.fontSize ?? 24;
    const tracking = newProps?.tracking ?? layer.tracking ?? 0;
    const textAlign = newProps?.textAlign ?? layer.textAlign ?? "left";
    const text = newProps?.text ?? layer.text ?? "";
    const lineHeightMult = newProps?.lineHeight ?? layer.lineHeight ?? 1.2;
    const lineHeight = fontSize * lineHeightMult;

    ctx.save();
    // Use a temporary merged layer for layout calculation
    const mergedLayer = { ...layer, ...newProps } as Layer;
    const lines = this.layoutText(ctx, mergedLayer, text, fontSize, tracking);
    let maxWidth = 0;

    lines.forEach((line, index) => {
      const lineStartPos = lines.slice(0, index).join("\n").length + (index > 0 ? 1 : 0);
      const width = this.measureTextWithTracking(ctx, line, tracking, mergedLayer, lineStartPos);
      maxWidth = Math.max(maxWidth, width);
    });

    const newWidth = Math.round(Math.max(1, maxWidth));
    const newHeight = Math.round(Math.max(1, lines.length * lineHeight));

    const result: { width: number; height: number; x?: number } = {
      width: newWidth,
      height: newHeight,
    };

    // For point text, we need to adjust X to maintain alignment anchor
    if (
      layer.textType === "point" &&
      layer.x !== undefined &&
      layer.width !== undefined &&
      newProps !== undefined
    ) {
      // Find the anchor point (pivot) based on the PREVIOUS state
      const oldAlign = layer.textAlign || "left";
      let anchorX = layer.x;
      if (oldAlign === "center") anchorX = layer.x + layer.width / 2;
      else if (oldAlign === "right") anchorX = layer.x + layer.width;

      // Calculate NEW x based on NEW width and NEW alignment to keep the anchor at the same place
      if (textAlign === "center") result.x = Math.round(anchorX - newWidth / 2);
      else if (textAlign === "right") result.x = Math.round(anchorX - newWidth);
      else result.x = Math.round(anchorX);
    }

    ctx.restore();
    return result;
  }

  private static drawTextToContext(ctx: CanvasRenderingContext2D, layer: Layer) {
    const text = layer.text || "";
    const baseFontSize = layer.fontSize || 24;
    const textAlign = layer.textAlign || "left";
    const lineHeightMult = layer.lineHeight || 1.2;
    const tracking = layer.tracking || 0;
    const lineHeight = baseFontSize * lineHeightMult;

    const lines = this.layoutText(ctx, layer, text, baseFontSize, tracking);

    ctx.save();
    ctx.textBaseline = "alphabetic";

    // Keep first line fixed to pivot (baseline at layer.y + baseFontSize)
    let currentY = layer.y + baseFontSize;
    let charsProcessed = 0;

    lines.forEach((line) => {
      let currentX = layer.x;
      const lineWidth = this.measureTextWithTracking(ctx, line, tracking, layer, charsProcessed);

      if (textAlign === "center") {
        currentX = layer.x + layer.width / 2 - lineWidth / 2;
      } else if (textAlign === "right") {
        currentX = layer.x + layer.width - lineWidth;
      }

      this.drawStyledLine(ctx, line, currentX, currentY, layer, tracking, charsProcessed);
      currentY += lineHeight;
      charsProcessed += line.length + 1; // +1 for newline
    });
    ctx.restore();
  }

  private static drawStyledLine(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    layer: Layer,
    tracking: number,
    lineStartIndex: number,
  ) {
    const baseFontSize = layer.fontSize || 24;
    const baseFontFamily = layer.fontFamily || "Arial";
    const baseFontWeight = layer.fontWeight || "normal";
    const baseColor = layer.color || "#000000";

    let currentX = x;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const style = this.getStyleAt(layer, lineStartIndex + i);

      const fontSize = style.fontSize || baseFontSize;
      const fontFamily = style.fontFamily || baseFontFamily;
      const fontWeight = style.fontWeight || baseFontWeight;
      const color = style.color || baseColor;

      ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;

      // Handle Stroke
      const stroke = layer.styles?.stroke;
      if (stroke?.enabled && stroke.size > 0) {
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha *= stroke.opacity / 100;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        if (stroke.position === "outside") {
          ctx.lineWidth = stroke.size * 2;
          ctx.strokeText(char, currentX, y);
          ctx.fillStyle = color;
          ctx.fillText(char, currentX, y);
        } else if (stroke.position === "center") {
          ctx.lineWidth = stroke.size;
          ctx.strokeText(char, currentX, y);
          ctx.fillStyle = color;
          ctx.fillText(char, currentX, y);
        } else if (stroke.position === "inside") {
          // Inside stroke is tricky with strokeText. 
          // One way is to clip to the text path and then stroke with 2x width.
          ctx.save();
          ctx.fillText(char, currentX, y); // Draw base text first
          ctx.globalCompositeOperation = "source-atop";
          ctx.lineWidth = stroke.size * 2;
          ctx.strokeText(char, currentX, y);
          ctx.restore();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = color;
        ctx.fillText(char, currentX, y);
      }

      currentX += ctx.measureText(char).width + tracking;
    }
  }

  private static getStyleAt(
    layer: Layer,
    charIndex: number,
  ): Partial<import("@/renderer/store/projectStore").TextSpan> {
    if (!layer.textSpans || layer.textSpans.length === 0) return {};

    let currentPos = 0;
    for (const span of layer.textSpans) {
      if (charIndex >= currentPos && charIndex < currentPos + span.text.length) {
        return span;
      }
      currentPos += span.text.length;
    }
    return {};
  }

  private static renderPivot(ctx: CanvasRenderingContext2D, layer: Layer) {
    const size = 8;
    const matrix = ctx.getTransform();
    const zoom = Math.hypot(matrix.a, matrix.b);
    const s = size / zoom;

    ctx.save();
    // ctx.fillStyle = layer.color || "#000000";
    // ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#0078ff";
    ctx.lineWidth = 1 / zoom;

    let px = layer.x;
    if (layer.textAlign === "center") px = layer.x + layer.width / 2;
    else if (layer.textAlign === "right") px = layer.x + layer.width;

    const py = layer.y + (layer.fontSize || 24);

    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4); // Rotate 45 degrees to make it a diamond

    ctx.beginPath();
    ctx.rect(-s / 2, -s / 2, s, s);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private static renderSelection(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    start: number,
    end: number,
    layerX: number,
    layerY: number,
    layerWidth: number,
    fontSize: number,
    lineHeight: number,
    textAlign: string,
    tracking: number,
    layer?: Layer, // Added layer for rich text measurement
  ) {
    const selStart = Math.min(start, end);
    const selEnd = Math.max(start, end);

    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "white";

    let charsProcessed = 0;
    lines.forEach((line, lineIndex) => {
      const lineStart = charsProcessed;
      const lineEnd = charsProcessed + line.length;

      const intersectionStart = Math.max(selStart, lineStart);
      const intersectionEnd = Math.min(selEnd, lineEnd);

      if (intersectionStart < intersectionEnd) {
        const textBefore = line.substring(0, intersectionStart - lineStart);
        const textSelected = line.substring(
          intersectionStart - lineStart,
          intersectionEnd - lineStart,
        );

        const offset = this.measureTextWithTracking(ctx, textBefore, tracking, layer, lineStart);
        const width = this.measureTextWithTracking(
          ctx,
          textSelected,
          tracking,
          layer,
          intersectionStart,
        );

        let currentX = layerX;
        const totalLineWidth = this.measureTextWithTracking(ctx, line, tracking, layer, lineStart);
        if (textAlign === "center") {
          currentX = layerX + layerWidth / 2 - totalLineWidth / 2;
        } else if (textAlign === "right") {
          currentX = layerX + layerWidth - totalLineWidth;
        }

        const rectX = currentX + offset;
        const rectY = layerY + lineIndex * lineHeight;

        ctx.fillRect(rectX, rectY, width, lineHeight);
      }

      charsProcessed += line.length + 1;
    });

    ctx.restore();
  }

  public static getCaretIndexAt(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    x: number,
    y: number,
  ): number {
    const text = layer.text || "";
    const fontSize = layer.fontSize || 24;
    const textAlign = layer.textAlign || "left";
    const lineHeightMult = layer.lineHeight || 1.2;
    const tracking = layer.tracking || 0;
    const lineHeight = fontSize * lineHeightMult;

    const lines = this.layoutText(ctx, layer, text, fontSize, tracking);

    const relativeY = y - (layer.y + fontSize - lineHeight / 2);
    let lineIndex = Math.floor(relativeY / lineHeight);
    lineIndex = Math.max(0, Math.min(lineIndex, lines.length - 1));

    const line = lines[lineIndex];
    let lineStartPos = 0;
    for (let i = 0; i < lineIndex; i++) lineStartPos += lines[i].length + 1;

    let currentX = layer.x;
    const lineWidth = this.measureTextWithTracking(ctx, line, tracking, layer, lineStartPos);
    if (textAlign === "center") {
      currentX = layer.x + layer.width / 2 - lineWidth / 2;
    } else if (textAlign === "right") {
      currentX = layer.x + layer.width - lineWidth;
    }

    const relativeX = x - currentX;

    let charIndexInLine = 0;
    let bestDist = Math.abs(relativeX);

    for (let i = 1; i <= line.length; i++) {
      const width = this.measureTextWithTracking(
        ctx,
        line.substring(0, i),
        tracking,
        layer,
        lineStartPos,
      );
      const dist = Math.abs(relativeX - width);
      if (dist < bestDist) {
        bestDist = dist;
        charIndexInLine = i;
      } else {
        break;
      }
    }

    return lineStartPos + charIndexInLine;
  }

  private static layoutText(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    text: string,
    fontSize: number,
    tracking: number,
  ): string[] {
    const rawLines = text.split("\n");
    if (layer.textType === "point") return rawLines;

    const wrappedLines: string[] = [];
    const maxWidth = layer.width;

    let charsProcessed = 0;
    rawLines.forEach((rawLine) => {
      const words = rawLine.split(" ");
      let currentLine = "";
      let currentLineStart = charsProcessed;

      words.forEach((word) => {
        const testLine = currentLine ? currentLine + " " + word : word;
        const metrics = this.measureTextWithTracking(
          ctx,
          testLine,
          tracking,
          layer,
          currentLineStart,
        );
        if (metrics > maxWidth && currentLine !== "") {
          wrappedLines.push(currentLine);
          currentLine = word;
          currentLineStart += wrappedLines[wrappedLines.length - 1].length + 1;
        } else {
          currentLine = testLine;
        }
      });
      wrappedLines.push(currentLine);
      charsProcessed += rawLine.length + 1;
    });

    return wrappedLines;
  }

  public static measureTextWithTracking(
    ctx: CanvasRenderingContext2D,
    text: string,
    tracking: number,
    layer?: Layer,
    lineStartIndex: number = 0,
  ): number {
    if (!layer || !layer.textSpans || layer.textSpans.length === 0) {
      if (tracking === 0) {
        ctx.save();
        ctx.font = `${layer?.fontWeight || "400"} ${layer?.fontSize || 24}px "${layer?.fontFamily || "Arial"}"`;
        const w = ctx.measureText(text).width;
        ctx.restore();
        return w;
      }
      let width = 0;
      ctx.save();
      ctx.font = `${layer?.fontWeight || "400"} ${layer?.fontSize || 24}px "${layer?.fontFamily || "Arial"}"`;
      for (let i = 0; i < text.length; i++) {
        width += ctx.measureText(text[i]).width + tracking;
      }
      ctx.restore();
      return width > 0 ? width - tracking : 0;
    }

    let width = 0;
    const baseFontSize = layer.fontSize || 24;
    const baseFontFamily = layer.fontFamily || "Arial";
    const baseFontWeight = layer.fontWeight || "normal";

    for (let i = 0; i < text.length; i++) {
      const style = this.getStyleAt(layer, lineStartIndex + i);
      const fontSize = style.fontSize || baseFontSize;
      const fontFamily = style.fontFamily || baseFontFamily;
      const fontWeight = style.fontWeight || baseFontWeight;

      ctx.save();
      ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
      width += ctx.measureText(text[i]).width + tracking;
      ctx.restore();
    }
    return width > 0 ? width - tracking : 0;
  }

  private static renderCaret(
    ctx: CanvasRenderingContext2D,
    lineText: string,
    lineIndex: number,
    allLines: string[],
    caretIndex: number,
    lineX: number,
    lineY: number,
    fontSize: number,
    lineHeight: number,
    textAlign: string,
    tracking: number,
    zoom: number,
    layer?: Layer, // Added layer for rich text
  ) {
    let charsBeforeLine = 0;
    for (let i = 0; i < lineIndex; i++) {
      charsBeforeLine += allLines[i].length + 1;
    }

    const relativeCaretIndex = caretIndex - charsBeforeLine;

    if (relativeCaretIndex >= 0 && relativeCaretIndex <= lineText.length) {
      const textBeforeCaret = lineText.substring(0, relativeCaretIndex);
      const offset = this.measureTextWithTracking(
        ctx,
        textBeforeCaret,
        tracking,
        layer,
        charsBeforeLine,
      );

      const lineWidth = this.measureTextWithTracking(
        ctx,
        lineText,
        tracking,
        layer,
        charsBeforeLine,
      );
      let caretX = lineX + offset;
      if (textAlign === "center") {
        caretX = lineX - lineWidth / 2 + offset;
      } else if (textAlign === "right") {
        caretX = lineX - lineWidth + offset;
      }

      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.beginPath();
      ctx.moveTo(caretX, lineY + fontSize * 0.2);
      ctx.lineTo(caretX, lineY - fontSize * 0.8);
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeStyle = "white";
      ctx.stroke();
      ctx.restore();
    }
  }
}
