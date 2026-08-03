import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface BarItem {
  name: string;
  value: number;
  color: string;
}

interface HorizontalBarChartProps {
  data: BarItem[];
  title: string;
}

export function HorizontalBarChart({ data, title }: HorizontalBarChartProps) {
  if (data.length === 0) {
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
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
          barSize={20}
          barGap={4}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12, fill: "#6B7280" }}
            width={100}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }}
            formatter={(value) => [value, "tareas"]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
