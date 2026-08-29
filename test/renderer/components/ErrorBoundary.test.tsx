import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/renderer/components/ErrorBoundary";
import {
  RENDERER_RECOVERY_STORAGE_KEY,
  SESSION_GUARD_STORAGE_KEY,
} from "@/renderer/utils/sessionGuard";

describe("ErrorBoundary", () => {
  const originalElectronAPI = (window as any).electronAPI;
  const getForceRefreshMock = () =>
    (
      window as Window & {
        electronAPI?: { forceRefresh: ReturnType<typeof vi.fn> };
      }
    ).electronAPI?.forceRefresh;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { forceRefresh: vi.fn() },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: originalElectronAPI,
    });
  });

  it("persists the session and requests one refresh after a render error", () => {
    const BrokenComponent = (): React.ReactNode => {
      throw new Error("broken component");
    };

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_GUARD_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(RENDERER_RECOVERY_STORAGE_KEY)).not.toBeNull();

    act(() => vi.runOnlyPendingTimers());
    expect(getForceRefreshMock()).toHaveBeenCalledOnce();
  });

  it("keeps the fallback when a recovery attempt already exists", () => {
    localStorage.setItem(
      RENDERER_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: 1,
        message: "previous failure",
        savedAt: new Date().toISOString(),
      }),
    );

    const BrokenComponent = (): React.ReactNode => {
      throw new Error("broken again");
    };

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    act(() => vi.runOnlyPendingTimers());
    expect(getForceRefreshMock()).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Recarregar app" })).toBeInTheDocument();
  });

  it("recovers from uncaught window errors outside the React render lifecycle", () => {
    render(
      <ErrorBoundary>
        <div>Healthy content</div>
      </ErrorBoundary>,
    );

    const error = new Error("canvas render failure");
    act(() => {
      window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("canvas render failure")).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_GUARD_STORAGE_KEY)).not.toBeNull();

    act(() => vi.runOnlyPendingTimers());
    expect(getForceRefreshMock()).toHaveBeenCalledOnce();
  });

  it("recovers from unhandled promise rejections", () => {
    render(
      <ErrorBoundary>
        <div>Healthy content</div>
      </ErrorBoundary>,
    );

    const error = new Error("async renderer failure");
    const rejectionEvent = new Event("unhandledrejection", { cancelable: true });
    Object.defineProperty(rejectionEvent, "reason", { value: error });

    act(() => {
      window.dispatchEvent(rejectionEvent);
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("async renderer failure")).toBeInTheDocument();
  });
});
