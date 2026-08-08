import React from "react";

export function friendlyError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as Record<string, unknown>).code;
    if (code === "42501" || code === "PGRST116") {
      return "No cuentas con los permisos necesarios para realizar esta acción.";
    }
  }

  if (err instanceof Error) {
    if (err.message.includes("row level security")) {
      return "No cuentas con los permisos necesarios para realizar esta acción.";
    }
  }

  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function permissionDeniedFor(action: string): string {
  return `No tienes permiso para ${action}.`;
}

export function LoadingState(): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      {icon && <div className="mb-4 text-ink-muted">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-4xl">⚠️</div>
      <h3 className="text-lg font-semibold text-ink">Algo salió mal</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg bg-pritio-blue px-4 py-2 text-sm font-semibold text-white hover:bg-pritio-blue/90"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
