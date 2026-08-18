/**
 * Purpose: Coordinate periodic Session Guard snapshots and recovery during renderer startup.
 */
import { useEffect, useRef } from "react";
import { useUIStore } from "@store/uiStore";
import {
  clearSessionSnapshot,
  clearRendererRecoveryMarker,
  getRendererRecoveryStabilizationMs,
  loadRendererRecoveryMarker,
  loadSessionSnapshot,
  restoreSessionSnapshot,
  saveSessionSnapshot,
  SESSION_GUARD_INTERVAL_MS,
  isSessionGuardPaused,
} from "@utils/sessionGuard";

export const useSessionGuard = (): void => {
  const restoredRef = useRef(false);
  const recoveryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const snapshot = loadSessionSnapshot();
    const recoveryMarker = loadRendererRecoveryMarker();
    if (snapshot) {
      restoreSessionSnapshot(snapshot);
      clearSessionSnapshot();
    }

    if (recoveryMarker) {
      useUIStore
        .getState()
        .showToast("O app foi recuperado após uma falha de renderização.", "warning", 6_000);
      recoveryTimeoutRef.current = window.setTimeout(
        clearRendererRecoveryMarker,
        getRendererRecoveryStabilizationMs(),
      );
    }

    // Write an initial snapshot and then refresh it on a fixed cadence. The synchronous
    // localStorage write completes before SafeQuit is acknowledged by the main process.
    saveSessionSnapshot();
    const interval = window.setInterval(() => {
      if (!isSessionGuardPaused()) saveSessionSnapshot();
    }, SESSION_GUARD_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current);
        recoveryTimeoutRef.current = null;
      }
      // React StrictMode mounts effects twice in development. Allow the second
      // mount to initialize the interval instead of leaving only the first snapshot.
      restoredRef.current = false;
    };
  }, []);
};
