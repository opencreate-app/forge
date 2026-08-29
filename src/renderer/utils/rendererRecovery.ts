/**
 * Purpose: Bridge renderer crash recovery to Electron while keeping browser-based development and tests working.
 */
import { prepareRendererRecovery } from "@utils/sessionGuard";

interface RendererElectronAPI {
  forceRefresh?: () => Promise<boolean> | boolean;
}

export interface RendererRecoveryEvent {
  source: "render-process-gone" | "unresponsive";
  reason?: string;
  exitCode?: number;
}

const getElectronAPI = (): RendererElectronAPI | undefined =>
  (window as Window & { electronAPI?: RendererElectronAPI }).electronAPI;

export { prepareRendererRecovery };

let recoveryRefreshScheduled = false;

const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown renderer failure");
};

/**
 * Reports failures that happen outside React's render lifecycle and requests one recovery.
 * The custom event lets ErrorBoundary render its fallback even for async and global failures.
 */
export const handleRendererFailure = (error: unknown, source: string): void => {
  const normalizedError = normalizeError(error);
  console.error(`[RendererRecovery] ${source}:`, normalizedError);

  window.dispatchEvent(
    new CustomEvent("forge:renderer-failure", {
      detail: { error: normalizedError },
    }),
  );

  if (recoveryRefreshScheduled) return;
  if (!prepareRendererRecovery(normalizedError)) return;

  recoveryRefreshScheduled = true;
  window.setTimeout(() => {
    recoveryRefreshScheduled = false;
    forceRefreshRenderer();
  }, 0);
};

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
