/**
 * Purpose: Expose development-only DevTools commands for exercising renderer recovery paths.
 */

export interface DebugToolsWindow {
  electronAPI?: {
    debugCrashRenderer?: () => void;
  };
  __forgeDebug?: ForgeDebugTools;
}

export interface ForgeDebugTools {
  crashRenderer: () => void;
}

/** Installs safe renderer failure commands when running the Vite development build. */
export const installDebugTools = (isDevelopment: boolean, targetWindow: DebugToolsWindow): void => {
  if (!isDevelopment) return;

  const debugCrashRenderer = targetWindow.electronAPI?.debugCrashRenderer;
  if (typeof debugCrashRenderer !== "function") return;

  targetWindow.__forgeDebug = {
    crashRenderer: () => debugCrashRenderer(),
  };
};
