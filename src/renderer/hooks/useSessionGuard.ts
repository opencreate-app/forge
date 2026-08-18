/**
 * Purpose: Coordinate periodic Session Guard snapshots and recovery during renderer startup.
 */
import { useEffect, useRef } from "react";
import {
  clearSessionSnapshot,
  loadSessionSnapshot,
  restoreSessionSnapshot,
  saveSessionSnapshot,
  SESSION_GUARD_INTERVAL_MS,
  isSessionGuardPaused,
} from "@utils/sessionGuard";

export const useSessionGuard = (): void => {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const snapshot = loadSessionSnapshot();
    if (snapshot) {
      restoreSessionSnapshot(snapshot);
      clearSessionSnapshot();
    }

    // Write an initial snapshot and then refresh it on a fixed cadence. The synchronous
    // localStorage write completes before SafeQuit is acknowledged by the main process.
    saveSessionSnapshot();
    const interval = window.setInterval(() => {
      if (!isSessionGuardPaused()) saveSessionSnapshot();
    }, SESSION_GUARD_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      // React StrictMode mounts effects twice in development. Allow the second
      // mount to initialize the interval instead of leaving only the first snapshot.
      restoredRef.current = false;
    };
  }, []);
};
