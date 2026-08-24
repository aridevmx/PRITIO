import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface PieItem {
  name: string;
  value: number;
  color: string;
}

interface QuadrantPieChartProps {
  data: PieItem[];
  title: string;
}

interface TooltipPayloadEntry {
  payload: PieItem;
}

function ChartTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-elevated">
      <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
        <span className="font-bold text-ink">{item.value}</span> tarea{item.value === 1 ? "" : "s"} ·{" "}
        {pct}%
      </p>
    </div>
  );
}

export function QuadrantPieChart({ data, title }: QuadrantPieChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = useMemo(() => data.reduce((acc, d) => acc + d.value, 0), [data]);

  if (data.length === 0 || total === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6">
        <h3 className="mb-4 text-sm font-bold text-ink">{title}</h3>
        <p className="text-sm text-ink-soft">Sin datos</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h3 className="mb-4 text-sm font-bold text-ink">{title}</h3>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                onMouseEnter={(_, index) => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    fillOpacity={hovered === null || hovered === index ? 1 : 0.3}
                    className="transition-opacity duration-150 cursor-pointer outline-none"
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold tabular-nums leading-none text-ink">{total}</span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">tareas</span>
          </div>
        </div>

        <ul className="min-w-[8rem] flex-1 space-y-1">
          {data.map((d, i) => {
            const pct = Math.round((d.value / total) * 100);
            const dimmed = hovered !== null && hovered !== i;
            return (
              <li
                key={d.name}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className={
                  "flex items-center gap-2 rounded-lg px-2 py-1 transition-colors " +
                  (dimmed ? "opacity-50 " : "") +
                  (hovered === i ? "bg-surface-muted" : "")
                }
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{d.name}</span>
                <span className="shrink-0 text-xs font-extrabold tabular-nums text-ink">{d.value}</span>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-ink-muted">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
