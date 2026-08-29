import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPickerTool } from "@/core/tools/ColorPickerTool";
import { createMockToolContext } from "../../mocks";

describe("ColorPickerTool", () => {
  let context: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    context = createMockToolContext({
      sampleColorAtScreen: vi.fn().mockReturnValue({ r: 255, g: 18, b: 52, a: 255 }),
    });
  });

  it("samples the visible canvas without updating the foreground until mouse up", () => {
    const tool = new ColorPickerTool();

    tool.onMouseDown({ button: 0, offsetX: 12, offsetY: 24 } as MouseEvent, context);

    expect(context.sampleColorAtScreen).toHaveBeenCalledWith(12, 24);
    expect(context.setForegroundColor).not.toHaveBeenCalled();

    tool.onMouseUp({ button: 0 } as MouseEvent, context);

    expect(context.setForegroundColor).toHaveBeenCalledWith("#ff1234");
    expect(context.canvas.style.cursor).toBe("crosshair");
  });

  it("updates the sampled color while dragging", () => {
    const sampleColorAtScreen = vi
      .fn()
      .mockReturnValueOnce({ r: 255, g: 0, b: 0, a: 255 })
      .mockReturnValueOnce({ r: 0, g: 128, b: 255, a: 255 });
    context = createMockToolContext({ sampleColorAtScreen });
    const tool = new ColorPickerTool();

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, buttons: 1, offsetX: 20, offsetY: 30 } as MouseEvent, context);

    expect(sampleColorAtScreen).toHaveBeenLastCalledWith(20, 30);
    expect(context.setForegroundColor).not.toHaveBeenCalled();

    tool.onMouseUp({ button: 0 } as MouseEvent, context);

    expect(context.setForegroundColor).toHaveBeenLastCalledWith("#0080ff");
  });

  it("keeps the last sample when the pointer leaves the canvas", () => {
    const sampleColorAtScreen = vi
      .fn()
      .mockReturnValueOnce({ r: 10, g: 20, b: 30, a: 255 })
      .mockReturnValueOnce(null);
    context = createMockToolContext({ sampleColorAtScreen });
    const tool = new ColorPickerTool();

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
    tool.onMouseMove({ button: 0, buttons: 1, offsetX: -10, offsetY: -10 } as MouseEvent, context);

    expect(context.setForegroundColor).not.toHaveBeenCalled();

    tool.onMouseUp({ button: 0 } as MouseEvent, context);

    expect(context.setForegroundColor).toHaveBeenCalledTimes(1);
    expect(context.setForegroundColor).toHaveBeenLastCalledWith("#0a141e");
  });

  it("cancels without changing the foreground when Escape is pressed", () => {
    const tool = new ColorPickerTool();

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(tool.onKeyDown({ key: "Escape" } as KeyboardEvent, context)).toBe(true);
    tool.onMouseUp({ button: 0 } as MouseEvent, context);

    expect(context.setForegroundColor).not.toHaveBeenCalled();
  });

  it("cancels and consumes a right-click during sampling", () => {
    const tool = new ColorPickerTool();

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
    tool.onMouseDown({ button: 2, offsetX: 10, offsetY: 10 } as MouseEvent, context);

    expect(tool.onContextMenu({ button: 2 } as MouseEvent, context)).toBe(true);
    tool.onMouseUp({ button: 0 } as MouseEvent, context);

    expect(context.setForegroundColor).not.toHaveBeenCalled();
  });

  it("renders the sampled and original colors around the cursor", () => {
    const tool = new ColorPickerTool();
    const renderContext = context.ctx;
    const fillRect = vi.spyOn(renderContext, "fillRect");

    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 20 } as MouseEvent, context);
    tool.onRender(renderContext, context);

    expect(context.setViewportTransform).toHaveBeenCalledWith(1, 0, 0);
    expect(fillRect).toHaveBeenCalledTimes(2);
    expect(renderContext.stroke).toHaveBeenCalled();
  });

  it("keeps the ring visible throughout a temporary Alt preview", () => {
    const tool = new ColorPickerTool();
    const renderContext = context.ctx;
    const fillRect = vi.spyOn(renderContext, "fillRect");

    tool.beginTemporaryPreview(context);
    tool.onRender(renderContext, context);
    expect(fillRect).toHaveBeenCalledTimes(2);

    fillRect.mockClear();
    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 20 } as MouseEvent, context);
    tool.finishTemporarySampling(context);

    expect(context.setForegroundColor).not.toHaveBeenCalled();
    tool.onRender(renderContext, context);
    expect(fillRect).toHaveBeenCalledTimes(2);

    tool.commitTemporaryPreview(context);
    fillRect.mockClear();
    tool.onRender(renderContext, context);
    expect(fillRect).not.toHaveBeenCalled();
    expect(context.setForegroundColor).toHaveBeenCalledWith("#ff1234");
  });

  it("cancels a temporary sample without hiding the ring until Alt is released", () => {
    const tool = new ColorPickerTool();
    const renderContext = context.ctx;
    const fillRect = vi.spyOn(renderContext, "fillRect");

    tool.beginTemporaryPreview(context);
    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 20 } as MouseEvent, context);
    tool.cancelTemporaryPreview(context);

    expect(context.setForegroundColor).not.toHaveBeenCalled();
    tool.onRender(renderContext, context);
    expect(fillRect).toHaveBeenCalledTimes(2);

    tool.commitTemporaryPreview(context);
    fillRect.mockClear();
    tool.onRender(renderContext, context);
    expect(fillRect).not.toHaveBeenCalled();
  });

  it("ignores non-primary mouse buttons and clears the preview when deactivated", () => {
    const tool = new ColorPickerTool();

    tool.onMouseDown({ button: 2, offsetX: 10, offsetY: 10 } as MouseEvent, context);
    expect(context.sampleColorAtScreen).not.toHaveBeenCalled();

    tool.onActivate(context);
    tool.onMouseDown({ button: 0, offsetX: 10, offsetY: 10 } as MouseEvent, context);
    tool.onDeactivate(context);

    expect(context.canvas.style.cursor).toBe("default");
  });
});
