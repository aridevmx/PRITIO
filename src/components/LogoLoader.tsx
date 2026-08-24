import { APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

interface LogoLoaderProps {
  className?: string;
}

/** Splash de arranque: el logo gira, queda estático un momento y vuelve a girar. */
export function LogoLoader({ className }: LogoLoaderProps) {
  return (
    <div
      role="status"
      aria-label={`Cargando ${APP_NAME}`}
      className={cn("flex min-h-screen flex-1 flex-col items-center justify-center gap-5 bg-surface", className)}
    >
      <img
        src="/brand/pritio-logo-1024.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pritio-logo-spin h-24 w-24 select-none object-contain"
      />
      <p className="text-sm font-semibold tracking-wide text-ink-muted">{APP_NAME}</p>
    </div>
  );
}
