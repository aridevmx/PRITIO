import { useState } from "react";
import { createPortal } from "react-dom";
import { stripHtml } from "@/lib/utils";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/AppIcon";
import { ArrowsClockwise, Clock, MapPin, Note, X } from "@phosphor-icons/react";

interface MeetingDetail {
  id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  location: string | null;
  description: string | null;
}

interface MeetingDetailModalProps {
  meeting: MeetingDetail;
  onClose: () => void;
  onEdit?: (meeting: MeetingDetail) => void;
  onDeleted?: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function MeetingDetailModal({ meeting, onClose, onEdit, onDeleted }: MeetingDetailModalProps) {
  const timeFormat = useTimeFormat();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Eliminar la junta "${meeting.title}"?`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", meeting.id);
      if (error) throw error;
      toast.success("Junta eliminada");
      onDeleted?.();
    } catch {
      toast.error("Error al eliminar la junta");
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-surface shadow-elevated border border-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pritio-purple/10">
            <AppIcon glyph={Clock} size="lg" className="text-pritio-purple" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-ink truncate">{meeting.title}</h2>
            <p className="text-xs text-ink-muted">Junta</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <AppIcon glyph={X} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <AppIcon glyph={Clock} className="mt-0.5 text-ink-muted" />
            <div>
              <p className="text-sm font-semibold text-ink">
                {formatDate(meeting.start_at)}
              </p>
              {meeting.start_at && (
                <p className="text-xs text-ink-muted">
                  {formatTime(new Date(meeting.start_at), timeFormat)}
                  {meeting.end_at && <> — {formatTime(new Date(meeting.end_at), timeFormat)}</>}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          {stripHtml(meeting.description) && (
            <div className="flex items-start gap-3">
              <AppIcon glyph={Note} className="mt-0.5 text-ink-muted" />
              <p className="text-sm text-ink-soft leading-relaxed">{stripHtml(meeting.description)}</p>
            </div>
          )}

          {/* Location */}
          {meeting.location && (
            <div className="flex items-start gap-3">
              <AppIcon glyph={MapPin} className="mt-0.5 text-ink-muted" />
              <p className="text-sm text-ink-soft">{meeting.location}</p>
            </div>
          )}

          {/* Meeting Link */}
          {meeting.meeting_link && (
            <div className="flex items-start gap-3">
              <AppIcon glyph={ArrowsClockwise} className="mt-0.5 text-ink-muted" />
              <a
                href={meeting.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-pritio-blue underline underline-offset-2 hover:text-pritio-purple transition-colors"
              >
                {meeting.meeting_link}
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        {(onEdit || onDeleted) && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {onDeleted && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-xl border border-pritio-coral/30 px-4 py-2 text-sm font-semibold text-pritio-coral transition-colors hover:bg-pritio-coral/5 disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(meeting)}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
              >
                Editar
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
