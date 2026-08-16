import { useEffect, useState } from "react";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { updateNotificationPreferences } from "@/features/workspaces/api";
import type { NotificationPreferences } from "@/types";
import { useToast } from "@/components/Toast";
import { ToggleRow } from "@/features/account/AccountToggle";
import {
  initializePushNotifications,
  isPushSupported,
  unregisterSubscription,
} from "@/lib/pushNotifications";
import {
  IN_APP_EVENTS,
  getInAppDelivery,
  setInAppDelivery,
  type InAppDelivery,
} from "@/lib/notifInApp";

const DELIVERY_LABELS: Record<InAppDelivery, string> = {
  both: "Campana y toast",
  toast: "Solo toast",
  bell: "Solo campana",
  off: "Desactivado",
};

const DEFAULT_PREFS: NotificationPreferences = {
  email_task_assigned: true,
  email_meeting_created: true,
  email_deadline_approaching: true,
  email_daily_digest: true,
  push_task_assigned: true,
  push_meeting_created: true,
  push_deadline_approaching: true,
  push_task_due_soon: true,
};

export function NotificationsTab() {
  const { currentWorkspace, currentMember, refresh } = useWorkspace();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [inApp, setInApp] = useState<Record<string, InAppDelivery>>({});
  const [saving, setSaving] = useState(false);
  const [pushSupported] = useState(() => isPushSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (currentMember?.notificationPreferences) {
      setPrefs(currentMember.notificationPreferences);
    }
  }, [currentMember]);

  useEffect(() => {
    const next: Record<string, InAppDelivery> = {};
    for (const ev of IN_APP_EVENTS) next[ev.kind] = getInAppDelivery(ev.kind);
    setInApp(next);
  }, []);

  useEffect(() => {
    if (!pushSupported) return;
    let mounted = true;
    navigator.serviceWorker
      .ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (mounted) setPushEnabled(Boolean(subscription));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [pushSupported]);

  async function handleEnablePush() {
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permiso de notificaciones denegado");
        return;
      }
      const ok = await initializePushNotifications();
      setPushEnabled(ok);
      if (ok) {
        toast.success("Notificaciones push activadas en este dispositivo");
      } else {
        toast.error("No se pudo activar las notificaciones push");
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush() {
    setPushBusy(true);
    try {
      const ok = await unregisterSubscription();
      setPushEnabled(!ok);
      if (ok) {
        toast.success("Notificaciones push desactivadas en este dispositivo");
      } else {
        toast.error("Error al desactivar notificaciones");
      }
    } finally {
      setPushBusy(false);
    }
  }

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      await updateNotificationPreferences(currentWorkspace.id, prefs);
      await refresh();
      toast.success("Preferencias de notificación guardadas");
    } catch {
      toast.error("Error al guardar preferencias");
    } finally {
      setSaving(false);
    }
  }

  if (!currentWorkspace) {
    return <p className="py-8 text-center text-sm text-ink-muted">Sin workspace activo.</p>;
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold text-ink-muted">Aplicado al workspace</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{currentWorkspace.name}</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Correo</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <ToggleRow
            label="Tarea asignada"
            checked={prefs.email_task_assigned}
            onChange={() => toggle("email_task_assigned")}
          />
          <ToggleRow
            label="Junta creada"
            checked={prefs.email_meeting_created}
            onChange={() => toggle("email_meeting_created")}
          />
          <ToggleRow
            label="Fecha límite próxima"
            checked={prefs.email_deadline_approaching}
            onChange={() => toggle("email_deadline_approaching")}
          />
          <ToggleRow
            label="Resumen diario"
            checked={prefs.email_daily_digest}
            onChange={() => toggle("email_daily_digest")}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Notificaciones push</p>
        {pushSupported && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-3.5 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Este dispositivo</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                {pushEnabled
                  ? "Suscrito: recibirá avisos aunque la app esté cerrada."
                  : "No está suscrito a notificaciones push."}
              </p>
            </div>
            <button
              type="button"
              onClick={pushEnabled ? handleDisablePush : handleEnablePush}
              disabled={pushBusy}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                pushEnabled
                  ? "bg-ink/80 hover:bg-ink/70"
                  : "bg-pritio-blue hover:bg-pritio-blue/90"
              }`}
            >
              {pushBusy ? "..." : pushEnabled ? "Desactivar" : "Activar"}
            </button>
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          <ToggleRow
            label="Tarea asignada"
            checked={prefs.push_task_assigned}
            onChange={() => toggle("push_task_assigned")}
          />
          <ToggleRow
            label="Junta creada"
            checked={prefs.push_meeting_created}
            onChange={() => toggle("push_meeting_created")}
          />
          <ToggleRow
            label="Fecha límite próxima"
            checked={prefs.push_deadline_approaching}
            onChange={() => toggle("push_deadline_approaching")}
          />
          <ToggleRow
            label="Tarea por vencer"
            checked={prefs.push_task_due_soon}
            onChange={() => toggle("push_task_due_soon")}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">En la app</p>
        <div className="overflow-hidden rounded-xl border border-line divide-y divide-line bg-surface-muted">
          {IN_APP_EVENTS.map((ev) => (
            <div key={ev.kind} className="flex items-center justify-between gap-4 px-3.5 py-3">
              <p className="text-sm font-medium text-ink">{ev.label}</p>
              <select
                aria-label={`Aviso en la app para ${ev.label}`}
                value={inApp[ev.kind] ?? "bell"}
                onChange={(e) => {
                  const v = e.target.value as InAppDelivery;
                  setInApp((prev) => ({ ...prev, [ev.kind]: v }));
                  setInAppDelivery(ev.kind, v);
                }}
                className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5 text-xs font-semibold text-ink outline-none focus:border-pritio-blue"
              >
                {(Object.keys(DELIVERY_LABELS) as InAppDelivery[]).map((d) => (
                  <option key={d} value={d}>
                    {DELIVERY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar preferencias"}
        </button>
      </div>
    </div>
  );
}
