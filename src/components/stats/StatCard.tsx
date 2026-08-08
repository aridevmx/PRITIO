import { cn } from "@/lib/utils";

interface StatCardProps {
  value: string | number;
  label: string;
  variant?: "default" | "success" | "danger";
}

export function StatCard({ value, label, variant = "default" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-soft">
      <p
        className={cn(
          "text-2xl font-extrabold tracking-tight",
          variant === "success" && "text-pritio-green",
          variant === "danger" && "text-pritio-coral",
          variant === "default" && "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
    </div>
  );
}
