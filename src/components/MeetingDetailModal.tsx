import { createPortal } from "react-dom";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";

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

export function MeetingDetailModal({ meeting, onClose }: MeetingDetailModalProps) {
  const timeFormat = useTimeFormat();
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-surface shadow-elevated border border-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-prio-purple/10">
            <svg className="h-5 w-5 text-prio-purple" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-ink truncate">{meeting.title}</h2>
            <p className="text-xs text-ink-muted">Junta</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 4.5V8.5L10.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
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
          {meeting.description && (
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5 7H11M5 9.5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <p className="text-sm text-ink-soft leading-relaxed">{meeting.description}</p>
            </div>
          )}

          {/* Location */}
          {meeting.location && (
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6C3.5 9.5 8 14.5 8 14.5C8 14.5 12.5 9.5 12.5 6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <p className="text-sm text-ink-soft">{meeting.location}</p>
            </div>
          )}

          {/* Meeting Link */}
          {meeting.meeting_link && (
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none">
                <path d="M9 4L12 7L9 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 12L4 9L7 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <a
                href={meeting.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-prio-blue underline underline-offset-2 hover:text-prio-purple transition-colors"
              >
                {meeting.meeting_link}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
