import React from "react";
import { reportError } from "@/lib/sentry";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportError(error, { componentStack: errorInfo.componentStack ?? undefined });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted p-8 text-center">
          <div className="text-6xl">⚠️</div>
          <h1 className="mt-4 text-2xl font-bold text-ink">
            Algo salió mal
          </h1>
          <p className="mt-2 max-w-md text-ink-soft">
            {this.state.error?.message ||
              "Ocurrió un error inesperado. Intenta recargar la página."}
          </p>
          <button
            onClick={this.handleRetry}
            className="mt-6 rounded-lg bg-prio-blue px-6 py-3 text-sm font-semibold text-white hover:bg-prio-blue/90"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
