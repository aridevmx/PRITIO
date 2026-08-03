import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  activeClassName?: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: [SegmentedOption<T>, SegmentedOption<T>, ...SegmentedOption<T>[]];
  className?: string;
  pill?: boolean;
  size?: "sm" | "md";
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  pill = false,
  size = "md",
}: SegmentedControlProps<T>) {
  const count = options.length;
  const thumbWidth = `calc((100% - ${0.5 + 0.25 * (count - 1)}rem)/${count})`;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      className={cn(
        "relative grid gap-1 rounded-xl border border-line bg-surface-muted p-1",
        pill && "rounded-full",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <div
        aria-hidden
        className={cn("absolute inset-y-1 rounded-lg bg-white shadow-sm transition-all duration-200", pill && "rounded-full")}
        style={{ left: `calc(0.25rem + ${idx} * (100% - 0.25rem)/${count})`, width: thumbWidth }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors",
            pill && "rounded-full",
            size === "sm" ? "py-1.5 text-sm" : "py-2 text-sm",
            value === o.value ? cn("text-ink", o.activeClassName) : "text-ink-soft hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
