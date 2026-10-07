import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { GLOBAL_VIEWS, globalViewFromPath } from "@/components/layout/globalNav";
import { AppIcon } from "@/components/AppIcon";

const MOBILE_VIEWS = GLOBAL_VIEWS.filter((v) =>
  ["inbox", "mi-dia", "cuadrantes", "calendario"].includes(v.key)
);

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = globalViewFromPath(location.pathname);

  return (
    <>
      <nav
        aria-label="General"
        data-tour="vistas"
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="mx-auto flex w-full max-w-[22rem] items-stretch rounded-full border border-line-strong/60 bg-surface/95 px-1.5 shadow-elevated backdrop-blur-2xl ring-1 ring-black/[0.03]">
          {MOBILE_VIEWS.map((view) => {
            const active = activeKey === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => navigate(view.path)}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 py-1.5"
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                    active ? "bg-ink text-white shadow-sm" : "text-ink-soft",
                  )}
                >
                  <AppIcon glyph={view.icon} size="lg" weight={active ? "fill" : "regular"} />
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-[9px] font-semibold leading-none",
                    active ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {view.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}