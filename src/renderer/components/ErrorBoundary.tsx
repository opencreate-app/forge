/**
 * Purpose: Recover the renderer after an uncaught React render error without losing the current session.
 */
import React from "react";
import { forceRefreshRenderer, handleRendererFailure } from "@utils/rendererRecovery";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render errors, persists the session, and refreshes the Electron renderer once. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  private handleGlobalError = (event: ErrorEvent): void => {
    event.preventDefault();
    handleRendererFailure(event.error || event.message, "window.error");
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    event.preventDefault();
    handleRendererFailure(event.reason, "unhandledrejection");
  };

  private handleRendererFailure = (event: Event): void => {
    const error = (event as CustomEvent<{ error?: unknown }>).detail?.error;
    if (error instanceof Error) this.setState({ error });
  };

  componentDidMount(): void {
    window.addEventListener("error", this.handleGlobalError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    window.addEventListener("forge:renderer-failure", this.handleRendererFailure);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[RendererRecovery] React render error:", error, errorInfo);
    handleRendererFailure(error, "react-render");
  }

  componentWillUnmount(): void {
    window.removeEventListener("error", this.handleGlobalError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    window.removeEventListener("forge:renderer-failure", this.handleRendererFailure);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main
        className="flex min-h-screen items-center justify-center bg-bg-primary px-6 text-text"
        role="alert"
      >
        <section className="max-w-lg rounded-lg border border-bg-tertiary bg-bg-secondary p-6 shadow-xl">
          <h1 className="mb-2 text-lg font-semibold">Ocorreu um erro ao renderizar o app</h1>
          <p className="mb-4 text-sm text-[#aaa]">
            A sessão foi preservada. Tente recarregar o app para continuar.
          </p>
          <button
            type="button"
            onClick={forceRefreshRenderer}
            className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Recarregar app
          </button>
          <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-[#777]">
            {this.state.error.message}
          </pre>
        </section>
      </main>
    );
  }
}
