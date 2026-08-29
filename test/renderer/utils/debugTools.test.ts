import { describe, expect, it, vi } from "vitest";
import { installDebugTools, type DebugToolsWindow } from "@/renderer/utils/debugTools";

describe("renderer debug tools", () => {
  it("exposes the renderer crash command in development", () => {
    const debugCrashRenderer = vi.fn();
    const targetWindow: DebugToolsWindow = {
      electronAPI: { debugCrashRenderer },
    };

    installDebugTools(true, targetWindow);
    targetWindow.__forgeDebug?.crashRenderer();

    expect(debugCrashRenderer).toHaveBeenCalledOnce();
  });

  it("does not expose debug commands in production", () => {
    const targetWindow: DebugToolsWindow = {
      electronAPI: { debugCrashRenderer: vi.fn() },
    };

    installDebugTools(false, targetWindow);

    expect(targetWindow.__forgeDebug).toBeUndefined();
  });

  it("does not expose a command when Electron is unavailable", () => {
    const targetWindow: DebugToolsWindow = {};

    installDebugTools(true, targetWindow);

    expect(targetWindow.__forgeDebug).toBeUndefined();
  });
});
