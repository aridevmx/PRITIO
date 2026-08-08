import type { DesktopApi } from "@/lib/desktop";

declare global {
  interface Window {
    __PRIO_DESKTOP__?: DesktopApi;
  }
}

export {};
