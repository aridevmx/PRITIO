import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePresence } from "@/features/workspaces/usePresence";

interface MemberPresenceStackProps {
  workspaceId: string | null;
  profileId: string | null;
}

const MAX_VISIBLE = 4;

function PresenceAvatar({
  name,
  avatarUrl,
  online,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  online: boolean;
  size?: "sm" | "md";
}) {
  const box =
    size === "sm"
      ? "h-6 w-6 text-[9px]"
      : "h-7 w-7 text-[10px]";
  const dot = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-surface",
        box,
        avatarUrl ? "" : "bg-gradient-to-br from-pritio-purple to-pritio-blue font-bold text-white",
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface",
          dot,
          online ? "bg-emerald-500" : "bg-line",
        )}
        title={online ? "En línea" : "Ausente"}
      />
    </span>
  );
}

export function MemberPresenceStack({ workspaceId, profileId }: MemberPresenceStackProps) {
  const members = usePresence(workspaceId, profileId);
  const [open, setOpen] = useState(false);

  if (members.length <= 1) return null;

  const visible = members.slice(0, MAX_VISIBLE);
  const extra = members.length - visible.length;
  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Miembros en línea: ${onlineCount}`}
        aria-expanded={open}
        className="rounded-lg px-0.5 py-1 transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
      >
        <div className="flex items-center -space-x-1.5">
          {visible.map((m) => (
            <PresenceAvatar key={m.userId} name={m.fullName} avatarUrl={m.avatarUrl} online={m.isOnline} />
          ))}
          {extra > 0 && (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[9px] font-bold text-ink-soft ring-2 ring-surface">
              +{extra}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="pritio-menu-enter absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-elevated">
          <p className="px-3.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Miembros
          </p>
          <p className="px-3.5 pb-1 text-[11px] text-ink-muted">
            {onlineCount} de {members.length} en línea
          </p>
          <div className="p-1.5 pb-2">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                <PresenceAvatar name={m.fullName} avatarUrl={m.avatarUrl} online={m.isOnline} size="md" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{m.fullName}</span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-[10px] font-semibold",
                    m.isOnline ? "text-emerald-600" : "text-ink-muted",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", m.isOnline ? "bg-emerald-500" : "bg-line")} />
                  {m.isOnline ? "En línea" : "Ausente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
