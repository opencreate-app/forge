/**
 * Purpose: Coordinate periodic Session Guard snapshots and recovery during renderer startup.
 */
import { useEffect, useRef } from "react";
import { useProjectStore } from "@store/projectStore";
import { useUIStore } from "@store/uiStore";
import {
  clearSessionSnapshot,
  clearRendererRecoveryMarker,
  getRendererRecoveryStabilizationMs,
  loadRendererRecoveryMarker,
  loadSessionSnapshot,
  restoreSessionSnapshot,
  saveSessionSnapshot,
  SESSION_GUARD_DEBOUNCE_MS,
  SESSION_GUARD_INTERVAL_MS,
  isSessionGuardPaused,
} from "@utils/sessionGuard";

export const useSessionGuard = (): void => {
  const restoredRef = useRef(false);
  const recoveryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    let snapshotTimer: number | null = null;
    const scheduleSnapshot = () => {
      if (isSessionGuardPaused()) return;
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null;
        if (!isSessionGuardPaused()) saveSessionSnapshot();
      }, SESSION_GUARD_DEBOUNCE_MS);
    };

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

    const unsubscribeProjectStore = useProjectStore.subscribe((state, previousState) => {
      if (
        state.projects !== previousState.projects ||
        state.activeProjectId !== previousState.activeProjectId
      ) {
        scheduleSnapshot();
      }
    });
    const unsubscribeUIStore = useUIStore.subscribe((state, previousState) => {
      if (state.activeTab !== previousState.activeTab) scheduleSnapshot();
    });

    const saveBeforePageHide = () => {
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = null;
      if (!isSessionGuardPaused()) saveSessionSnapshot();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveBeforePageHide();
    };
    window.addEventListener("pagehide", saveBeforePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const rendererRecoveryCleanup = (window as any).electronAPI?.onRendererRecovered?.(() => {
      useUIStore
        .getState()
        .showToast("O app foi recuperado após uma falha do renderer.", "warning", 6_000);
    });

    return () => {
      window.clearInterval(interval);
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      unsubscribeProjectStore();
      unsubscribeUIStore();
      window.removeEventListener("pagehide", saveBeforePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      rendererRecoveryCleanup?.();
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
