import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  badge?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  badge,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-ink">{label}</label>
        {badge && (
          <span className="rounded-full bg-ink-muted/10 px-2 py-0.5 text-xs font-medium text-ink-muted">
            {badge}
          </span>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
