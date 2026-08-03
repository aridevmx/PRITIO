import { APP_NAME } from "@/lib/branding";

interface PrioLogoProps {
  size?: number;
  withGlow?: boolean;
}

const SPACE_COLORS = ["#4FC38A", "#F27D72", "#5BA7D1", "#9B7EDC"] as const;

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function PrioLogo({ size = 34, withGlow = true }: PrioLogoProps) {
  const gap = Math.max(4, Math.round(size * 0.12));
  const cell = Math.round((size - gap) / 2);
  const radius = Math.max(6, Math.round(cell * 0.24));

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `${cell}px ${cell}px`,
        gap,
        width: size,
        height: size,
      }}
      aria-label={APP_NAME}
    >
      {SPACE_COLORS.map((color, i) => (
        <div
          key={i}
          style={{
            width: cell,
            height: cell,
            borderRadius: radius,
            background: color,
            boxShadow: withGlow ? `0 10px 18px ${hexToRgba(color, 0.2)}` : "none",
          }}
        />
      ))}
    </div>
  );
}
