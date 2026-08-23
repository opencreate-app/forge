/**
 * Purpose: Eyedropper tool that samples the visible canvas and previews the sampled color at the cursor.
 */
import { BaseTool, ToolContext, ToolId } from "./BaseTool";

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const rgbaToHex = ({ r, g, b }: RgbaColor): string =>
  `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;

export class ColorPickerTool extends BaseTool {
  id: ToolId = "colorPicker";

  private isSampling = false;
  private mouseX = 0;
  private mouseY = 0;
  private sampledColor: string | null = null;
  private originalForegroundColor = "#000000";
  private suppressNextContextMenu = false;

  onActivate(context: ToolContext): void {
    context.canvas.style.cursor = "crosshair";
  }

  onDeactivate(context: ToolContext): void {
    this.reset(context);
  }

  onMouseDown(e: MouseEvent, context: ToolContext): void {
    if (e.button === 2) {
      if (this.isSampling) {
        this.cancel(context);
        this.suppressNextContextMenu = true;
      }
      return;
    }
    if (e.button !== 0) return;

    this.isSampling = true;
    this.suppressNextContextMenu = false;
    this.originalForegroundColor = context.foregroundColor;
    this.updatePointer(e, context);
    this.sampleAtPointer(e, context);
    context.canvas.style.cursor = "crosshair";
  }

  onMouseMove(e: MouseEvent, context: ToolContext): void {
    context.canvas.style.cursor = "crosshair";
    if (!this.isSampling) return;

    this.updatePointer(e, context);
    this.sampleAtPointer(e, context);
  }

  onMouseUp(_e: MouseEvent, context: ToolContext): void {
    if (!this.isSampling) return;

    if (this.sampledColor) {
      context.setForegroundColor(this.sampledColor);
    }

    this.isSampling = false;
    this.sampledColor = null;
    context.canvas.style.cursor = "crosshair";
  }

  onContextMenu(_e: MouseEvent, context: ToolContext): boolean {
    if (this.isSampling) {
      this.cancel(context);
      return true;
    }

    if (this.suppressNextContextMenu) {
      this.suppressNextContextMenu = false;
      return true;
    }

    return false;
  }

  onKeyDown(e: KeyboardEvent, context: ToolContext): boolean {
    if (e.key === "Escape" && this.isSampling) {
      this.cancel(context);
      return true;
    }

    return false;
  }

  onRender(ctx: CanvasRenderingContext2D, context: ToolContext): void {
    if (!this.isSampling || !this.sampledColor) return;

    const zoom = context.project.zoom;
    const outerRadius = 56 / zoom;
    const innerRadius = 42 / zoom;
    const lineWidth = 1.5 / zoom;

    ctx.save();
    context.setViewportTransform(zoom, context.project.panX, context.project.panY);

    // The annulus is split horizontally while leaving the center transparent.
    this.drawRingHalf(ctx, outerRadius, innerRadius, this.sampledColor, true);
    this.drawRingHalf(ctx, outerRadius, innerRadius, this.originalForegroundColor, false);

    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(this.mouseX, this.mouseY, outerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.mouseX, this.mouseY, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private updatePointer(e: MouseEvent, context: ToolContext): void {
    const point = context.screenToProject(e.offsetX, e.offsetY);
    this.mouseX = point.x;
    this.mouseY = point.y;
  }

  private sampleAtPointer(e: MouseEvent, context: ToolContext): void {
    const sampled = context.sampleColorAtScreen(e.offsetX, e.offsetY);
    if (!sampled) return;

    this.sampledColor = rgbaToHex(sampled);
  }

  private drawRingHalf(
    ctx: CanvasRenderingContext2D,
    outerRadius: number,
    innerRadius: number,
    color: string,
    isTopHalf: boolean,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.mouseX, this.mouseY, outerRadius, 0, Math.PI * 2);
    ctx.arc(this.mouseX, this.mouseY, innerRadius, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
    ctx.fillStyle = color;
    ctx.fillRect(
      this.mouseX - outerRadius,
      isTopHalf ? this.mouseY - outerRadius : this.mouseY,
      outerRadius * 2,
      outerRadius,
    );
    ctx.restore();
  }

  private reset(context: ToolContext): void {
    this.cancel(context);
    context.canvas.style.cursor = "default";
  }

  private cancel(context: ToolContext): void {
    this.isSampling = false;
    this.sampledColor = null;
    this.suppressNextContextMenu = false;
    context.canvas.style.cursor = "crosshair";
  }
}
