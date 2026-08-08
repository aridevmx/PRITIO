import { cn } from "@/lib/utils";
import { useTimeFormat } from "@/lib/timeFormat";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  accent: "blue" | "purple";
  compact?: boolean;
}

function to12Hour(hh: string): string {
  const h = Number(hh) % 12;
  return h === 0 ? "12" : String(h);
}

function to24Hour(hh12: string, period: "AM" | "PM"): string {
  let h = Number(hh12) % 12;
  if (period === "PM") h += 12;
  return String(h).padStart(2, "0");
}

function compactLabel(value: string, is12: boolean): string {
  const [hh, mm] = value.split(":");
  if (!is12) return value;
  const h = Number(hh) % 12;
  return `${h === 0 ? 12 : h}:${mm} ${Number(hh) < 12 ? "AM" : "PM"}`;
}

export function TimePicker({ value, onChange, accent, compact }: TimePickerProps) {
  const format = useTimeFormat();
  const is12 = format === "12h";
  const hour = value ? value.slice(0, 2) : "";
  const minute = value ? value.slice(3, 5) : "";
  const period: "AM" | "PM" = hour && Number(hour) >= 12 ? "PM" : "AM";

  const selectClass = cn(
    "w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2",
    accent === "blue"
      ? "focus:border-pritio-blue focus:ring-pritio-blue/20"
      : "focus:border-pritio-purple focus:ring-pritio-purple/20",
  );

  const activePeriodClass =
    accent === "blue"
      ? "bg-pritio-blue text-white"
      : "bg-pritio-purple text-white";

  if (compact) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value="">--:--</option>
        {Array.from({ length: 288 }, (_, i) => {
          const v = `${String(Math.floor(i / 12)).padStart(2, "0")}:${String((i % 12) * 5).padStart(2, "0")}`;
          return (
            <option key={v} value={v}>
              {compactLabel(v, is12)}
            </option>
          );
        })}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {is12 ? (
        <select
          value={hour ? to12Hour(hour) : ""}
          onChange={(e) => {
            const h12 = e.target.value;
            if (!h12) onChange("");
            else onChange(`${to24Hour(h12, period)}:${minute || "00"}`);
          }}
          className={selectClass}
        >
          <option value="">--</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      ) : (
        <select
          value={hour}
          onChange={(e) => {
            const h = e.target.value;
            if (!h) onChange("");
            else onChange(`${h}:${minute || "00"}`);
          }}
          className={selectClass}
        >
          <option value="">--</option>
          {HOURS_24.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      )}
      <span className="text-sm font-semibold text-ink-soft">:</span>
      <select
        value={minute}
        onChange={(e) => {
          const m = e.target.value;
          if (!m) onChange("");
          else onChange(`${hour || "00"}:${m}`);
        }}
        className={selectClass}
      >
        <option value="">--</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {is12 && (
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-line">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                onChange(
                  `${to24Hour(to12Hour(hour || "12"), p)}:${minute || "00"}`,
                )
              }
              className={cn(
                "px-2.5 py-2 text-xs font-semibold transition-colors",
                period === p
                  ? activePeriodClass
                  : "bg-surface-subtle text-ink-soft hover:bg-surface-muted",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
