/**
 * Purpose: Bridge renderer crash recovery to Electron while keeping browser-based development and tests working.
 */
import { prepareRendererRecovery } from "@utils/sessionGuard";

interface RendererElectronAPI {
  forceRefresh?: () => Promise<boolean> | boolean;
}

const getElectronAPI = (): RendererElectronAPI | undefined =>
  (window as Window & { electronAPI?: RendererElectronAPI }).electronAPI;

export { prepareRendererRecovery };

export const forceRefreshRenderer = (): void => {
  const forceRefresh = getElectronAPI()?.forceRefresh;
  if (forceRefresh) {
    void Promise.resolve(forceRefresh()).catch((error: unknown) => {
      console.error("Failed to force-refresh renderer:", error);
    });
    return;
  }

  window.location.reload();
};
