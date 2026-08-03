import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      const err = hint?.originalException;

      if (isAbortError(err)) return null;
      if (hasCode(err, "42501")) return null;

      return event;
    },
  });
}

export function reportError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (isAbortError(err)) return;
  if (hasCode(err, "42501")) return;

  if (initialized) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      Sentry.captureException(err);
    });
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>).code === code
  );
}
