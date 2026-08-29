import { describe, it, expect } from "vitest";
import { BaseTool, getAxisLock, ToolId } from "@/core/tools/BaseTool";

class TestTool extends BaseTool {
  id = "test-tool" as ToolId;
}

describe("BaseTool", () => {
  it("should be instantiable and have an id", () => {
    const tool = new TestTool();
    expect(tool.id).toBe("test-tool");
  });

  it("should have default empty methods", () => {
    const tool = new TestTool();
    expect(() => tool.onMouseDown({} as MouseEvent, {} as any)).not.toThrow();
    expect(() => tool.onMouseMove({} as MouseEvent, {} as any)).not.toThrow();
    expect(() => tool.onMouseUp({} as MouseEvent, {} as any)).not.toThrow();
  });

  it("should choose the closest axis for a constrained stroke", () => {
    expect(getAxisLock({ x: 10, y: 10 }, { x: 30, y: 20 })).toBe("horizontal");
    expect(getAxisLock({ x: 10, y: 10 }, { x: 20, y: 40 })).toBe("vertical");
  });
});
