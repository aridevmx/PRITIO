import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { createTask } from "@/features/tasks/api";
import { cn } from "@/lib/utils";
import type { CreateTaskPayload, Task } from "@/types";

interface QuickAddProps {
  autoFocus?: boolean;
  variant?: "compact" | "hero";
  className?: string;
  placeholder?: string;
  onExpand?: (task: Task) => void;
}

export function QuickAdd({
  autoFocus,
  variant = "hero",
  className,
  placeholder = "¿Qué necesitas organizar?",
  onExpand,
}: QuickAddProps) {
  const { currentWorkspace, profile } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Task | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = title.trim();
    if (!value || saving) return;
    if (!currentWorkspace || !profile) return;

    setSaving(true);
    const payload: CreateTaskPayload = {
      workspaceId: currentWorkspace.id,
      title: value,
      quadrant: "plan",
      kind: "task",
      inboxed: true,
      createdBy: profile.id,
    };
    try {
      const task = await createTask(payload);
      window.dispatchEvent(
        new CustomEvent("pritio:tasks-changed", {
          detail: { task, workspaceId: task.workspaceId },
        }),
      );
      setTitle("");
      setCreated(task);
      toast.success("Enviada a Inbox");
      timerRef.current = setTimeout(() => setCreated(null), 6000);
    } catch (err) {
      const resource = parsePlanLimitError(err);
      if (resource) {
        openUpgrade(resource);
        return;
      }
      toast.error(err instanceof Error ? err.message : "No se pudo crear la tarea");
    } finally {
      setSaving(false);
    }
  };

  const isHero = variant === "hero";

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="relative">
        <svg
          className={cn(
            "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted",
            isHero ? "h-5 w-5" : "h-4 w-4",
          )}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M10 4V16M4 10H16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          disabled={saving}
          className={cn(
            "w-full rounded-xl border border-line bg-surface text-ink shadow-soft outline-none transition placeholder:text-ink-muted focus:border-pritio-blue focus:ring-2 focus:ring-pritio-blue/25",
            isHero
              ? "rounded-2xl py-3.5 pl-11 pr-12 text-base font-medium"
              : "py-2 pl-9 pr-10 text-sm",
          )}
        />
        <button
          type="submit"
          disabled={!title.trim() || saving}
          aria-label="Enviar a Inbox"
          className={cn(
            "absolute top-1/2 -translate-y-1/2 grid place-items-center rounded-lg bg-ink text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-95",
            isHero ? "right-2 h-9 w-9" : "right-1.5 h-7 w-7",
          )}
        >
          {saving ? (
            <svg className={cn("animate-spin", isHero ? "h-4 w-4" : "h-3.5 w-3.5")} viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.4" />
              <path d="M14.5 8A6.5 6.5 0 018 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className={cn(isHero ? "h-5 w-5" : "h-4 w-4")} viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>

      {created && (
        <div className="animate-fade-in mt-2 flex items-center gap-2 rounded-xl border border-pritio-green/25 bg-pritio-green/5 px-3 py-2 text-sm shadow-soft">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pritio-green/15 text-pritio-green">
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2 5 8.7l4.5-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{created.title}</span>
          {onExpand && (
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                onExpand(created);
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-pritio-blue transition-colors hover:bg-pritio-blue/5"
            >
              Expandir
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/inbox")}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
          >
            Ver en Inbox
          </button>
        </div>
      )}
    </div>
  );
}